"""ACE-Step music generation engine — GPU box only.

This module is imported ONLY on the L40S (torch + ACE-Step present).
It is never imported by server.py or CI; the Engine is wired in via config
in a later task.  Top-level torch/acestep imports are intentional — they fail
fast with a clear ImportError if someone tries to load this on a non-GPU host.
"""

from __future__ import annotations

import tempfile
import threading
from pathlib import Path

import torch
# TODO(L40S): validate the import path against the installed ACE-Step-1.5 package.
# The canonical repo is https://github.com/ace-step/ACE-Step; adjust if the
# published wheel uses a different top-level name (e.g. `ace_step`).
from acestep.pipeline import ACEStepPipeline  # type: ignore[import]

from app.serving.engine import Engine


class AceStepEngine:
    """Engine Protocol implementation backed by ACE-Step inference.

    One instance is pinned to a single CUDA device.  Use GpuEnginePool
    (gpu_pool.py) to spread load across all visible GPUs.

    Args:
        num_takes_cap: Maximum number of takes to generate per request
            (guards against runaway VRAM usage).
        device: CUDA device string, e.g. ``"cuda:0"``.  Defaults to
            ``"cuda"`` (picks the first available GPU).
        model_path: HuggingFace repo id or local checkpoint directory.
            Defaults to the canonical ACE-Step-1.5 hub repo.
        dtype: Torch dtype for inference.  bfloat16 is preferred on L40S.
    """

    # Engine Protocol attributes
    engine_id: str = "acestep"
    engine_version: str = "acestep-stock-0"

    def __init__(
        self,
        num_takes_cap: int = 4,
        device: str | None = None,
        # TODO(L40S): confirm the correct HuggingFace hub repo id for ACE-Step-1.5.
        model_path: str = "ACE-Step/ACE-Step-v1.5-3.5B",
        dtype: torch.dtype = torch.bfloat16,
    ) -> None:
        self._num_takes_cap = num_takes_cap
        self._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._dtype = dtype
        self._lock = threading.Lock()

        # Load weights into VRAM at init time so the first request is fast.
        # TODO(L40S): validate from_pretrained kwargs against ACE-Step-1.5 API.
        # ACE-Step may expose a different factory (e.g. ACEStepPipeline.load,
        # or a separate ACEStepInferencePipeline class).
        self._pipeline: ACEStepPipeline = ACEStepPipeline.from_pretrained(
            model_path,
            torch_dtype=dtype,
        ).to(self._device)
        self._pipeline.eval()

    # ------------------------------------------------------------------
    # Engine Protocol
    # ------------------------------------------------------------------

    def generate(self, req: dict) -> list[dict]:
        """Run ACE-Step inference and return a list of take dicts.

        Each returned dict matches the schema expected by ``Take`` in
        ``schemas.py``::

            {"audioUri": "file:///tmp/...wav", "durationSec": <int>}

        Args:
            req: Request dict with keys:
                - taggedLyrics (str): Lyrics with structural tags, e.g.
                  ``"[verse] كلمات الأغنية"``.
                - dialect (str): Arabic dialect, e.g. ``"egyptian"``.
                - genre (str): Music genre, e.g. ``"ballad"``.
                - styleTags (list[str]): Free-form style descriptors.
                - voiceGender (str): ``"male"`` or ``"female"``.
                - durationSec (int): Target audio duration in seconds.
                - numTakes (int): Number of variations to generate.

        Returns:
            List of dicts, one per generated take.
        """
        tagged_lyrics: str = req.get("taggedLyrics", "")
        dialect: str = req.get("dialect", "")
        genre: str = req.get("genre", "")
        style_tags: list[str] = req.get("styleTags", [])
        voice_gender: str = req.get("voiceGender", "male")
        duration_sec: int = int(req.get("durationSec", 30))
        num_takes: int = min(int(req.get("numTakes", 1)), self._num_takes_cap)

        # Build a free-text prompt that folds in the structured metadata.
        # TODO(L40S): verify that ACE-Step-1.5 accepts this prompt format vs. a
        # dedicated tags/lyrics kwarg split.  Some builds expect `tags` and
        # `lyrics` as separate arguments rather than a single merged prompt.
        style_descriptor = ", ".join(filter(None, [genre, dialect, voice_gender] + style_tags))
        prompt = f"{style_descriptor}. {tagged_lyrics}".strip(". ")

        takes: list[dict] = []
        for take_idx in range(num_takes):
            wav_path = self._run_inference(
                prompt=prompt,
                tagged_lyrics=tagged_lyrics,
                duration_sec=duration_sec,
                take_idx=take_idx,
            )
            takes.append(
                {
                    "audioUri": wav_path.as_uri(),
                    "durationSec": duration_sec,
                }
            )

        return takes

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _run_inference(
        self,
        prompt: str,
        tagged_lyrics: str,
        duration_sec: int,
        take_idx: int,
    ) -> Path:
        """Call the ACE-Step pipeline and persist the result as a WAV file.

        Returns the absolute path to the written WAV file.
        """
        # Serialise calls per-engine instance; GpuEnginePool round-robins
        # across multiple instances so this lock rarely contends.
        with self._lock:
            # TODO(L40S): validate the exact call signature of ACEStepPipeline.__call__
            # against the ACE-Step-1.5 codebase.  Common kwargs observed in
            # ACE-Step examples include `audio_duration`, `prompt`/`tags`,
            # `lyrics`, `infer_steps`, and `guidance_scale`.
            result = self._pipeline(
                prompt=prompt,
                lyrics=tagged_lyrics,
                audio_duration=float(duration_sec),
                # Vary seed per take so each is an independent variation.
                generator=torch.Generator(device=self._device).manual_seed(take_idx),
                # TODO(L40S): expose infer_steps + guidance_scale as engine params
                # once the L40S integration is validated.
                infer_steps=60,
                guidance_scale=7.5,
            )

        # TODO(L40S): validate the output format of ACEStepPipeline.
        # Possible shapes:
        #   - result.audios  -> torch.Tensor [batch, channels, samples]
        #   - result.audio   -> numpy ndarray
        #   - result          -> list[bytes] (raw wav bytes)
        # Adjust the extraction below once confirmed on L40S.
        audio_tensor: torch.Tensor = result.audios[0]  # [C, T]
        sample_rate: int = getattr(result, "sample_rate", 44100)

        return _write_wav(audio_tensor, sample_rate)


# ---------------------------------------------------------------------------
# WAV helper (no soundfile dependency — uses torchaudio which ships with torch)
# ---------------------------------------------------------------------------

def _write_wav(audio: torch.Tensor, sample_rate: int) -> Path:
    """Write *audio* tensor to a temporary WAV file and return its Path."""
    # torchaudio is bundled with torch on the GPU box; lazy import here
    # avoids a top-level import that would fail on CI.
    try:
        import torchaudio  # type: ignore[import]
        _write = _write_via_torchaudio
    except ImportError:
        # Fallback: raw scipy/soundfile — also GPU-box-only but worth trying.
        _write = _write_via_scipy  # type: ignore[assignment]

    return _write(audio, sample_rate)


def _write_via_torchaudio(audio: torch.Tensor, sample_rate: int) -> Path:
    import torchaudio  # type: ignore[import]

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    path = Path(tmp.name)
    # Ensure shape is [C, T] (torchaudio expects channel-first)
    if audio.ndim == 1:
        audio = audio.unsqueeze(0)
    torchaudio.save(str(path), audio.cpu().float(), sample_rate)
    return path


def _write_via_scipy(audio: torch.Tensor, sample_rate: int) -> Path:
    import numpy as np
    import scipy.io.wavfile as wavfile  # type: ignore[import]

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    path = Path(tmp.name)
    arr = audio.cpu().float().numpy()
    if arr.ndim > 1:
        arr = arr.T  # scipy wants [samples, channels]
    wavfile.write(str(path), sample_rate, arr)
    return path

"""Fake AI-backend entry-point for local dev (no GPU).

Starts the real HTTP contract (POST /generate) wired to FakeEngine, plus:
  GET /audio/canned.wav  — short silence WAV generated in-memory
  GET /healthz           — liveness probe for docker-compose

Run:
    uvicorn app.serving.fake_main:app --host 0.0.0.0 --port 9000
"""

import io
import math
import struct
import wave

from fastapi import FastAPI
from fastapi.responses import Response

from app.serving.fake_engine import FakeEngine
from app.serving.server import create_app

# Build the main app (POST /generate + auth middleware)
app: FastAPI = create_app(FakeEngine())


def _make_canned_wav(duration_sec: float = 2.0, sample_rate: int = 44100) -> bytes:
    """Generate a short, quiet sine-wave WAV entirely in memory."""
    n_samples = int(sample_rate * duration_sec)
    amplitude = 1000  # quiet — well below int16 max of 32767
    frequency = 440.0  # 440 Hz sine

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        frames = struct.pack(
            f"<{n_samples}h",
            *(
                int(amplitude * math.sin(2 * math.pi * frequency * i / sample_rate))
                for i in range(n_samples)
            ),
        )
        wf.writeframes(frames)

    return buf.getvalue()


_CANNED_WAV: bytes = _make_canned_wav()


@app.get("/audio/canned.wav")
def canned_wav() -> Response:
    return Response(content=_CANNED_WAV, media_type="audio/wav")


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}

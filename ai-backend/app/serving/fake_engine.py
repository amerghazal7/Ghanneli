"""Local fake music engine — no GPU required.

Returns canned WAV URIs for every take.  Satisfies the Engine protocol.
"""

import os


class FakeEngine:
    engine_id: str = "fake-local"
    engine_version: str = "fake-0"

    def generate(self, req: dict) -> list[dict]:
        base = os.environ.get("FAKE_ENGINE_PUBLIC_URL", "http://localhost:9000").rstrip("/")
        audio_uri = f"{base}/audio/canned.wav"
        num_takes = max(1, req.get("numTakes", 1))
        return [
            {"audioUri": audio_uri, "durationSec": req["durationSec"]}
            for _ in range(num_takes)
        ]

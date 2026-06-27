from fastapi.testclient import TestClient
from app.serving.server import create_app


class FakeEngine:
    engine_id = "acestep"
    engine_version = "stock-0"

    def generate(self, req):
        return [{"audioUri": "file:///t.wav", "durationSec": req["durationSec"]}]


def test_generate_returns_takes():
    c = TestClient(create_app(FakeEngine()))
    r = c.post(
        "/generate",
        json={
            "taggedLyrics": "[verse] mock",
            "transliteration": "mock",
            "styleTags": ["ballad"],
            "dialect": "egyptian",
            "genre": "ballad",
            "voiceGender": "male",
            "durationSec": 60,
            "numTakes": 1,
        },
    )
    assert r.status_code == 200 and len(r.json()["takes"]) == 1
    assert r.json()["engineVersion"] == "stock-0"

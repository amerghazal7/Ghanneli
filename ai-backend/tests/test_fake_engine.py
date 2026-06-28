"""Tests for the local fake music engine (LOCAL.4)."""

from fastapi.testclient import TestClient

from app.serving.fake_main import app

client = TestClient(app)

VALID_REQUEST = {
    "taggedLyrics": "[verse] test",
    "transliteration": "test",
    "styleTags": ["pop"],
    "dialect": "egyptian",
    "genre": "pop",
    "voiceGender": "female",
    "durationSec": 30,
    "numTakes": 2,
}


def test_generate_returns_correct_takes():
    r = client.post("/generate", json=VALID_REQUEST)
    assert r.status_code == 200
    body = r.json()
    assert body["engineId"] == "fake-local"
    assert body["engineVersion"] == "fake-0"
    takes = body["takes"]
    assert len(takes) == VALID_REQUEST["numTakes"]
    for take in takes:
        assert take["audioUri"].endswith("/audio/canned.wav")
        assert take["audioUri"]  # non-empty
        assert take["durationSec"] == VALID_REQUEST["durationSec"]


def test_canned_wav_endpoint():
    r = client.get("/audio/canned.wav")
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    body = r.content
    assert len(body) > 0
    # RIFF....WAVE header
    assert body[:4] == b"RIFF"
    assert body[8:12] == b"WAVE"


def test_healthz():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

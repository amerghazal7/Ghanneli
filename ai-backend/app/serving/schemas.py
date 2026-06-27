"""Pydantic v2 request/response models matching the TS MusicRequest contract."""

from pydantic import BaseModel


class MusicRequest(BaseModel):
    taggedLyrics: str
    transliteration: str
    styleTags: list[str]
    dialect: str
    genre: str
    bpm: int | None = None
    voiceGender: str
    voiceProfileId: str | None = None
    durationSec: int
    numTakes: int


class Take(BaseModel):
    audioUri: str
    durationSec: int


class GenerateResponse(BaseModel):
    takes: list[Take]
    engineId: str
    engineVersion: str

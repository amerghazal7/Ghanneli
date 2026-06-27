"""FastAPI application factory with dependency-injected engine."""

import os

from fastapi import FastAPI, Header, HTTPException

from app.serving.engine import Engine
from app.serving.schemas import GenerateResponse, MusicRequest, Take


def create_app(engine: Engine) -> FastAPI:
    app = FastAPI(title="Ghanneli AI Backend")

    _token = os.environ.get("AIBACKEND_TOKEN") or ""

    @app.post("/generate", response_model=GenerateResponse)
    def generate(
        request: MusicRequest,
        x_aibackend_token: str | None = Header(default=None),
    ) -> GenerateResponse:
        if _token and x_aibackend_token != _token:
            raise HTTPException(status_code=401, detail="Unauthorized")

        raw_takes: list[dict] = engine.generate(request.model_dump())
        takes = [Take(**t) for t in raw_takes]
        return GenerateResponse(
            takes=takes,
            engineId=engine.engine_id,
            engineVersion=engine.engine_version,
        )

    return app

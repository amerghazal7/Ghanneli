"""Cloud production serving for the Ghanneli ACE-Step engine (Modal).

This packages the SAME serving code (`app.serving`) that runs on the L40S lab
and exposes a synchronous `POST /generate` web endpoint with Bearer auth — the
shape the App-side `AceStepCloudProd` adapter expects. Promotion flow: a
checkpoint validated on the L40S is published, ACTIVE_ENGINE_VERSION is bumped,
and this app is redeployed with `modal deploy ai-backend/modal_app.py`.

Phase-1 value: serves the stock model, proving the lab->cloud promotion path.
This file is deployed on Modal (GPU + account required) and is NOT runnable on
the dev box; the `# TODO(cloud)` markers flag what to confirm at deploy time.
"""
from __future__ import annotations

import os

import modal

# Reuse the project's package so cloud and lab serve identical logic.
image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .pip_install("fastapi", "uvicorn", "pydantic>=2")
    # TODO(cloud): install torch (cu124) + ACE-Step exactly as ai-backend/Dockerfile does,
    # and add the package source (.add_local_python_source / mount) so app.serving imports.
    .pip_install("torch==2.4.1+cu124", "torchaudio==2.4.1+cu124",
                 extra_options="--extra-index-url https://download.pytorch.org/whl/cu124")
)

app = modal.App("ghanneli-aibackend")

# Bearer token for the cloud endpoint; stored as a Modal secret, mirrored into
# Secret Manager (cloud-engine-token) so the App can authenticate.
auth_secret = modal.Secret.from_name("ghanneli-cloud-engine")


@app.function(image=image, gpu="L40S", secrets=[auth_secret], timeout=600)
@modal.asgi_app()
def fastapi_app():
    from fastapi import Depends, Header, HTTPException

    # TODO(cloud): construct the real engine/pool on GPU at cold start.
    from app.serving.acestep_engine import AceStepEngine
    from app.serving.server import create_app

    token = os.environ.get("CLOUD_ENGINE_TOKEN", "")

    def require_bearer(authorization: str = Header(default="")):
        if token and authorization != f"Bearer {token}":
            raise HTTPException(status_code=401, detail="unauthorized")

    fastapi = create_app(AceStepEngine())
    # Enforce Bearer auth on every route (the App sends `Authorization: Bearer <token>`).
    fastapi.router.dependencies.append(Depends(require_bearer))
    return fastapi

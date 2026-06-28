# Ghanneli AIBackend

FastAPI ACE-Step inference service for Ghanneli. Runs as the **model lab / staging**
environment on a self-hosted 4× L40S GPU box; the same image is promoted to cloud
production once a checkpoint is validated.

- `app/serving/server.py` — `create_app(engine)` exposing `POST /generate`.
- `app/serving/engine.py` — the `Engine` protocol.
- `app/serving/acestep_engine.py` — real ACE-Step engine (GPU only; see `# TODO(L40S)` markers).
- `app/serving/gpu_pool.py` — one engine pinned per visible GPU, round-robin.
- `Dockerfile` — CUDA image, built on the L40S.

## Local dev (no GPU)

```bash
cd ai-backend
python -m pip install -e ".[test]"
python -m pytest -q          # GPU test is skipped without CUDA
```

## L40S provisioning

Provisioned by `infra/ansible` (GPU driver + CUDA + Docker + NVIDIA Container
Toolkit + cloudflared) and fronted by a Cloudflare Tunnel from
`infra/terraform/cloudflare_tunnel.tf`. The container listens on `:8000`; no
inbound ports are opened — traffic arrives only through the tunnel.

## Manual smoke test (after provisioning)

From the **App** box (or any host that can resolve the tunnel hostname), confirm
the lab serves `/generate` through the tunnel with the shared token:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "X-AIBackend-Token: $AIBACKEND_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"taggedLyrics":"[verse] اختبار","transliteration":"ikhtibar","styleTags":["ballad"],"dialect":"egyptian","genre":"ballad","voiceGender":"male","durationSec":15,"numTakes":1}' \
  https://lab.<domain>/generate
```

Expected: `200`. A `401` means the token is missing/wrong; a `5xx` means the
engine failed to load (check `docker logs ghanneli-aibackend`).

## Cloud production (Modal)

`modal_app.py` packages the **same** `app.serving` code as a GPU web endpoint so
cloud production and the L40S lab serve identical logic. Deploy:

```bash
modal deploy ai-backend/modal_app.py
```

This prints an HTTPS endpoint. Store it + the bearer token as Secret Manager
versions (`cloud-engine-url`, `cloud-engine-token` from
`infra/terraform/cloud_engine.tf`); Cloud Run injects them as `CLOUD_ENGINE_URL`
/ `CLOUD_ENGINE_TOKEN`, which the App's `AceStepCloudProd` adapter uses.

**Promotion / release:** validate a checkpoint on the L40S, bump
`ACTIVE_ENGINE_VERSION`, then `modal deploy` to release. Roll back by redeploying
the previous version. The App stamps `ACTIVE_ENGINE_VERSION` onto every song for
provenance (`getActiveEngineVersion()`).


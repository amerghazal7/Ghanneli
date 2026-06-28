# Local Dev Stack

Full local development environment for the Ghanneli Arabic AI gift-song app.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v4.x+)
- `stripe` CLI (optional — needed only for webhook forwarding)

---

## Quick Start

```bash
# 1. Copy the env template
cp .env.local.example .env.local

# 2. Fill in the two real secrets (the rest are pre-filled for local use):
#    ANTHROPIC_API_KEY  — get from https://console.anthropic.com/
#    STRIPE_SECRET_KEY  — get from https://dashboard.stripe.com/test/apikeys
#    STRIPE_WEBHOOK_SECRET — see Stripe Webhooks section below

# 3. Build and start everything
docker compose up --build
```

The web app is available at **http://localhost:3000** once all services are healthy (typically ~60 s on first run).

---

## Services

| Service | Host port | Purpose |
|---|---|---|
| `postgres` | — (internal) | PostgreSQL 16 — local DB |
| `neon-proxy` | 4444 | Local Neon HTTP proxy — routes neon-http driver to local Postgres |
| `redis` | — (internal) | Redis 7 — BullMQ job queue |
| `minio` | 9000, 9001 | S3-compatible object store (replaces Cloudflare R2) |
| `minio-setup` | — | One-shot bucket init (runs and exits) |
| `fake-engine` | 9002 | Fake GPU music engine — returns canned WAV, no GPU needed |
| `firebase-emulator` | 9099, 4000 | Firebase Auth emulator + UI |
| `web` | **3000** | Next.js application |
| `worker` | — | BullMQ worker (`pnpm worker`) |

MinIO console: **http://localhost:9001** (user: `minioadmin`, password: `minioadmin`)
Firebase emulator UI: **http://localhost:4000**

---

## What is Real vs Fake vs Local

| Component | Mode | Notes |
|---|---|---|
| Anthropic API (lyrics) | **REAL** | Requires your `ANTHROPIC_API_KEY` |
| Stripe payments | **REAL test-mode** | Use Stripe test card `4242 4242 4242 4242` |
| Firebase Auth | **REAL emulator** | Full Auth emulator — tokens are valid JWT |
| GPU music engine | **FAKE** | Canned WAV returned instantly — no GPU |
| PostgreSQL | **LOCAL** | Postgres 16 in Docker |
| Object storage | **LOCAL** | MinIO in Docker — path-style, public bucket |
| Redis / BullMQ | **LOCAL** | Redis 7 in Docker |
| Pub/Sub analytics | **NO-OP** | Emit failures are swallowed — expected locally |

---

## Database Migrations

Drizzle migrations run against local Postgres through the Neon HTTP proxy (`neon-proxy`).

**Option A — run migrations from host (recommended):**

```bash
# In a separate terminal, with services running:
DATABASE_URL=postgresql://ghanneli:ghanneli@localhost:5432/ghanneli \
  pnpm -C app db:migrate
```

**Option B — one-off migrate service (add to docker-compose.yml if preferred):**

```yaml
migrate:
  build: { context: ., dockerfile: app/Dockerfile.web }
  env_file: .env.local
  command: pnpm -C app db:migrate
  depends_on:
    postgres:
      condition: service_healthy
  restart: "no"
```

The `web` service entrypoint does NOT auto-migrate — run migrations explicitly before or after the first `docker compose up`.

---

## Stripe Webhooks (local)

The Stripe CLI forwards webhook events from Stripe's test servers to your local app:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the webhook signing secret it prints and set it as `STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart:

```bash
docker compose restart web
```

---

## Firebase Auth Emulator

The `firebase-emulator` service runs `firebase emulators:start --only auth --project demo-ghanneli`. The app's `FIREBASE_AUTH_EMULATOR_HOST=firebase-emulator:9099` env var tells `firebase-admin` to hit the emulator automatically — no real Firebase project is needed.

**Alternative (host-side emulator):** If the Docker image is unavailable, install the Firebase CLI locally and run:

```bash
firebase emulators:start --only auth --project demo-ghanneli
```

Then change `.env.local`:

```
FIREBASE_AUTH_EMULATOR_HOST=host.docker.internal:9099
```

and remove the `firebase-emulator` service + its `depends_on` entries.

---

## MinIO (local R2)

The `minio-setup` service creates the `ghanneli-local` bucket and sets anonymous download policy so the browser can fetch preview/full audio directly from `http://localhost:9000/ghanneli-local/<key>`.

The `R2_ENDPOINT=http://minio:9000` env var triggers `forcePathStyle: true` in the S3 client (required by MinIO). `R2_PUBLIC_BASE_URL=http://localhost:9000/ghanneli-local` is the browser-reachable base URL for audio links.

---

## Watermark Asset

A placeholder silent WAV (0.1 s, 44100 Hz mono) is committed at `app/assets/watermark.mp3`. The `Dockerfile.worker` includes it at `/workspace/app/assets/watermark.mp3`, matching `WATERMARK_ASSET_PATH` in `.env.local`.

To use a real watermark, replace `app/assets/watermark.mp3` with any valid mp3/wav file and rebuild the worker image.

---

## Smoke Test Walkthrough (End-to-End)

After `docker compose up --build` and migrations:

1. **Sign in** — open http://localhost:3000, sign in via Firebase Auth (emulator). Create any test account; no real email is needed.
2. **Wizard** — complete the gift-song wizard (recipient details, dialect, tone, occasion).
3. **Create song** — submit the form → `POST /api/songs` creates a song row with `status=pending` and enqueues a BullMQ job.
4. **Worker picks the job** — the `worker` service pulls the job from Redis. Check logs: `docker compose logs -f worker`.
5. **Lyrics generated** — the Anthropic API (real) generates Arabic lyrics for the song.
6. **Fake engine returns canned WAV** — the `fake-engine` service immediately returns a canned WAV URI (no GPU, ~instant).
7. **Post-process** — the worker runs ffmpeg: loudnorm + MP3 encode (full track) + 30 s trim + watermark overlay (preview).
8. **Upload to MinIO** — full and preview MP3s are uploaded to the `ghanneli-local` bucket.
9. **Status flips to ready** — song row updated: `status=ready`, `previewUri` and `fullUri` populated.
10. **Preview plays** — the app serves the watermarked 30-second preview from `http://localhost:9000/ghanneli-local/...`.
11. **Buy credits** — click "Buy credits", use Stripe test card `4242 4242 4242 4242`. Stripe CLI forwards the `checkout.session.completed` webhook → credits added to ledger.
12. **Unlock** — `POST /api/songs/:id/unlock` debits one credit, sets `unlocked=true`, returns `fullUri`.
13. **Full audio plays** — the unwatermarked full MP3 streams from MinIO.

---

## Pub/Sub Analytics

`PUBSUB_PROJECT` and `PUBSUB_TOPIC` are set in `.env.local` but Pub/Sub is not running locally. The analytics `emit()` function swallows publish errors — you will see `[analytics] publish failed` in logs. This is **expected and harmless**. Analytics events are a no-op locally.

To enable Pub/Sub locally, add a `pubsub-emulator` service (e.g. `gcr.io/google.com/cloudsdktool/google-cloud-cli` running `gcloud beta emulators pubsub start`) and set `PUBSUB_EMULATOR_HOST`.

---

## Stopping / Resetting

```bash
# Stop all services
docker compose down

# Stop and delete volumes (full reset — DB + MinIO data wiped)
docker compose down -v
```

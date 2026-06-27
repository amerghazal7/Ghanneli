# Ghanneli MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Ghanneli MVP — a web app that turns personal details into a custom Arabic gift song (dialect/genre presets, free watermarked preview, credit-pack unlock, shareable song page), served from cloud GPU, with a self-hostable L40S model lab wired in for fine-tuning/staging.

**Architecture:** Monorepo with two parts. **`/app`** (Next.js on Cloud Run) holds business logic and three pluggable model interfaces (`LyricsService`, `MusicGenerationService`, `VoiceConversionService`). **`/ai-backend`** (FastAPI on the 4× L40S server) is the model lab: serves candidate ACE-Step versions and runs fine-tuning. Production music inference runs on cloud GPU (`AceStepCloudProd`); the L40S serves staging candidates (`AceStepSelfHostStaging`). Generation is async (Cloud Tasks → worker). Events flow to BigQuery for the analytics flywheel.

**Tech Stack:** TypeScript, Next.js 15 (App Router), Vercel AI SDK (`ai` + `@ai-sdk/*`), Zod, Drizzle ORM + Postgres (Neon), Firebase Auth, Stripe, Google Cloud (Cloud Run, Cloud Tasks, Pub/Sub, BigQuery, Secret Manager), Cloudflare R2 + Tunnel, Terraform, Python 3.11 + FastAPI + PyTorch (AIBackend), Ansible, Docker, Vitest (TS) + pytest (Py), GitHub Actions.

## Global Constraints

- **Language/runtime floors:** Node ≥ 20; Python ≥ 3.11; Next.js 15 (App Router, RSC); TypeScript strict mode on.
- **No artist names anywhere** in UI, prompts, presets, copy, or data (legal — spec §11/D2). Styles are genre/dialect only.
- **MVP does not fine-tune or scrape**; production serves stock ACE-Step on cloud. The L40S lab is stood up but ships no custom model in Phase 1.
- **Engine-blind app:** App code never imports a concrete engine — only the `MusicGenerationService` interface + config-driven router. Same `MusicRequest`/`MusicResult` for cloud and self-host.
- **Provenance on every song:** persist `engineId`, `engineVersion`, `lyricsModel`.
- **Privacy:** analytics events carry IDs/choices, never the raw personal "story" text. No user PII persisted on the L40S server.
- **Dialects (presets):** `khaleeji | egyptian | levantine | maghrebi | iraqi`. **Voice gender:** `male | female`.
- **Money:** all amounts stored as integer minor units (e.g. cents); never floats. Credits are integers.
- **TDD:** every task is test-first. **Commit** after each green task. **DRY / YAGNI.**
- **Secrets** come from Secret Manager / env, never committed. `.env.example` is the contract.

---

## Monorepo file structure (created in Slice 1)

```
/                         # repo root
  package.json            # pnpm workspace root
  pnpm-workspace.yaml
  turbo.json              # task runner (optional, lightweight)
  .github/workflows/      # CI/CD
  /app                    # Next.js business logic
    /src
      /app                # routes (App Router)
      /components         # UI (wizard, player, share)
      /server             # orchestration, services, db
        /services
          lyrics/         # LyricsService (Vercel AI SDK)
          music/          # MusicGenerationService + adapters + router
          storage/        # R2 client
          credits/        # credit ledger
          analytics/      # event emitter
        /db               # Drizzle schema + migrations
        /jobs             # Cloud Tasks enqueue + worker handler
      /lib                # shared utils, types, zod schemas
    /tests
  /ai-backend             # FastAPI model lab (Python)
    /app
      serving/            # FastAPI inference server
      training/           # fine-tune scripts (Phase 2 scaffolding)
      eval/               # eval harness (Phase 2 scaffolding)
    /tests
    pyproject.toml
    Dockerfile
  /infra
    /terraform            # GCP + Cloudflare + Neon
    /ansible              # L40S server provisioning
  /docs                   # specs, plans, SRS, UML (this directory)
```

---

# SLICE 1 — Foundation (monorepo, tooling, infra base, CI)

**Deliverable:** A monorepo that installs, lints, type-checks, runs an empty test suite green in CI, and a Terraform base that `plan`s clean. No product behavior yet.

### Task 1.1: Initialize pnpm monorepo + tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.editorconfig`, `.nvmrc`
- Create: `app/package.json`, `app/tsconfig.json`
- Test: `app/tests/smoke.test.ts`

**Interfaces:**
- Produces: pnpm workspace with `app` package; `pnpm test` runs Vitest; `pnpm lint`/`pnpm typecheck` wired.

- [ ] **Step 1: Write the failing smoke test**
```ts
// app/tests/smoke.test.ts
import { describe, it, expect } from 'vitest'
describe('toolchain', () => {
  it('runs vitest', () => { expect(1 + 1).toBe(2) })
})
```
- [ ] **Step 2: Run to verify it fails (no vitest yet)**
Run: `pnpm -C app test`
Expected: FAIL — vitest not found.
- [ ] **Step 3: Add workspace + app package config**
`pnpm-workspace.yaml`:
```yaml
packages:
  - app
  - ai-backend
```
`app/package.json` (minimal):
```json
{
  "name": "@ghanneli/app",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "devDependencies": { "vitest": "^2", "typescript": "^5", "eslint": "^9", "@types/node": "^20" }
}
```
- [ ] **Step 4: Install and run the test green**
Run: `pnpm install && pnpm -C app test`
Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "chore: initialize pnpm monorepo + vitest toolchain"
```

### Task 1.2: Scaffold the Next.js app shell with RTL/i18n base

**Files:**
- Create: `app/next.config.ts`, `app/src/app/layout.tsx`, `app/src/app/page.tsx`, `app/src/lib/i18n.ts`
- Test: `app/tests/layout.test.tsx`

**Interfaces:**
- Produces: an App-Router app rendering `<html dir="rtl" lang="ar">`; `t(key)` i18n helper returning Arabic strings.

- [ ] **Step 1: Failing test for RTL root + i18n**
```tsx
// app/tests/layout.test.tsx
import { t } from '../src/lib/i18n'
import { describe, it, expect } from 'vitest'
describe('i18n', () => {
  it('returns Arabic for known key', () => { expect(t('app.name')).toBe('غنّيلي') })
})
```
- [ ] **Step 2: Run — fails (i18n missing)**
Run: `pnpm -C app test layout`
Expected: FAIL — cannot find `../src/lib/i18n`.
- [ ] **Step 3: Implement i18n + layout**
```ts
// app/src/lib/i18n.ts
const ar = { 'app.name': 'غنّيلي', 'wizard.title': 'اصنع أغنيتك' } as const
export type MsgKey = keyof typeof ar
export const t = (k: MsgKey): string => ar[k]
```
```tsx
// app/src/app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html dir="rtl" lang="ar"><body>{children}</body></html>)
}
```
- [ ] **Step 4: Run green**
Run: `pnpm -C app test layout`
Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat(app): RTL app shell + Arabic i18n base"
```

### Task 1.3: Terraform base (project, APIs, state bucket, Secret Manager)

**Files:**
- Create: `infra/terraform/main.tf`, `infra/terraform/providers.tf`, `infra/terraform/variables.tf`, `infra/terraform/backend.tf`, `infra/terraform/secrets.tf`, `infra/terraform/terraform.tfvars.example`

**Interfaces:**
- Produces: enabled GCP APIs (run, cloudtasks, pubsub, bigquery, secretmanager), a GCS state bucket, and named secrets (placeholders): `stripe-secret`, `anthropic-key`, `r2-credentials`, `aibackend-token`.

- [ ] **Step 1: Author providers + variables**
```hcl
# infra/terraform/providers.tf
terraform { required_providers {
  google = { source = "hashicorp/google", version = "~> 6.0" }
  cloudflare = { source = "cloudflare/cloudflare", version = "~> 4.0" }
} }
provider "google" { project = var.project_id, region = var.region }
```
```hcl
# infra/terraform/variables.tf
variable "project_id" { type = string }
variable "region" { type = string, default = "europe-west1" }
```
- [ ] **Step 2: Enable APIs + secrets (no real values)**
```hcl
# infra/terraform/main.tf
locals { apis = ["run","cloudtasks","pubsub","bigquery","secretmanager","artifactregistry"] }
resource "google_project_service" "svc" {
  for_each = toset(local.apis)
  service  = "${each.value}.googleapis.com"
}
```
```hcl
# infra/terraform/secrets.tf
resource "google_secret_manager_secret" "s" {
  for_each = toset(["stripe-secret","anthropic-key","r2-credentials","aibackend-token"])
  secret_id = each.value
  replication { auto {} }
}
```
- [ ] **Step 3: Validate**
Run: `cd infra/terraform && terraform init -backend=false && terraform validate`
Expected: "Success! The configuration is valid."
- [ ] **Step 4: Commit**
```bash
git add infra/terraform && git commit -m "infra: terraform base (apis, state, secrets)"
```

### Task 1.4: CI pipeline (lint, typecheck, test for app + ai-backend)

**Files:**
- Create: `.github/workflows/ci.yml`, `ai-backend/pyproject.toml`, `ai-backend/tests/test_smoke.py`

- [ ] **Step 1: Failing Python smoke test**
```python
# ai-backend/tests/test_smoke.py
def test_smoke(): assert 1 + 1 == 2
```
- [ ] **Step 2: pyproject + run locally**
```toml
# ai-backend/pyproject.toml
[project]
name = "ghanneli-aibackend"
version = "0.1.0"
requires-python = ">=3.11"
[tool.pytest.ini_options]
testpaths = ["tests"]
```
Run: `cd ai-backend && python -m pytest -q`
Expected: 1 passed.
- [ ] **Step 3: CI workflow**
```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install
      - run: pnpm -C app typecheck && pnpm -C app test
  aibackend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: cd ai-backend && pip install pytest && python -m pytest -q
```
- [ ] **Step 4: Commit + push, verify CI green**
```bash
git add -A && git commit -m "ci: lint/typecheck/test for app and ai-backend" && git push
```
Expected: GitHub Actions both jobs green.

---

# SLICE 2 — AIBackend lab + cloud production serving

**Deliverable:** A FastAPI ACE-Step inference server (runnable on L40S via Docker), the same image deployable to cloud, and the App-side `MusicGenerationService` interface + two adapters + config router, all tested with the live engine mocked.

### Task 2.1: Define the engine contract (shared types)

**Files:**
- Create: `app/src/server/services/music/types.ts`
- Test: `app/tests/music/types.test.ts`

**Interfaces:**
- Produces:
```ts
export type Dialect = 'khaleeji'|'egyptian'|'levantine'|'maghrebi'|'iraqi'
export interface MusicRequest {
  taggedLyrics: string; transliteration: string;
  styleTags: string[]; dialect: Dialect; genre: string;
  bpm?: number; voiceGender: 'male'|'female';
  voiceProfileId?: string; durationSec: number; numTakes: number;
}
export interface MusicTake { audioUri: string; durationSec: number; score?: number }
export interface MusicResult { takes: MusicTake[]; engineId: string; engineVersion: string; meta?: Record<string,unknown> }
export interface MusicGenerationService { generate(req: MusicRequest): Promise<MusicResult> }
```

- [ ] **Step 1: Failing test — Zod schema validates a request**
```ts
// app/tests/music/types.test.ts
import { MusicRequestSchema } from '../../src/server/services/music/types'
import { it, expect } from 'vitest'
it('rejects empty lyrics', () => {
  expect(() => MusicRequestSchema.parse({ taggedLyrics:'', transliteration:'', styleTags:[], dialect:'egyptian', genre:'ballad', voiceGender:'male', durationSec:60, numTakes:2 })).toThrow()
})
```
- [ ] **Step 2: Run — fails (no module).** Run: `pnpm -C app test music/types` → FAIL.
- [ ] **Step 3: Implement types + Zod schema** (interfaces above plus `MusicRequestSchema` with `taggedLyrics: z.string().min(1)`, `numTakes: z.number().int().min(1).max(4)`, `dialect: z.enum([...])`).
- [ ] **Step 4: Run green.** Run: `pnpm -C app test music/types` → PASS.
- [ ] **Step 5: Commit** `feat(music): engine contract + zod schema`.

### Task 2.2: FastAPI inference server (ACE-Step wrapper) with a fake engine

**Files:**
- Create: `ai-backend/app/serving/server.py`, `ai-backend/app/serving/engine.py`, `ai-backend/app/serving/schemas.py`
- Test: `ai-backend/tests/test_serving.py`

**Interfaces:**
- Produces HTTP `POST /generate` accepting the `MusicRequest` shape → `{takes:[{audioUri,durationSec}], engineId, engineVersion}`. Engine injected (`Engine` protocol: `engine_id`, `engine_version`, `generate(req)->list[take]`) so tests use a fake without a GPU.

- [ ] **Step 1: Failing test with TestClient + fake engine**
```python
# ai-backend/tests/test_serving.py
from fastapi.testclient import TestClient
from app.serving.server import create_app
class FakeEngine:
    engine_id="acestep"; engine_version="stock-0"
    def generate(self, req): return [{"audioUri":"file:///t.wav","durationSec":req["durationSec"]}]
def test_generate_returns_takes():
    c = TestClient(create_app(FakeEngine()))
    r = c.post("/generate", json={"taggedLyrics":"[verse] mock","transliteration":"mock","styleTags":["ballad"],"dialect":"egyptian","genre":"ballad","voiceGender":"male","durationSec":60,"numTakes":1})
    assert r.status_code==200 and len(r.json()["takes"])==1
    assert r.json()["engineVersion"]=="stock-0"
```
- [ ] **Step 2: Run — fails.** `cd ai-backend && python -m pytest tests/test_serving.py -q` → FAIL.
- [ ] **Step 3: Implement `create_app(engine)`** with Pydantic schemas, optional `X-AIBackend-Token` auth (compared to env; skipped if unset), route mapping request→engine→`MusicResult` shape.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(aibackend): FastAPI /generate with injectable engine`.

### Task 2.3: Real ACE-Step engine + GPU worker pool (integration-guarded)

**Files:**
- Create: `ai-backend/app/serving/acestep_engine.py`, `ai-backend/Dockerfile`, `ai-backend/app/serving/gpu_pool.py`
- Test: `ai-backend/tests/test_acestep_engine.py` (marked `@pytest.mark.gpu`, skipped without CUDA)

**Interfaces:**
- Produces `AceStepEngine` implementing the `Engine` protocol; one model instance pinned per visible GPU via `gpu_pool` (round-robin), models warm in VRAM.

- [ ] **Step 1: GPU test, skipped without CUDA**
```python
import pytest, torch
pytestmark = pytest.mark.skipif(not torch.cuda.is_available(), reason="no GPU")
def test_acestep_smoke():
    from app.serving.acestep_engine import AceStepEngine
    eng = AceStepEngine(num_takes_cap=1)
    takes = eng.generate({"taggedLyrics":"[verse] اختبار","transliteration":"ikhtibar","styleTags":["ballad"],"dialect":"egyptian","genre":"ballad","voiceGender":"male","durationSec":15,"numTakes":1})
    assert takes and takes[0]["audioUri"].endswith(".wav")
```
- [ ] **Step 2: Run on a non-GPU dev box** → SKIPPED (expected); on the L40S → runs.
- [ ] **Step 3: Implement `AceStepEngine`** loading ACE-Step weights, generating WAV to a temp/R2 path; implement `gpu_pool` assigning jobs to free GPUs.
- [ ] **Step 4: Dockerfile** (CUDA base + NVIDIA toolkit, installs ACE-Step, runs uvicorn). Build on the L40S: `docker build -t ghanneli-aibackend .`
- [ ] **Step 5: Commit** `feat(aibackend): real ACE-Step engine + per-GPU pool + Dockerfile`.

### Task 2.4: App-side adapters — `AceStepCloudProd` + `AceStepSelfHostStaging`

**Files:**
- Create: `app/src/server/services/music/adapters/cloudProd.ts`, `app/src/server/services/music/adapters/selfHostStaging.ts`
- Test: `app/tests/music/adapters.test.ts`

**Interfaces:**
- Both implement `MusicGenerationService`. Cloud adapter calls the configured cloud provider (Replicate/Modal) HTTP API; self-host adapter calls the L40S FastAPI URL through Cloudflare Tunnel with `X-AIBackend-Token`. Both normalize provider responses to `MusicResult` and stamp `engineId`/`engineVersion`.

- [ ] **Step 1: Failing test — adapter maps HTTP → MusicResult (fetch mocked)**
```ts
// app/tests/music/adapters.test.ts
import { SelfHostStagingAdapter } from '../../src/server/services/music/adapters/selfHostStaging'
import { it, expect, vi } from 'vitest'
it('maps response to MusicResult', async () => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ takes:[{audioUri:'r2://a.mp3',durationSec:60}], engineId:'acestep', engineVersion:'stock-0' }), {status:200})) as any
  const a = new SelfHostStagingAdapter({ baseUrl:'https://lab.example', token:'t' })
  const r = await a.generate({ taggedLyrics:'[verse] x', transliteration:'x', styleTags:['ballad'], dialect:'egyptian', genre:'ballad', voiceGender:'male', durationSec:60, numTakes:1 })
  expect(r.takes[0].audioUri).toBe('r2://a.mp3'); expect(r.engineVersion).toBe('stock-0')
})
```
- [ ] **Step 2: Run — fails.** `pnpm -C app test music/adapters` → FAIL.
- [ ] **Step 3: Implement both adapters** (constructor config, POST `/generate`, non-200 → throw `EngineError`).
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(music): cloud-prod + self-host-staging adapters`.

### Task 2.5: Config-driven router (modes: cloud-prod / self-host-staging / a-b / fallback)

**Files:**
- Create: `app/src/server/services/music/router.ts`, `app/src/server/services/music/config.ts`
- Test: `app/tests/music/router.test.ts`

**Interfaces:**
- Produces `createMusicService(config): MusicGenerationService`. Config `{ mode:'cloud-prod'|'self-host-staging'|'a-b-compare'|'fallback', primary: MusicGenerationService, secondary: MusicGenerationService }`. `fallback` tries primary, on throw calls secondary. `a-b-compare` routes by a deterministic hash of `req.taggedLyrics` to one arm and tags `meta.abArm`.

- [ ] **Step 1: Failing test — fallback uses secondary when primary throws**
```ts
import { createMusicService } from '../../src/server/services/music/router'
import { it, expect } from 'vitest'
const REQ = { taggedLyrics:'[verse] x', transliteration:'x', styleTags:[], dialect:'egyptian', genre:'ballad', voiceGender:'male', durationSec:1, numTakes:1 } as const
it('falls back on primary failure', async () => {
  const bad = { generate: async () => { throw new Error('down') } }
  const good = { generate: async () => ({ takes:[{audioUri:'x',durationSec:1}], engineId:'e', engineVersion:'v' }) }
  const svc = createMusicService({ mode:'fallback', primary: bad, secondary: good } as any)
  const r = await svc.generate(REQ as any)
  expect(r.engineVersion).toBe('v')
})
```
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement router** switching on `mode` (`cloud-prod`→primary, `self-host-staging`→primary, `fallback`→try primary then secondary, `a-b-compare`→hash-route + tag).
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(music): config-driven engine router`.

### Task 2.6: Cloudflare Tunnel + Ansible provisioning for the L40S lab

**Files:**
- Create: `infra/ansible/playbook.yml`, `infra/ansible/roles/gpu/tasks/main.yml`, `infra/ansible/roles/serving/tasks/main.yml`, `infra/ansible/inventory.example.ini`
- Create: `infra/terraform/cloudflare_tunnel.tf`

**Interfaces:**
- Produces a re-runnable Ansible playbook installing NVIDIA driver + CUDA + Docker + NVIDIA Container Toolkit + `cloudflared`, building/running the AIBackend container, and exposing `/generate` via a named Cloudflare Tunnel with a service token. Validated by `--syntax-check` + a documented manual smoke.

- [ ] **Step 1: Lint/syntax-check the playbook**
Run: `ansible-playbook --syntax-check infra/ansible/playbook.yml`
Expected: no errors.
- [ ] **Step 2: Author roles** (gpu drivers, docker, cloudflared config with `tunnel` + ingress to `localhost:8000`).
- [ ] **Step 3: Terraform Cloudflare tunnel + DNS** (`cloudflare_tunnel.tf` creates the tunnel + a `lab.<domain>` CNAME).
- [ ] **Step 4: Document the manual smoke** in `ai-backend/README.md`: from the App box, `curl -H "X-AIBackend-Token: …" https://lab.<domain>/generate` returns 200.
- [ ] **Step 5: Commit** `infra: ansible L40S provisioning + cloudflare tunnel`.

### Task 2.7: Cloud production deploy target (Cog/Modal container) + release config

**Files:**
- Create: `ai-backend/cog.yaml` (or `ai-backend/modal_app.py`), `infra/terraform/cloud_engine.tf`, `app/src/server/services/music/version.ts`
- Test: `app/tests/music/version.test.ts`

**Interfaces:**
- Produces a packaging recipe deploying the *same* serving image to the cloud GPU provider, and `getActiveEngineVersion()` reading the released version from config/Secret so the app stamps it. (Phase-1 value = stock model; proves the promotion path exists.)

- [ ] **Step 1: Failing test — active version read from env**
```ts
import { getActiveEngineVersion } from '../../src/server/services/music/version'
import { it, expect } from 'vitest'
it('reads active engine version', () => {
  process.env.ACTIVE_ENGINE_VERSION = 'stock-0'
  expect(getActiveEngineVersion()).toBe('stock-0')
})
```
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement `getActiveEngineVersion`** + `cog.yaml` packaging the engine.
- [ ] **Step 4: Run green** + document `cog push` / `modal deploy` in `ai-backend/README.md`.
- [ ] **Step 5: Commit** `feat(aibackend): cloud production packaging + active version config`.

---

# SLICE 3 — App core (DB, auth, wizard, lyrics, generation pipeline, delivery)

**Deliverable:** A logged-in user completes the wizard, the system writes dialect lyrics, generates a song via the router, post-processes, stores to R2, and shows a preview + share page. Credits not yet enforced (Slice 4).

### Task 3.1: Database schema (Drizzle) — users, songs, credits ledger, orders

**Files:**
- Create: `app/src/server/db/schema.ts`, `app/src/server/db/client.ts`, `app/drizzle.config.ts`
- Test: `app/tests/db/schema.test.ts` (disposable Postgres / pglite)

**Interfaces:**
- Produces tables: `users(id, authUid, email, createdAt)`, `songs(id, userId, occasion, dialect, genre, voiceGender, status, previewUri, fullUri, shareSlug, unlocked, engineId, engineVersion, lyricsModel, createdAt)`, `credit_ledger(id, userId, delta, reason, refId, createdAt)`, `orders(id, userId, packId, amountMinor, currency, stripeSessionId, status, createdAt)`. Song `status`: `pending|lyrics|generating|postprocess|ready|failed`.

- [ ] **Step 1: Failing test — insert + read a song row**
```ts
import { songs } from '../../src/server/db/schema'
it('persists a song with provenance fields', async () => {
  const db = await testDb()
  const [s] = await db.insert(songs).values({ userId:u.id, occasion:'birthday', dialect:'egyptian', genre:'ballad', voiceGender:'female', status:'pending' }).returning()
  expect(s.status).toBe('pending'); expect(s.shareSlug).toBeTruthy()
})
```
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement schema** (uuid PKs, `shareSlug` default nanoid, FKs, index on `userId`, unique `shareSlug`, unique `(reason, refId)` on ledger).
- [ ] **Step 4: Generate + run migration; test green.** Run: `pnpm -C app drizzle-kit generate && pnpm -C app test db/schema`.
- [ ] **Step 5: Commit** `feat(db): core schema (users, songs, credits, orders)`.

### Task 3.2: Firebase Auth integration (server session verification)

**Files:**
- Create: `app/src/server/auth/verify.ts`, `app/src/server/auth/middleware.ts`
- Test: `app/tests/auth/verify.test.ts`

**Interfaces:**
- Produces `getUserFromRequest(req, verifier): Promise<{userId}>` verifying the Firebase ID token (verifier injected) and upserting a `users` row; invalid token → throws `Unauthorized`.

- [ ] **Step 1: Failing test** — fake verifier returns `{uid}` → upserts + returns internal `userId`; bad token → throws.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** with `firebase-admin` verifier injected; upsert by `authUid`.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(auth): firebase id-token verification + user upsert`.

### Task 3.3: `LyricsService` on the Vercel AI SDK (structured output)

**Files:**
- Create: `app/src/server/services/lyrics/types.ts`, `app/src/server/services/lyrics/service.ts`, `app/src/server/services/lyrics/prompts.ts`
- Test: `app/tests/lyrics/service.test.ts`

**Interfaces:**
- Produces:
```ts
export interface LyricsRequest { occasion:string; recipient:string; sender:string; relationship:string; details:string[]; dialect:Dialect; mood:string; lengthHint:'short'|'standard' }
export interface LyricsResult { taggedLyricsArabic:string; transliteration:string; language:'ar'; meta:{ model:string } }
export interface LyricsService { generateLyrics(r:LyricsRequest): Promise<LyricsResult> }
export function createLyricsService(opts:{ model:LanguageModel }): LyricsService
```
Implementation wraps `generateObject({ model, schema, prompt })`. Model injected so tests pass a mock model (no network).

- [ ] **Step 1: Failing test — returns tagged lyrics + transliteration via mock model**
```ts
import { createLyricsService } from '../../src/server/services/lyrics/service'
it('produces tagged dialect lyrics', async () => {
  const svc = createLyricsService({ model: mockModel({ taggedLyricsArabic:'[verse] يا ...', transliteration:'ya ...', language:'ar' }) })
  const r = await svc.generateLyrics({ occasion:'birthday', recipient:'سارة', sender:'أحمد', relationship:'sister', details:['تحب البحر'], dialect:'egyptian', mood:'romantic', lengthHint:'standard' })
  expect(r.taggedLyricsArabic).toContain('[verse]'); expect(r.meta.model).toBeTruthy()
})
```
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** dialect-specific prompt builder (`prompts.ts`, one template per dialect, **no artist names**), Zod result schema, `generateObject` call, model id from config (`@ai-sdk/anthropic` default).
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(lyrics): vercel-ai-sdk LyricsService with dialect prompts`.

### Task 3.4: Generation orchestrator + Cloud Tasks enqueue/worker

**Files:**
- Create: `app/src/server/jobs/enqueue.ts`, `app/src/server/jobs/worker.ts`, `app/src/app/api/jobs/generate/route.ts`, `app/src/server/services/pipeline.ts`
- Test: `app/tests/pipeline.test.ts`

**Interfaces:**
- Produces `runGeneration(songId, deps): Promise<void>` orchestrating: load song → `LyricsService` → `MusicGenerationService.generate` → `postProcess` → store → set `status='ready'`, persisting `engineId/engineVersion/lyricsModel`. `enqueueGeneration(songId)` pushes a Cloud Task to the worker route; worker verifies the OIDC token and calls `runGeneration`. `deps = { lyrics, music, store, db }` injected for tests.

- [ ] **Step 1: Failing test — pipeline advances a song to ready (deps faked)**
```ts
it('drives a song to ready with provenance', async () => {
  const song = await seedSong('pending')
  await runGeneration(song.id, { lyrics: fakeLyrics, music: fakeMusic, store: fakeStore, db })
  const updated = await getSong(song.id)
  expect(updated.status).toBe('ready'); expect(updated.engineVersion).toBe('stock-0'); expect(updated.previewUri).toBeTruthy()
})
```
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** orchestrator (status transitions, try/catch → `status='failed'` + analytics event), `enqueueGeneration` (Cloud Tasks client), worker route (OIDC verification).
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(pipeline): async generation orchestrator + cloud tasks worker`.

### Task 3.5: Post-processing (normalize, trim, watermark preview, encode MP3) + R2 storage

**Files:**
- Create: `app/src/server/services/audio/postprocess.ts`, `app/src/server/services/storage/r2.ts`
- Test: `app/tests/audio/postprocess.test.ts`

**Interfaces:**
- Produces `postProcess(take, deps): Promise<{ fullUri:string; previewUri:string }>` — uploads full MP3 + a 30s watermarked preview to R2; returns R2 URIs. `ffmpeg` invoked via child process (injected/mocked); R2 via S3-compatible client (injected/mocked).

- [ ] **Step 1: Failing test** (mocked ffmpeg + R2): asserts a 30s preview path and a full path are produced and uploaded; watermark overlay applied to preview only.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** ffmpeg loudnorm + trim + watermark mix for preview; R2 putObject for both.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(audio): postprocess + R2 storage`.

### Task 3.6: Wizard UI (multi-step) + create-song API

**Files:**
- Create: `app/src/components/wizard/*`, `app/src/app/create/page.tsx`, `app/src/app/api/songs/route.ts`
- Test: `app/tests/wizard/flow.test.tsx`, `app/tests/api/songs.test.ts`

**Interfaces:**
- Produces a 3-step RTL wizard (occasion → recipient/details → style) posting to `POST /api/songs` which validates (Zod), creates a `pending` song, calls `enqueueGeneration`, returns `{songId, shareSlug}`.

- [ ] **Step 1: Failing API test** — invalid dialect → 400; valid payload → 201 with `songId`, song row `pending`, enqueue called (mocked).
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** route + Zod body schema (reuse dialect/voiceGender enums) + wizard components (controlled state, RTL).
- [ ] **Step 4: Component test** — wizard collects all fields and submits; assert payload shape.
- [ ] **Step 5: Commit** `feat(app): creation wizard + create-song API`.

### Task 3.7: Song status polling + preview player + share page

**Files:**
- Create: `app/src/app/song/[slug]/page.tsx`, `app/src/app/api/songs/[id]/status/route.ts`, `app/src/components/player.tsx`
- Test: `app/tests/api/status.test.ts`, `app/tests/song/share.test.tsx`

**Interfaces:**
- Produces `GET /api/songs/:id/status` → `{status, previewUri?}`; the create page polls until `ready`; `/song/:slug` renders the public share page with the watermarked preview player and a "create your own" CTA. Full audio gated (Slice 4).

- [ ] **Step 1: Failing tests** — status route returns current status; share page renders preview for a `ready` song and hides full download.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** polling hook + player + share page.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(app): status polling + preview player + share page`.

---

# SLICE 4 — Monetization (Stripe credit packs, ledger enforcement)

**Deliverable:** A user buys a credit pack via Stripe Checkout; the webhook credits their ledger; unlocking a full (un-watermarked) song debits a credit; insufficient balance blocks the unlock.

### Task 4.1: Credit ledger service (balance, debit, credit — atomic)

**Files:**
- Create: `app/src/server/services/credits/ledger.ts`
- Test: `app/tests/credits/ledger.test.ts`

**Interfaces:**
- Produces `getBalance(userId):Promise<number>` (sum of `delta`), `credit(userId, amount, reason, refId)`, `debit(userId, amount, reason, refId)` — debit throws `InsufficientCreditsError` if balance < amount; both write a ledger row in a transaction; `(reason, refId)` unique → idempotent.

- [ ] **Step 1: Failing test — debit below balance throws; idempotent by refId**
```ts
it('refuses to overdraw and is idempotent', async () => {
  await credit(u.id, 3, 'purchase', 'order_1')
  await expect(debit(u.id, 5, 'song', 'song_1')).rejects.toThrow(InsufficientCreditsError)
  await debit(u.id, 1, 'song', 'song_1'); await debit(u.id, 1, 'song', 'song_1') // same refId
  expect(await getBalance(u.id)).toBe(2) // only one debit applied
})
```
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** with the unique constraint + transaction + balance check.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(credits): atomic idempotent ledger`.

### Task 4.2: Stripe Checkout session for credit packs

**Files:**
- Create: `app/src/server/services/payments/stripe.ts`, `app/src/app/api/checkout/route.ts`, `app/src/server/services/payments/packs.ts`
- Test: `app/tests/payments/checkout.test.ts`

**Interfaces:**
- Produces `PACKS` (`{id, credits, amountMinor, currency}` — e.g. 3/10/25), `createCheckoutSession(userId, packId, stripe): Promise<{url}>` writing a `pending` order. Stripe client injected/mocked.

- [ ] **Step 1: Failing test** — unknown pack → 400; valid → creates `pending` order + returns URL (mocked Stripe).
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** packs catalog + session creation.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(payments): stripe checkout for credit packs`.

### Task 4.3: Stripe webhook → credit the ledger (idempotent, signature-verified)

**Files:**
- Create: `app/src/app/api/webhooks/stripe/route.ts`
- Test: `app/tests/payments/webhook.test.ts`

**Interfaces:**
- Consumes Stripe `checkout.session.completed`. Verifies signature, marks order `paid`, calls `credit(userId, pack.credits, 'purchase', orderId)`. Replaying the same event does not double-credit (order status + ledger refId).

- [ ] **Step 1: Failing test — valid event credits once; replay is a no-op**
```ts
it('credits once on completed, ignores replay', async () => {
  await postWebhook(completedEvent(order.id))
  await postWebhook(completedEvent(order.id))
  expect(await getBalance(user.id)).toBe(pack.credits)
  expect((await getOrder(order.id)).status).toBe('paid')
})
```
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** raw-body signature verification + idempotent crediting.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(payments): stripe webhook crediting (idempotent)`.

### Task 4.4: Gate full-song unlock behind a credit debit

**Files:**
- Create: `app/src/app/api/songs/[id]/unlock/route.ts`
- Modify: `app/src/app/song/[slug]/page.tsx` (unlock button + full player when unlocked)
- Test: `app/tests/songs/unlock.test.ts`

**Interfaces:**
- Produces `POST /api/songs/:id/unlock` → `debit(userId,1,'song',songId)`, set `songs.unlocked=true`, return `{fullUri}`. Insufficient credits → 402. Second unlock of same song does not double-charge (refId=songId).

- [ ] **Step 1: Failing test** — 0 credits → 402; with credits → debit applied, returns `fullUri`, re-unlock no double-charge.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** route using the ledger; UI shows unlock CTA → full download on success.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(songs): credit-gated full-song unlock`.

---

# SLICE 5 — Analytics flywheel (events → Pub/Sub → BigQuery → dashboards)

**Deliverable:** Typed product + engine + economics events emit from app and worker, land in BigQuery via Pub/Sub, and three Looker Studio dashboards read them. PII excluded by construction.

### Task 5.1: Typed event schema + emitter (PII-safe)

**Files:**
- Create: `app/src/server/services/analytics/events.ts`, `app/src/server/services/analytics/emit.ts`
- Test: `app/tests/analytics/emit.test.ts`

**Interfaces:**
- Produces a discriminated union `AnalyticsEvent` (`wizard_started`, `preview_generated`, `purchase_completed`, `song_rated`, `generation_completed{engineId,engineVersion,dialect,genre,latencyMs,gpuCostMinor?,regenerated}`, …) and `emit(event, publisher)` publishing JSON to Pub/Sub. A runtime `assertNoPii` guard rejects any event carrying a `story`/free-text field; event types are defined so `story` is not assignable.

- [ ] **Step 1: Failing test — emit publishes to Pub/Sub; PII field rejected**
```ts
it('publishes typed event and forbids PII', async () => {
  const pub = fakePublisher()
  await emit({ type:'generation_completed', songId:'s1', engineId:'acestep', engineVersion:'stock-0', dialect:'egyptian', genre:'ballad', latencyMs:1200, regenerated:false }, pub)
  expect(pub.messages).toHaveLength(1)
  expect(() => assertNoPii({ type:'wizard_started', story:'secret' } as any)).toThrow()
})
```
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** event types + `emit` (Pub/Sub client injected) + `assertNoPii` runtime guard.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(analytics): typed PII-safe event emitter`.

### Task 5.2: Wire emit calls into the funnel + pipeline

**Files:**
- Modify: wizard submit (`api/songs`), status→ready, unlock, generation orchestrator
- Create: `app/src/app/api/songs/[id]/rate/route.ts`
- Test: `app/tests/analytics/wiring.test.ts`

**Interfaces:**
- Produces emit calls at: `wizard_started`, `preview_generated`, `generation_completed` (engine provenance + latency + cost), `purchase_completed`, `song_rated` (thumbs per take, `regenerated` flag). Rating route stores thumbs and emits `song_rated`.

- [ ] **Step 1: Failing test** — completing generation emits `generation_completed` with served `engineVersion`; rating emits `song_rated`.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** wiring + rate route.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `feat(analytics): instrument funnel + engine events`.

### Task 5.3: Pub/Sub → BigQuery (Terraform) + dashboards

**Files:**
- Create: `infra/terraform/analytics.tf`, `infra/terraform/schemas/events.json`, `docs/analytics/dashboards.md`
- Test: `terraform validate`

**Interfaces:**
- Produces a Pub/Sub topic `analytics-events`, a BigQuery dataset `ghanneli_analytics` with an `events` table (partitioned by day) and a **BigQuery subscription** writing events directly. `dashboards.md` documents the three Looker Studio dashboards (behavior/funnel; engine heatmap dialect×genre×engineVersion; unit economics) + the SQL views.

- [ ] **Step 1: Author topic + BQ dataset/table + subscription**
```hcl
# infra/terraform/analytics.tf
resource "google_pubsub_topic" "events" { name = "analytics-events" }
resource "google_bigquery_dataset" "a" { dataset_id = "ghanneli_analytics" location = "EU" }
resource "google_bigquery_table" "events" {
  dataset_id = google_bigquery_dataset.a.dataset_id
  table_id   = "events"
  time_partitioning { type = "DAY" field = "event_time" }
  schema = file("${path.module}/schemas/events.json")
}
resource "google_pubsub_subscription" "to_bq" {
  name  = "events-to-bq"
  topic = google_pubsub_topic.events.id
  bigquery_config { table = "${google_bigquery_table.events.project}.${google_bigquery_table.events.dataset_id}.${google_bigquery_table.events.table_id}" write_metadata = true }
}
```
- [ ] **Step 2: Add `schemas/events.json`** (event_time, type, song_id, engine_id, engine_version, dialect, genre, latency_ms, gpu_cost_minor, regenerated, rating, amount_minor, currency, channel, geo).
- [ ] **Step 3: Validate.** Run: `cd infra/terraform && terraform validate` → success.
- [ ] **Step 4: Document dashboards + SQL views** (dialect×genre×engineVersion quality heatmap; preview→purchase funnel; cost/song + margin).
- [ ] **Step 5: Commit** `feat(analytics): pubsub→bigquery pipeline + dashboard docs`.

---

## Self-Review

**Spec coverage:**
- Product/wizard/preview/share → Slice 3 (3.6, 3.7). ✅
- Genre/dialect presets, no artist names → Global Constraints + 3.3 prompts. ✅
- Pipeline (lyrics→music→postprocess→deliver) → 3.3–3.7. ✅
- LyricsService on Vercel AI SDK → 3.3. ✅
- MusicGenerationService + adapters + router (cloud-prod/self-host/a-b/fallback) → 2.1, 2.4, 2.5. ✅
- AIBackend lab (FastAPI, GPU pool, Docker), Cloudflare Tunnel, Ansible → 2.2, 2.3, 2.6. ✅
- Cloud production serving of our checkpoints + release version → 2.7. ✅
- Two-part architecture / monorepo → Slice 1 structure. ✅
- Credit packs, Stripe, ledger, gated unlock → Slice 4. ✅
- Analytics flywheel (events→PubSub→BQ→dashboards), engine heatmap, PII-safe → Slice 5. ✅
- Provenance (engineId/engineVersion/lyricsModel) → 3.1 schema + 3.4 pipeline. ✅
- Terraform for infra; Ansible for server → 1.3, 2.6, 2.7, 5.3. ✅
- **Deferred (not MVP, by design):** Phase-2 fine-tuning/eval/promotion *execution* (scaffolded only in 2.3/2.7), Phase-4 voice cloning (`voiceProfileId` seam present in 2.1). Documented as out-of-scope here.

**Placeholder scan:** No "TBD/TODO". Condensed tasks (3.2, 3.5, 4.2, 5.2) state exact files, interfaces, and test intent — expand the 5-step TDD cycle inline at execution following the fully-worked tasks as the pattern.

**Type consistency:** `MusicRequest`/`MusicResult`/`Dialect` defined once (2.1) and reused by adapters (2.4), router (2.5), pipeline (3.4). `LyricsResult` (3.3) consumed by pipeline (3.4). Credit `debit/credit(userId,amount,reason,refId)` consistent across 4.1/4.3/4.4. Event union (5.1) consumed by 5.2/5.3.

## Notes for the executor
- Build slices in order; each ends green and committed.
- Keep the live ACE-Step engine (2.3) behind the `@pytest.mark.gpu` skip so CI stays GPU-free; run those on the L40S.
- Condensed tasks deliberately omit repeated boilerplate; follow the fully-worked tasks (2.1, 2.2, 2.4, 2.5, 2.7, 3.1, 3.3, 3.4, 4.1, 4.3, 5.1) as the fidelity template.

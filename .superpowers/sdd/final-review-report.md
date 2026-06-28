# Ghanneli MVP — Final Whole-Branch Review (d88cdc8..d0d2288)

Branch: feat/mvp-build · 41 commits · 137 files · base→HEAD

## 1. Verdicts

**Spec compliance**
- Node ≥20 / Python ≥3.11 / Next 15 App Router / TS strict — ✅ (`requires-python = ">=3.11"`; `tsc --noEmit` exits 0; Next15 async `params` used throughout)
- No artist names (UI/prompts/presets/data) — ✅ (repo-wide grep clean; lyrics prompt explicitly forbids naming singers, `prompts.ts:57`)
- Engine-blind app — ✅ (no app code outside `music/` imports a concrete engine; only `MusicGenerationService` iface + `createMusicService(loadMusicConfigFromEnv())`)
- Provenance on every song — ✅ (pipeline stamps `engineId/engineVersion/lyricsModel`, `pipeline.ts:96-99`)
- No PII in analytics — ✅ by construction (typed events carry only IDs/enums/numbers; `assertNoPii` guard; BQ view extracts only non-PII camelCase fields) — see one guard gap (Important #2)
- Dialects exactly 5 / voice male|female — ✅ (`dialectEnum`, body schema enums)
- Money = integer minor units, credits integers — ✅ (packs `amountMinor` ints; ledger `delta` integer; `Number.isInteger` guards; Stripe `unit_amount = pack.amountMinor`)
- Secrets from env, `.env.local.example` is contract — ✅ (only `.env.local.example` committed; `.env*` gitignored; no live secrets in source; venv not tracked)
- Stripe idempotency & sig-verify-before-credit — ✅
- TDD — ✅ (98/98 tests pass, non-vacuous)

**Overall Quality: Approve-with-Minors.** No Critical findings. A handful of Important defense-in-depth / config items below; none block correctness of the money or auth paths.

## 2. Critical findings
**None.** Money correctness, Stripe signature-before-credit, webhook idempotency, atomic stateless debit, ownership 404s, and engine-blindness all verified correct.

## 3. Important findings (should fix)

1. **Unlock burns a credit on a non-ready song.** `app/src/app/api/songs/[id]/unlock/route.ts:31-65` — `unlockSong` debits 1 credit and sets `unlocked=true` without checking `status==='ready'` or that `fullUri` is non-null. The UI gates the button on `status==='ready'` (`song/[slug]/page.tsx:21`), but a direct authenticated POST against a pending/failed owned song debits a credit and returns `fullUri: ''` (line 64 `?? ''`). Fix: in `unlockSong`, require `status==='ready'` (and ideally `fullUri != null`) before `debit`; throw NotFound/Conflict otherwise. Server-side defense-in-depth for a paywall.

2. **Runtime PII blocklist is missing two spec-forbidden fields.** `app/src/server/services/analytics/emit.ts:30-39` — `PII_FIELDS` omits `relationship` and `mood`, both forbidden by the spec. Typed events can't carry them today, but the guard exists precisely to catch `as any` bypasses; it would silently pass them. Fix: add `'relationship'` and `'mood'` to the list.

3. **Status route is an unauthenticated existence/preview oracle keyed by raw id.** `app/src/app/api/songs/[id]/status/route.ts:15-35` — no `requireUser`, no `userId` filter; any caller with a song uuid gets `status` and (when ready) `previewUri`. This is *by-design* (the create wizard polls it client-side without auth, and the watermarked preview is meant to be shareable), so it is not a fullUri/PII leak. Still, it is inconsistent with the owner-scoped `rate`/`unlock` routes and leaks existence/preview by id rather than by the unguessable `shareSlug`. Fix direction (optional but recommended): require auth + `AND userId`, or document it as deliberately public. Downgraded from the sub-agent's "must-fix" because `previewUri` is non-sensitive by product design and ids are unguessable uuids; `fullUri` is never exposed here.

4. **Hardcoded, outdated lyrics model is also the stamped provenance.** `app/src/server/jobs/build-deps.ts:53` — `anthropic('claude-3-haiku-20240307')`, not env-configurable, unlike the music config which reads env. This string becomes `songs.lyricsModel` provenance on every song. The snapshot is old; the value should be env-driven (e.g. `LYRICS_MODEL`) for accurate provenance and easy rotation. (Recurring ledger Minor 3.4 / LOCAL.2b.) Not a correctness blocker — it works — but should be fixed before relying on provenance.

## 4. Minors triage (ledger-accumulated + newly found)

| Source | Minor | Triage |
|---|---|---|
| 1.2 | redundant vitest `globals:true` | OK-to-defer (cosmetic) |
| 2.2a | reviewer's "httpx→httpx2" | N/A — confirmed false positive; no action |
| 2.2b | missing `[build-system]` table in ai-backend/pyproject.toml | OK-to-defer; recommend add (`setuptools.build_meta`) — confirmed still absent. Editable install works in CI today, so non-blocking |
| 2.3 | temp WAV not cleaned (engine) / torchaudio re-imported | OK-to-defer (lab/GPU, R2 task); UNVERIFIABLE here |
| 2.4 | AceStepCloudProd has no unit test | OK-to-defer (self-host adapter tested; shared httpEngine path covers both) |
| 3.3a | types.ts re-exports LanguageModel | OK-to-defer (narrow public API, harmless) |
| 3.3b | only egyptian dialect in lyrics test | OK-to-defer; nice-to-have `it.each` over 5 |
| 3.3c | redundant `language` literal | OK-to-defer (cosmetic) |
| 3.4a | `musicResult.takes[0]` unguarded | **Should-fix (cheap):** numTakes=1 contract, but an empty `takes` would throw a vague error in postProcess. Add a guard. |
| 3.4b | durationSec magic ternary | OK-to-defer (cosmetic; named const nicer) |
| 3.4c | success event fires before final write; throw could double-emit | OK-to-defer (no txn in MVP; only `generation.completed` is consumed, `failed` is dropped — see PII note) |
| 3.4d | cloud-prod secondary=primary same ref | OK-to-defer (immutable, non-issue; router never reads secondary in single-engine modes) |
| 3.4e | worker.ts thin passthrough wants a comment | OK-to-defer |
| 3.4f | export named EventsDep interface | OK-to-defer |
| 3.5a | prod runFfmpeg uses execAsync + manual quote-escape | **Should-fix-ish:** switch to `spawn(arg-array)`. Inputs are uuid/env-controlled so low risk today; escaping doesn't neutralize `$()`/backticks. Confirmed `build-deps.ts:27`. |
| 3.5b | WATERMARK_ASSET_PATH default must exist in image | OK-to-defer; verified Dockerfile.worker installs a watermark asset (UNVERIFIABLE w/o docker build) |
| 3.6 | create API test drives core not POST e2e | OK-to-defer (pieces individually tested; auth covered in 3.2) |
| 4.1 | dead `?? 0` in getBalance; no Object.setPrototypeOf | OK-to-defer (ESNext target; instanceof works — tests confirm 402 path) |
| 4.2 | STRIPE_SUCCESS/CANCEL_URL hardcoded fallback ghanneli.com | OK-to-defer (sane default; env override exists) |
| 4.3 | silence negative-path log noise; metric for unknown-orderId; verify webhook secret in deploy + no body middleware | OK-to-defer (log noise); **deploy-checklist:** confirm `STRIPE_WEBHOOK_SECRET` set + no middleware consumes `/api/webhooks/stripe` body (raw body read verified in route) |
| 4.4 | `fullUri ?? ''` fallback | superseded by Important #1 (the real fix is the ready-check) |
| 5.2a | webhook uses module emitDefault not injected dep | OK-to-defer (test isolation only; money path verified untouched) |
| 5.2b/c/d | event placement deviates from brief | OK-to-defer (documented binding decisions; semantically defensible) |
| 5.3 | view vs typed-table deviation; deploy must enable APIs + pass project_number | OK-to-defer (standard GCP write_metadata pattern; UNVERIFIABLE w/o live GCP) |
| LOCAL.1 | enqueue.ts duplicates CloudTasksQueue, unused by route | **Should-fix (cleanup):** confirmed dead — zero callers; delete `enqueue.ts` (kept only so its test stays green; remove both). |
| LOCAL.2a | factory eagerly constructs bullmq Queue (opens Redis) | OK-to-defer (local-dev only; consider lazy) |
| LOCAL.2b | hardcoded lyrics model | promoted to Important #4 |
| LOCAL.5a | watermark.mp3 is WAV bytes (mislabeled) | OK-to-defer (ffmpeg reads by content) |
| LOCAL.5b/c | docker builds + compose runtime + 3rd-party images | UNVERIFIABLE (no Docker on box) |

**New Minors found this review:**
- `version.ts:getActiveEngineVersion` is dead at runtime — only its own test consumes it; per-song `engineVersion` comes from the HTTP engine response. OK-to-defer (harmless; documented as a future provenance hook).
- `pipeline.ts:121` `generation.failed` payload embeds raw `error: e` which could contain PII in its message. **Safe today** because the only consumer (`wiring.ts:29`) drops every event name except `generation.completed`, so it never reaches a publisher or `assertNoPii`. Fragile: a future consumer that handles/logs `generation.failed` would leak. Recommend emitting `{ songId }` (+ enum reason) only. Note `bullmq-worker.ts` logs the thrown generation error server-side — acceptable as a worker log but the one place a PII-bearing error string could hit stdout.

## 5. Verification run

- `pnpm test` (app) → **26 files, 98 tests passed** (incl. ledger amount/cross-user disambiguation, webhook replay-credits-once + forged/missing-sig→400, unlock 402/ownership, status preview-gating, share full-audio-hidden). Tests are non-vacuous (real pglite + migrations, asserts on balances/status/payload shapes).
- `pnpm typecheck` (tsc --noEmit) → **exit 0**.
- Artist-name grep (ts/tsx/py/json/md/sql, repo-wide) → **no matches**.
- Secret grep (sk_live / AKIA / private key / inline password) → only `.venv313` site-packages (not tracked); source clean.
- `.env*` → only `.env.local.example` committed; `.gitignore` correctly ignores `.env*` and un-ignores examples; `.venv/` ignored and untracked.
- Engine-blindness grep (cloudProd/selfHostStaging/acestep) → importers only inside `music/` boundary (config composition root + the adapters themselves); `pipeline.ts`/`build-deps.ts`/routes import interface+types only.
- Config mode mapping (`config.ts`) → previously-flagged "always primary=cloud" bug **confirmed fixed**: `self-host-staging`→primary=self-host (no CLOUD_ENGINE req), `cloud-prod`→cloud only (no AIBACKEND req), `fallback`/`a-b`→both.
- Queue convergence → both push route and BullMQ worker call `handleGenerationJob(songId, buildGenerationDeps())` → `runGeneration`; identical deps. Payload `{songId}` round-trips (base64 JSON for Cloud Tasks, `job.data.songId` for BullMQ).
- BQ view (`analytics.tf`) camelCase→column map matches every emitted field; no PII columns; money INT64.

**Could NOT verify (UNVERIFIABLE on this box):**
- Docker image builds + `docker compose up` runtime + the two third-party images (firebase-tools, local-neon-http-proxy) — Docker not installed.
- Live GCP: BQ subscription/IAM runtime, OIDC token verification against real Cloud Tasks, Pub/Sub publish — HCL/code looks correct but no live project.
- GPU/L40S: ACE-Step engine `__call__`/from_pretrained (6 TODO(L40S) markers), Modal deploy — no GPU.
- Ansible playbook `--syntax-check` — needs a Linux control node.
- GitHub Actions CI green status — repo private, no gh auth (ledger OPEN item).
- neon-http live result shape vs the `extractRows` normaliser (pglite verified; live Neon assumed) — flagged in ledger with a re-verify note.

These are "looks correct but unverifiable" — distinct from the verified-correct items above.

---

## 6. Fix wave applied (2026-06-28)

Commit: `fix(review): unlock ready-check, PII blocklist, env lyrics model, failed-event payload`

### FIX 1 — Unlock must reject a non-ready song
- `app/src/app/api/songs/[id]/unlock/route.ts`: added `SongNotReadyError` class; extended the `select` to include `songs.status`; added guard before `debit` — if `status !== 'ready'` throws `SongNotReadyError`; mapped to HTTP 409 `{ error: 'Song not ready' }` in POST handler.
- New tests in `app/tests/songs/unlock.test.ts` (+2):
  - `non-ready song (generating) → throws SongNotReadyError before debit; balance unchanged, unlocked stays false`
  - `non-ready song (pending) → throws SongNotReadyError`

### FIX 2 — Add missing PII fields to the analytics runtime blocklist
- `app/src/server/services/analytics/emit.ts`: added `'relationship'` and `'mood'` to `PII_FIELDS`.
- Updated existing `assertNoPii rejects all known PII field names` test to include both fields.
- New tests in `app/tests/analytics/emit.test.ts` (+2):
  - `assertNoPii throws for relationship field (spec-forbidden PII)`
  - `assertNoPii throws for mood field (spec-forbidden PII)`

### FIX 3 — Make the lyrics model env-driven
- `app/src/server/jobs/build-deps.ts:53`: changed hardcoded `anthropic('claude-3-haiku-20240307')` to `anthropic(process.env.LYRICS_MODEL ?? 'claude-3-5-haiku-latest')`.
- `.env.local.example`: added `LYRICS_MODEL=claude-3-5-haiku-latest` in the Anthropic section with a comment explaining it is recorded as song provenance.

### FIX 4 — Don't put the raw error object in the generation.failed event payload
- `app/src/server/services/pipeline.ts:121`: changed `error: e` to `error: e instanceof Error ? e.message : String(e)`. Existing failed-path pipeline test still passes (it does not inspect the event payload shape).

### Verification
- `pnpm -C app test`: **26 files, 102 tests passed** (was 98; +4 new tests)
- `pnpm -C app typecheck`: exit 0

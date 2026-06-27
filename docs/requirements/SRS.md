# Ghanneli — Software Requirements Specification (SRS)

**Version:** 1.0 (MVP) · **Date:** 2026-06-27 · **Status:** Baseline (locks MVP requirements)
**References:** Design spec `docs/superpowers/specs/2026-06-27-ghanneli-design.md`; Plan `docs/superpowers/plans/2026-06-27-ghanneli-mvp.md`; Diagrams `docs/design/uml.md`.

This SRS adapts IEEE-830. Requirement IDs are stable identifiers; **FR** = functional, **NFR** = non-functional, **DR** = data, **IR** = interface, **CR** = constraint.

---

## 1. Introduction

### 1.1 Purpose
Define the requirements for the Ghanneli MVP: a web application that generates personalized Arabic gift songs from user-supplied details, across dialect/genre presets, served from cloud GPU with a self-hostable model lab for fine-tuning/staging.

### 1.2 Scope
**In scope (MVP):** account/auth, song-creation wizard, dialectal lyric generation, music generation via a pluggable engine (cloud production + self-host staging), audio post-processing, free watermarked preview, credit-pack purchase (Stripe), credit-gated full-song unlock, shareable song page, analytics flywheel.
**Out of scope (later phases):** model fine-tuning execution (Phase 2), voice cloning (Phase 4), native mobile apps, B2B portal, local (non-Stripe) payment rails.

### 1.3 Definitions
- **Engine** — a music-generation backend behind `MusicGenerationService` (cloud-prod or self-host-staging).
- **Engine version** — an identifier of the served model build; stamped on each song (provenance).
- **Take** — one candidate audio output for a song.
- **Credit** — a unit consumed to unlock one full song.
- **AIBackend** — the self-hosted 4× L40S model lab (fine-tune + stage).
- **Preview** — a 30-second watermarked clip shown before purchase.

### 1.4 Actors
Visitor (unauthenticated), Registered User (buyer), Operator/Admin (founder), Stripe (payment system), Cloud GPU provider, AIBackend lab, Analytics warehouse.

---

## 2. Overall description

### 2.1 Product perspective
Two-part system: **App** (Next.js on GCP Cloud Run) and **AIBackend** (FastAPI on L40S). They communicate over one inference API using `MusicRequest`/`MusicResult`. The App is engine-blind; engine selection is configuration. See component diagram in `docs/design/uml.md`.

### 2.2 User classes
- **Visitor:** browses, may start the wizard and see a preview; must authenticate to persist/purchase.
- **Registered User:** creates songs, buys credits, unlocks/downloads, rates takes.
- **Operator:** configures engine routing/version, monitors analytics, runs the AIBackend (later: fine-tunes/promotes).

### 2.3 Assumptions & dependencies
Stock ACE-Step is adequate for prompt-based dialect songs at MVP quality; Stripe is available to the target buyers; the L40S server may or may not be available (cloud is the always-on baseline); Arabic vocal intelligibility is the primary quality risk and is mitigated, not eliminated, at MVP.

---

## 3. Functional requirements

### 3.1 Accounts & authentication
- **FR-1** The system SHALL allow a user to authenticate via Firebase Auth (email/Google).
- **FR-2** On first authenticated request, the system SHALL upsert a user record keyed by auth UID.
- **FR-3** The system SHALL reject API requests with an invalid/expired token (HTTP 401).

### 3.2 Song creation wizard
- **FR-4** The system SHALL collect: occasion; recipient name(s); sender; relationship; 2–4 free-text personal details; dialect ∈ {khaleeji, egyptian, levantine, maghrebi, iraqi}; genre/mood; voice gender ∈ {male, female}.
- **FR-5** The system SHALL validate wizard input server-side and reject invalid values (HTTP 400).
- **FR-6** On valid submission the system SHALL create a song in status `pending` and enqueue asynchronous generation, returning a song id and share slug.
- **FR-7** The UI SHALL be right-to-left and Arabic-localized.

### 3.3 Lyric generation
- **FR-8** The system SHALL generate Arabic lyrics in the selected dialect from the wizard inputs, tagged with section markers (e.g., `[verse]`, `[chorus]`).
- **FR-9** The system SHALL produce a phonetic transliteration alongside the Arabic lyrics to aid pronunciation.
- **FR-10** Lyric generation SHALL use the Vercel AI SDK with a configurable model; the model identifier SHALL be recorded on the song.
- **FR-11** The system SHALL NOT reference, name, or imitate any specific named artist in prompts or output.

### 3.4 Music generation
- **FR-12** The system SHALL generate audio from tagged lyrics + transliteration + style tags (dialect, genre, voice gender, optional BPM) via `MusicGenerationService`.
- **FR-13** The system SHALL generate at least 2 takes per song (configurable, max 4).
- **FR-14** The system SHALL support engine routing modes: `cloud-prod`, `self-host-staging`, `a-b-compare`, `fallback`; selection SHALL be configuration, requiring no code change.
- **FR-15** In `fallback` mode, on primary engine failure the system SHALL automatically use the secondary engine.
- **FR-16** The system SHALL record `engineId` and `engineVersion` on each generated song (provenance).

### 3.5 Post-processing & delivery
- **FR-17** The system SHALL loudness-normalize, trim, and encode each take to MP3.
- **FR-18** The system SHALL produce a 30-second **watermarked** preview and a full **un-watermarked** file; store both in object storage.
- **FR-19** The system SHALL expose a public share page per song showing the preview and a "create your own" call-to-action.
- **FR-20** The system SHALL expose song status (`pending|lyrics|generating|postprocess|ready|failed`) for polling; on failure it SHALL allow regeneration.

### 3.6 Monetization
- **FR-21** The system SHALL offer credit packs (e.g., 3 / 10 / 25) purchasable via Stripe Checkout.
- **FR-22** On a verified `checkout.session.completed` webhook, the system SHALL credit the user's ledger exactly once (idempotent).
- **FR-23** Unlocking a full song SHALL debit exactly one credit; unlocking the same song again SHALL NOT debit again.
- **FR-24** If the user has insufficient credits, the unlock SHALL be refused (HTTP 402) and the full file SHALL remain inaccessible.
- **FR-25** The credit ledger SHALL be append-only and balance SHALL be derived from it.

### 3.7 Ratings & analytics
- **FR-26** The system SHALL let users rate each take (thumbs up/down) and record which take was chosen.
- **FR-27** The system SHALL emit typed events for: wizard start, preview generated, generation completed (with engine provenance, latency, cost), purchase completed, song rated, regenerate.
- **FR-28** Events SHALL flow to a BigQuery warehouse and power dashboards for behavior/funnel, engine quality (dialect × genre × engineVersion), and unit economics.
- **FR-29** Analytics events SHALL NOT contain the raw personal "story" free-text or other user PII.

### 3.8 Operations
- **FR-30** The Operator SHALL be able to set the active engine version and routing mode via configuration.
- **FR-31** The AIBackend SHALL expose an authenticated `POST /generate` honoring the `MusicRequest`/`MusicResult` contract.

---

## 4. Non-functional requirements

- **NFR-1 (Performance):** A song generation (lyrics→music→post-process→ready) SHOULD complete within ~120 seconds at MVP; the UI SHALL remain responsive via async status polling.
- **NFR-2 (Scalability):** App and worker SHALL run on scale-to-zero serverless compute; idle infrastructure cost SHALL be near zero.
- **NFR-3 (Availability):** User-facing generation SHALL NOT depend on the L40S server; cloud production is the always-available path. Target app availability ≥ 99% at MVP.
- **NFR-4 (Reliability):** Generation jobs SHALL be durable and retried on transient failure; a failed job SHALL set song status `failed` without data loss.
- **NFR-5 (Security):** Secrets SHALL be stored in a secret manager, never in source. The AIBackend endpoint SHALL require a service token and SHALL NOT expose open inbound ports (Cloudflare Tunnel).
- **NFR-6 (Privacy/Compliance):** PII SHALL be minimized; analytics SHALL exclude free-text PII; the system SHALL support data deletion. Alignment with GDPR (diaspora) and MENA data-protection laws (e.g., Saudi PDPL).
- **NFR-7 (Cost):** The only material variable cost SHALL be per-song GPU + LLM; gross margin target ≥ 90% (cloud production).
- **NFR-8 (Maintainability):** Model engines and lyric models SHALL be swappable via interfaces without changing business-logic code. TypeScript strict mode; ≥ 80% coverage on service logic.
- **NFR-9 (Internationalization):** Full RTL and Arabic-script support across UI and generated content.
- **NFR-10 (Observability):** Structured logs + the analytics warehouse SHALL allow tracing a song's lifecycle and per-engine cost/quality.

---

## 5. Data requirements

- **DR-1 (User):** `id, authUid, email, createdAt`.
- **DR-2 (Song):** `id, userId, occasion, dialect, genre, voiceGender, status, previewUri, fullUri, shareSlug, unlocked, engineId, engineVersion, lyricsModel, createdAt`.
- **DR-3 (Credit ledger):** append-only `id, userId, delta, reason, refId, createdAt`; `(reason, refId)` unique for idempotency; balance = Σ delta.
- **DR-4 (Order):** `id, userId, packId, amountMinor, currency, stripeSessionId, status (pending|paid|failed), createdAt`.
- **DR-5 (Rating):** `id, songId, takeIndex, thumb (up|down), createdAt`.
- **DR-6 (Analytics event):** `event_time, type, song_id, engine_id, engine_version, dialect, genre, latency_ms, gpu_cost_minor, regenerated, rating, amount_minor, currency, channel, geo` — no free-text PII.
- **DR-7 (Money):** all monetary amounts stored as integer minor units; credits as integers.
- **DR-8 (Provenance):** every song persists the producing `engineId`, `engineVersion`, and `lyricsModel`.

---

## 6. External interface requirements

- **IR-1 (Inference API):** `POST /generate` (AIBackend & cloud) consumes `MusicRequest`, returns `MusicResult`; auth via `X-AIBackend-Token` (self-host) / provider auth (cloud).
- **IR-2 (Lyrics):** Vercel AI SDK provider interface; structured output validated against a schema.
- **IR-3 (Payments):** Stripe Checkout (session create) + Webhook (`checkout.session.completed`, signature-verified, raw body).
- **IR-4 (Auth):** Firebase Auth ID-token verification server-side.
- **IR-5 (Storage):** S3-compatible object storage (Cloudflare R2) for audio; signed/CDN delivery.
- **IR-6 (Queue):** Cloud Tasks enqueue → authenticated worker HTTP route (OIDC).
- **IR-7 (Analytics):** Pub/Sub topic `analytics-events` → BigQuery subscription → `ghanneli_analytics.events`.

---

## 7. Constraints

- **CR-1** No artist names anywhere (legal). Styles are genre/dialect presets only.
- **CR-2** MVP serves stock ACE-Step from cloud; no fine-tuning or scraping in MVP.
- **CR-3** App must remain engine-blind; engines and lyric models are swappable by config.
- **CR-4** Deployment target GCP; infra via Terraform; L40S server provisioned via Ansible.
- **CR-5** Node ≥ 20, Python ≥ 3.11, Next.js 15 App Router, TypeScript strict.
- **CR-6** No user PII persisted on the L40S server.

---

## 8. Acceptance criteria (MVP "done")

1. A user signs in, completes the wizard, and within ~2 minutes sees a watermarked Arabic preview in their chosen dialect. *(FR-1..FR-20)*
2. The song record carries `engineId`, `engineVersion`, `lyricsModel`. *(FR-16, DR-8)*
3. The user buys a credit pack; the webhook credits the ledger exactly once; replay is a no-op. *(FR-21, FR-22)*
4. The user unlocks the full song (one credit debited; re-unlock free; zero balance → 402). *(FR-23, FR-24)*
5. A shareable public song page renders the preview with a CTA. *(FR-19)*
6. Switching engine routing mode (cloud-prod ↔ self-host-staging ↔ fallback) requires only configuration. *(FR-14, FR-15)*
7. Events land in BigQuery; the dialect × genre × engineVersion quality dashboard renders; no event contains free-text PII. *(FR-27..FR-29)*
8. `terraform validate` passes for all infra; CI is green for app and ai-backend. *(CR-4)*

---

## 9. Traceability (requirement → plan task)

| Requirement | Plan task(s) |
|---|---|
| FR-1..FR-3 (auth) | 3.2 |
| FR-4..FR-7 (wizard) | 3.6, 1.2 |
| FR-8..FR-11 (lyrics) | 3.3 |
| FR-12..FR-16 (music/engine) | 2.1, 2.4, 2.5, 2.7, 3.4 |
| FR-17..FR-20 (post/deliver) | 3.5, 3.7 |
| FR-21..FR-25 (money) | 4.1, 4.2, 4.3, 4.4 |
| FR-26..FR-29 (analytics) | 5.1, 5.2, 5.3 |
| FR-30..FR-31 (ops/AIBackend) | 2.2, 2.3, 2.6, 2.7 |
| NFR-2/3/4 (serverless/durable) | 1.3, 3.4 |
| NFR-5/6 (security/privacy) | 2.6, 5.1 |
| DR-1..DR-8 (data) | 3.1, 5.1 |
| IR-1..IR-7 (interfaces) | 2.x, 3.x, 4.x, 5.x |
| CR-1..CR-6 (constraints) | Global Constraints (plan) |

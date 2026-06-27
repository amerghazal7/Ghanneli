# Ghanneli — Design Document

**Date:** 2026-06-27
**Status:** Approved design (pre-implementation-plan)
**Author:** Solution Architecture / Product (brainstorming session)

> غنّيلي / *Ghanneli* — "sing for me." A web platform that turns a few personal
> details into a custom Arabic gift song, localized across dialects and the styles
> of the hits people love. A SongOven-style product, built for the Arab world.

---

## 1. Vision & positioning

Reproduce SongOven's proven model — **personalized, AI-generated gift songs** — but
authentically Arabic: multiple dialects, hit-song production feel, written in the
listener's own dialect. The differentiation is **authentic Arabic musicality and
dialect accuracy**, not impersonation of named artists.

The product is also a **data flywheel**: every song generated produces behavioral and
quality signal that decides which engine, dialect, and genre to invest in next —
turning the founder's "fine-tune on scraped songs" idea into a *targeted, data-driven*
Phase-2 activity rather than an upfront gamble.

---

## 2. Key decisions (decision log)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **MVP = personalized gift songs** (not impersonation, not generic studio) | Closest to the validated SongOven model; lowest risk |
| D2 | **Genre/dialect presets only — no artist names anywhere in the UI** | Removes voice/likeness/passing-off IP risk; differentiation via authenticity |
| D3 | **Base model first, fine-tune later** | Bootstrap budget; validate willingness-to-pay before spending on GPU training |
| D4 | **All dialects offered at launch as prompt-based presets** | Cheap with a base model; usage data reveals the real fine-tuning priority |
| D5 | **Credit packs (pay-as-you-go)** | Matches gift-buying behavior (occasional, not monthly) |
| D6 | **Skip Phase 0 concierge — build the full self-serve MVP** | Founder preference; commit to the product |
| D7 | **GCP as deployment target, but cost-optimized & portable**; **Terraform** for all infra | Minimize idle cost; avoid lock-in via containers + open interfaces |
| D8 | **Pluggable `LyricsService` & `MusicGenerationService` abstractions** | Swap/upgrade models later as a config change, not a rewrite |
| D9 | **`LyricsService` built on the Vercel AI SDK** | Provider-agnostic LLM layer + schema-validated structured output for free |
| D10 | **Analytics warehouse + dashboards from day one** | Drive engine-development and client-behavior decisions with data |
| D11 | **Voice Cloning as a premium Phase-4 feature — architecture pre-seamed in the MVP** | Huge differentiation/premium revenue; built later, but the MVP leaves the optional pipeline stage + `voiceProfileId` seam so no re-architecture is needed |
| D12 | **Self-host inference + fine-tuning on a 4× L40S server** (owned access) | Marginal GPU cost ≈ electricity; fine-tuning compute ≈ free — major cost & velocity lever |
| D13 | **Two-part architecture: App (GCP) + AIBackend (self-hosted), one inference-API boundary; monorepo** | Clean separation of business logic vs model dev/serving; each evolves independently |
| D14 | **Self-hosted = primary inference; external serverless GPU = automatic fallback** | Cost-optimal while surviving single-server downtime via the router + durable queue |

---

## 3. Product definition (MVP)

### Creation wizard (the core flow)
1. **Occasion** — birthday, wedding, anniversary, graduation, new baby, "just because / I love you".
2. **Who it's for** — recipient name(s), sender, relationship, 2–4 personal details ("she loves the sea, we met in Beirut...").
3. **Style** — dialect (Khaleeji / Egyptian / Levantine / Maghrebi / Iraqi), genre/mood (ballad, upbeat pop, shaabi, romantic), voice gender.
4. **Free 30-second watermarked preview** — the conversion engine.
5. **Pay with credits** → unlock full song + shareable link + MP3 download + a shareable **song-card page**.

### Growth loops (built into the product)
- **Free watermarked preview** → preview→purchase conversion.
- **Shareable song page** → every gift is a free landing page / referral surface.

---

## 4. Generation pipeline

```
User inputs
   │
[1] LyricsService     →  Vercel AI SDK generateObject() with dialect prompt template
                         outputs validated { taggedLyricsArabic, transliteration,
                         language, meta }   ([verse]/[chorus] tags)
   │
[2] MusicGenerationService → ACE-Step (external serverless GPU, MVP)
                         input: tagged lyrics + transliteration + style tags
                         (dialect/genre/BPM/voiceGender), generates 2 takes
   │
[3] Post-process      →  loudness normalize, trim, watermark preview, encode MP3
   │
[3.5] VoiceConversionService  (OPTIONAL — premium, Phase 4; seam present in MVP)
                         stem-separate vocals → convert timbre to client voice
                         profile → remux with instrumental
   │
[4] Deliver           →  store in object storage, build share page,
                         gate full file behind credits
```

> The `[3.5]` stage and the `voiceProfileId` request field are **designed into the MVP
> as no-op seams** so Phase-4 voice cloning slots in without re-architecture. See §6.3
> and §11.

### Hard technical risk (flagged): Arabic vocal intelligibility
Open music models pronounce Arabic imperfectly. Mitigations designed in:
- Feed a **phonetic transliteration** alongside the Arabic script.
- Generate **2 takes**, auto-select / let the user choose.
- A **regenerate** button.
- Make this the **#1 Phase-2 fine-tuning target**, prioritized by the analytics heatmap.

---

## 5. System architecture (components)

Each component has one purpose, a clean interface, and is independently testable.

| Component | Responsibility |
|-----------|----------------|
| **Web app** (Next.js) | Creation wizard, gallery, account, checkout, share pages (RTL/Arabic) |
| **API / orchestrator** | Validates input, creates generation job, manages credits |
| **Job queue + worker** | Runs the async pipeline (generation takes 30s–2min) |
| **LyricsService** | Domain wrapper over the Vercel AI SDK; dialect prompt templates + schema validation |
| **MusicGenerationService** | Provider-agnostic music engine interface |
| **VoiceConversionService** *(Phase 4)* | Optional pluggable singing-voice-conversion stage |
| **Voice Profile Service** *(Phase 4)* | Guided capture, quality check, profile/embedding storage, consent ledger |
| **Storage + CDN** | Audio files, share-page assets |
| **Database** | Users, songs, credits ledger, orders |
| **Payments** | Stripe credit-pack purchases → credit ledger |
| **Analytics pipeline** | Event capture → warehouse → dashboards |

---

## 6. Pluggable engine abstraction

The two model-facing services are isolated behind normalized interfaces so the app is
**engine-blind**. Selection is config/router-driven (by env, per-request, or by a router
that A/B-tests engines or routes by dialect). Every song records `engineId` +
`engineVersion` for reproducibility and evaluation.

### 6.1 `LyricsService` (on the Vercel AI SDK)

```
LyricsService.generateLyrics(LyricsRequest) -> LyricsResult
  LyricsRequest:  { occasion, recipient, sender, relationship, details[],
                    dialect, mood, lengthHint }
  LyricsResult:   { taggedLyricsArabic, transliteration, language, meta }

Implementation:
  - built on Vercel AI SDK generateObject({ schema (Zod), model })
  - model id is configuration: provider:model
  - providers: @ai-sdk/anthropic (Claude, quality default),
               @ai-sdk/google-vertex (Claude/Gemini on Vertex),
               @ai-sdk/google (Gemini Flash, cheap fallback)
  - swap model = change config; structured output is schema-validated (no parsing)
```

### 6.2 `MusicGenerationService`

```
MusicGenerationService.generate(MusicRequest) -> MusicResult
  MusicRequest:  { taggedLyrics, transliteration, styleTags, dialect, genre,
                   bpm?, voiceGender, voiceProfileId?, durationSec, numTakes }
                   // voiceProfileId is the Phase-4 voice-cloning seam (optional/no-op in MVP)
  MusicResult:   { takes[]:{audioUri,durationSec,score?}, engineId, engineVersion, meta }

Adapters:
  - AceStepSelfHosted               (PRIMARY — 4x L40S AIBackend server; see §7B)
  - AceStepFal / AceStepReplicate   (automatic FALLBACK — external serverless GPU)
  - AceStepFineTuned                (Phase 2 — served from AIBackend)
  - Jamify / HeartMuse              (experimental)

Design rules:
  - Normalized request/response contract (app is engine-blind)
  - Capability flags per adapter: supportsArabicScript, maxDuration, costPerSec
    → router picks cheapest engine meeting the quality bar
  - Provenance: store engineId + engineVersion on every song
```

---

### 6.3 `VoiceConversionService` (Phase 4 — premium; seam present in MVP)

Optional post-processing stage that converts the generated vocal to a client's voice
profile. Same pluggable/router/capability pattern; reuses the GPU infra.

```
VoiceConversionService.convert(VoiceConversionRequest) -> VoiceConversionResult
  VoiceConversionRequest:  { sourceAudioUri, voiceProfileId, dialect, meta }
  VoiceConversionResult:   { audioUri, converterId, converterVersion, quality?, meta }

Adapters: RVC . so-vits-svc . zero-shot SVC (e.g. Seed-VC)   // self-host or external GPU

VoiceProfileService (companion)
  enrol(samples[], consent) -> voiceProfileId      // guided capture + QC + consent ledger
  delete(voiceProfileId)                            // hard-delete (biometric data right)
  Requirements: live randomized-phrase capture (proof of ownership / liveness),
                explicit consent, encrypted-at-rest profiles, retention limits.

  Arabic / multi-dialect requirements (the language sung is Arabic):
    - Capture prompts are ARABIC and dialect-aware: the guided phrases/sung lines are
      drawn from the user's target dialect(s) so the profile captures dialect-specific
      phonemes, not just MSA.
    - SVC adapter must be validated on Arabic phonetics (incl. emphatic/pharyngeal
      sounds ع ح ق ص ض ط ظ غ خ) and on cross-dialect generalization.
    - Voice profile may store per-dialect coverage; a profile enrolled in one dialect can
      be flagged lower-confidence when used to sing another dialect.
    - Eval harness scores cloned-voice output on Arabic intelligibility + dialect accuracy
      (reuses the Phase-2 eval rig), per dialect.

MVP seam: the pipeline calls VoiceConversionService only when voiceProfileId is set;
          in the MVP no profiles exist, so the stage is a no-op. No re-architecture
          to enable Phase 4 - only new adapters + the Voice Profile onboarding flow.
```

---

## 7. Tech stack (cost-optimized, GCP-targeted, Terraform-deployed)

**Principle:** everything scales to zero or sits on a free tier at idle; the only real
variable cost is **GPU-per-song**.

| Layer | Choice | Cost lever |
|-------|--------|-----------|
| Web + API | **Next.js (container) on Cloud Run**, scale-to-zero | $0 idle; pay per request |
| Async jobs | **Cloud Tasks → Cloud Run worker** | ~Free at MVP volume |
| Music GPU (primary) | **Self-hosted ACE-Step on the 4× L40S AIBackend server** (§7B) | Marginal cost ≈ electricity; also the fine-tuning environment |
| Music GPU (fallback) | **External serverless GPU (fal.ai / Replicate)** via adapter | Automatic failover when the server is down/saturated; absorbs bursts |
| Lyrics LLM | **Claude (Vertex or direct)** default, **Gemini Flash** fallback — via Vercel AI SDK | Token cost negligible; route to cheapest model holding quality |
| DB | **Neon serverless Postgres** (scale-to-zero, free tier) → AlloyDB/Cloud SQL at scale | Avoids Cloud SQL always-on minimum at MVP |
| Auth | **Firebase Auth / Identity Platform** | Free tier |
| Storage + delivery | **Cloudflare R2 + CDN** (zero egress) | Audio egress is the silent budget killer; R2 removes it |
| Payments | **Stripe** (Checkout + credit ledger) | Live in UAE/KSA; ideal for diaspora; add Paymob/Tap later |
| Secrets / Obs | **Secret Manager · Cloud Logging/Monitoring** | Free tier |
| IaC / CI-CD | **Terraform** (google, cloudflare, neon providers) + **GitHub Actions** → build image → deploy Cloud Run | Whole stack reproducible; no click-ops |

**Terraform scope:** Cloud Run services (web + worker), Cloud Tasks queue, Pub/Sub topics,
BigQuery datasets/tables, Firebase/Identity Platform, Secret Manager, R2 buckets +
Cloudflare config, Neon project, IAM/service accounts, GitHub Actions deploy pipeline.
Environments (dev/prod) as Terraform workspaces.

---

## 7A. Two-part architecture — App & AIBackend

The system splits into two independently deployable parts communicating over one clean
inference API:

**Part 1 — App (business logic).** Next.js web app, orchestrator/API, DB, credits,
payments, analytics, and the service *interfaces* (`LyricsService`,
`MusicGenerationService`, `VoiceConversionService`). Deployed on GCP via Terraform.
Knows nothing about how models run.

**Part 2 — AIBackend (model dev & serving).** Self-hosted on the 4× L40S server. Serves
inference behind an HTTP API and is also where models are fine-tuned, evaluated,
versioned, and promoted. The App's `MusicGenerationService` (and later
`VoiceConversionService`) adapters call this API.

- **Repo:** monorepo, single GitHub repo, top-level `/app` and `/ai-backend`.
- **Boundary contract:** the inference API uses the same `MusicRequest`/`MusicResult`
  shapes — so the App stays on managed cloud while the AIBackend evolves independently.

## 7B. AIBackend module — self-hosted serving & fine-tuning (4× L40S)

**Hardware:** 4× NVIDIA L40S (48 GB each, 192 GB total) — enough to self-host ACE-Step
inference **and** run LoRA/full fine-tunes. Marginal GPU cost drops to ~electricity;
fine-tuning compute becomes essentially free.

### Serving
- ACE-Step wrapped in a **FastAPI inference server**; one model worker pinned per GPU
  (GPU affinity) behind an internal queue → 4-way parallelism.
- Implements the `AceStepSelfHosted` adapter contract (same `MusicRequest`/`MusicResult`).
- Models kept **warm in VRAM** (no cold start); health checks; batching where possible.
- Container: **Docker + NVIDIA Container Toolkit**, pinned CUDA/driver versions.

### Connectivity (App on GCP ↔ server)
- **Cloudflare Tunnel (`cloudflared`)** exposes the inference API with TLS + a service
  token — no public IP, no port-forwarding, no firewall holes. Fits existing Cloudflare use.
- Auth: service token / mTLS; allowlist the App's egress.

### Reliability (single, borrowed box — design for it)
- **Router pattern:** AIBackend is **primary**; **external serverless GPU is automatic
  fallback** on downtime/saturation — pure config in the abstraction.
- **Durable queue** (Cloud Tasks) so jobs survive server downtime and retry.
- Heartbeat monitoring → route away on failure.

### Fine-tuning pipeline (Phase 2 — now near-zero compute cost)
- **Dataset prep:** audio ingest → vocal/instrumental separation → lyrics alignment →
  dialect/genre labeling → train/val splits. Curated & targeted (per the analytics
  heatmap), not bulk-scraped.
- **Training:** LoRA first (cheap/fast) → full fine-tune if justified; multi-GPU.
- **Experiment tracking:** Weights & Biases or self-hosted MLflow.
- **Eval harness:** automatic + human-rated A/B vs the current served model
  (intelligibility, dialect accuracy, musicality), comparing `engineVersion`s on identical
  prompts via the abstraction.
- **Model registry & promotion:** versioned checkpoints; promote a new `engineVersion` to
  serving via config; instant rollback. Per-song provenance already tracked.

### Server infra-as-code
- **Ansible** provisions the box (drivers, CUDA, Docker, `cloudflared`, serving stack) —
  the AIBackend's equivalent of the App's Terraform. Reproducible and re-runnable.

### Data/privacy note
- User PII — and especially Phase-4 **biometric voice data** — flowing to a personally
  owned server raises compliance concerns. Mitigations: send only what inference needs
  (lyrics + style, **not** account PII), TLS in transit, **do not persist** user data on
  the server, and keep biometric voice profiles on controlled/encrypted storage with
  explicit consent (revisit hosting for Phase 4).

---

## 8. Analytics & data flywheel

Every event from the web app and the generation worker flows to one warehouse, sliced
into three dashboard groups.

**A. Client behavior & acquisition** — funnel (visit → wizard-start → step-completion →
preview → purchase → share); cuts by dialect/genre/occasion, voice gender, geo, device,
channel, time-to-purchase, repeat & referral rate, credit consumption.

**B. AI-engine performance (drives model decisions)** — per generation: `engineId` +
`engineVersion`, dialect, genre, quality rating (thumbs per take), **regenerate rate**
(dissatisfaction proxy), chosen take, latency, GPU cost/song, lyrics model + token cost.
Pivoted as a **dialect × genre × engine heatmap** → identifies popular-but-weak cells as
the Phase-2 fine-tuning target. Stored ratings + chosen-take data **become the labeled
preference dataset** for that fine-tune.

**C. Unit economics** — revenue, preview→purchase conversion, margin/song, CAC by
channel, LTV, GPU/LLM cost trends.

**Architecture (serverless, ~zero idle cost):**
```
Web app + worker ──emit typed events──▶ Pub/Sub ──BigQuery subscription──▶ BigQuery
                                                                              │
                                                          Looker Studio (free) · Metabase (Cloud Run, optional)
```
- **BigQuery** warehouse (free tier: 10 GB storage / 1 TB queries per month).
- **Pub/Sub → BigQuery subscription** — native, serverless, no ETL code.
- **Looker Studio** free dashboards; **Metabase on Cloud Run** optional for deep dives.
- Defined in the **same Terraform** stack.
- **Privacy by design:** events carry IDs and choices, **not** raw personal "story" text;
  consent banner; aligned with GDPR (diaspora) and MENA laws (e.g., Saudi PDPL).

---

## 9. Phased roadmap

**Phase 1 — MVP self-serve (~6–10 weeks).** Two parts in parallel: **App** (wizard →
LyricsService via Vercel AI SDK → MusicGenerationService → preview → Stripe credits →
share page; all dialects as prompt-based presets; analytics from day one;
Terraform-provisioned) and **AIBackend** (ACE-Step served on the 4× L40S server via
FastAPI + Cloudflare Tunnel, Ansible-provisioned), with external serverless GPU wired as
automatic fallback.

**Phase 2 — Quality & targeted fine-tuning (after traction).** On the L40S AIBackend
(compute ≈ free): using the engine heatmap, build a curated, lyric-aligned dataset only
for the popular-but-weak dialect×genre cells; run **LoRA fine-tunes**; eval-harness A/B
vs the served model via the abstraction; promote `AceStepFineTuned` by config with instant
rollback.

**Phase 3 — Scale.** Migrate to self-hosted spot GPUs on GKE when volume beats per-call
pricing; more dialects/genres; mobile; B2B (wedding planners, event companies, brands).

**Phase 4 — Voice Cloning (premium).** Activate the `[3.5]` `VoiceConversionService` seam:
build the Voice Profile onboarding (guided live capture + QC + consent ledger), add SVC
adapters (RVC / so-vits-svc / Seed-VC), ship "sing in my voice" as a premium-priced tier.
The MVP is pre-seamed for this (§4, §6.3), so no re-architecture is required.

---

## 10. Unit economics

- **Cost per song:** on the self-hosted L40S server, GPU cost ≈ **electricity only**
  (cents); lyrics LLM (~$0.01–0.05) + storage. Fallback external GPU (~$0.05–0.30) only
  when failing over. → effectively **near-zero marginal cost/song** at primary path.
- **Fine-tuning compute:** ~free (owned hardware) — so Phase-2 fine-tuning can begin as
  soon as enough preference data exists, not gated by GPU budget.
- **Price per song:** credit packs at **~$3–8/song-equivalent** *(tunable assumption,
  pending market validation)*.
- → **Gross margin ~95%+ per song** (self-hosted primary). Viability hinges on cheap
  buyer acquisition — monitored continuously via the analytics CAC dashboards.
- **Voice-cloning premium tier (Phase 4):** likely a one-time **profile-setup fee** +
  a **higher per-song credit cost**. Added GPU cost per song (stem-separation + SVC) is
  still small relative to the premium price; expected to be the highest-margin product.

---

## 11. Legal & IP

- **Output side:** genre/dialect presets, **no artist names** anywhere → avoids
  voice/likeness/passing-off claims (D2).
- **Training data (Phase 2 only):** scraping copyrighted recordings (e.g. YouTube) to
  fine-tune is **ToS-violating and copyright-gray** — the real legal exposure, *deferred*
  because the MVP does not train. At Phase 2, prefer licensed/royalty-free Arabic
  catalogs, Creative-Commons sources, or commissioned recordings; treat broad scraping as
  a last resort, eyes open.
- **User content:** moderate the personal "story" input (no hate/defamation in lyrics).
- **Terms:** grant the buyer a license to their generated song; clear refund policy;
  age gate.
- **Voice cloning (Phase 4) — biometric & anti-abuse:** voice profiles are **biometric
  PII** (GDPR special-category + MENA PDPL). Mandated controls: **live randomized-phrase
  capture** (proof of voice ownership / liveness — no arbitrary uploads), **explicit
  consent**, encryption at rest, retention limits, and **hard-delete on request**.
  Prohibited-use terms forbid cloning third parties; takedown + ban policy enforced.

---

## 12. Success metrics

Visitor → wizard-start · wizard → preview · **preview → purchase (key)** · cost per song ·
gross margin · **song quality rating** (thumbs per take) · regenerate rate · dialect/genre
mix · gift-share/referral rate · CAC by channel · LTV.

---

## 13. Risks & mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Arabic vocal intelligibility (base model) | High | Transliteration prompting, 2 takes + select, regenerate, Phase-2 fine-tune priority |
| Cheap buyer acquisition unproven | High | Analytics CAC dashboards; lean spend until conversion proven |
| GPU cost spikes with volume | Medium | Adapter swap to self-hosted spot GPUs; capability/cost-aware routing |
| Phase-2 training-data legality | Medium | Defer; prefer licensed/CC/commissioned data |
| User-content safety (custom lyrics) | Medium | Moderation on story input + generated lyrics |
| Model/provider lock-in | Low | Vercel AI SDK + `MusicGenerationService` abstraction |
| Voice-clone abuse (cloning third parties) *(Phase 4)* | High | Live randomized-phrase capture/liveness, explicit consent, prohibited-use terms, takedown + ban |
| Biometric data handling *(Phase 4)* | High | Encryption at rest, retention limits, hard-delete, GDPR/PDPL alignment |
| Single self-hosted server (no SLA, borrowed) | High | Self-hosted primary + **external GPU automatic fallback** + durable queue + heartbeat routing |
| Self-hosted endpoint security exposure | Medium | Cloudflare Tunnel (no open ports) + service-token/mTLS + egress allowlist |
| PII/biometric data on a personal server | Medium | Send only inference-needed data, no persistence on box, TLS, revisit hosting for Phase 4 |

---

## 14. Open questions & assumptions

- **Pricing band** $3–8/song is an assumption to validate against the target buyers.
- **Voice/genre catalog** — exact preset list per dialect to be finalized during Phase 1.
- **Watermark approach** for previews (audio overlay vs. low-bitrate snippet) — to decide in implementation.
- **Local payment rails** (Paymob/Tap) — deferred until Egypt/local-card volume justifies.
- **L40S server terms** — access/SLA agreement with the server owner (friend), who
  administers it, power/uptime expectations, and data-handling terms (esp. for Phase-4
  biometric data).

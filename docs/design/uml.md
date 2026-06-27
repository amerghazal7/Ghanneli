# Ghanneli — UML & Architecture Diagrams (Mermaid)

**Version:** 1.0 (MVP) · **Date:** 2026-06-27
**References:** `docs/requirements/SRS.md`, `docs/superpowers/specs/2026-06-27-ghanneli-design.md`, `docs/superpowers/plans/2026-06-27-ghanneli-mvp.md`.

These diagrams are the visual reference design for the MVP. They are normative for structure; requirement IDs (FR/NFR/DR) trace to the SRS.

---

## 1. Use-case diagram

```mermaid
flowchart TB
  visitor([Visitor])
  user([Registered User])
  operator([Operator/Admin])
  stripe([Stripe])

  subgraph Ghanneli
    UC1((Browse / view share page))
    UC2((Create song via wizard))
    UC3((Preview watermarked song))
    UC4((Sign in))
    UC5((Buy credit pack))
    UC6((Unlock full song))
    UC7((Rate take))
    UC8((Configure engine routing/version))
    UC9((Monitor analytics))
  end

  visitor --- UC1
  visitor --- UC2
  visitor --- UC3
  user --- UC2
  user --- UC4
  user --- UC5
  user --- UC6
  user --- UC7
  UC5 --- stripe
  operator --- UC8
  operator --- UC9
```

---

## 2. Container / component diagram (two-part architecture)

```mermaid
flowchart LR
  subgraph Client
    B[Browser RTL/Arabic]
  end

  subgraph App["App (GCP Cloud Run) — engine-blind business logic"]
    WEB[Next.js Web + API]
    ORCH[Generation Orchestrator]
    LYR[LyricsService<br/>Vercel AI SDK]
    ROUTER[MusicGenerationService Router<br/>cloud-prod / self-host / a-b / fallback]
    CRED[Credit Ledger]
    PAY[Payments]
    ANA[Analytics Emitter]
    Q[(Cloud Tasks)]
  end

  subgraph Data
    DB[(Neon Postgres)]
    R2[(Cloudflare R2)]
    PS[[Pub/Sub]]
    BQ[(BigQuery)]
  end

  subgraph Engines
    CLOUD[AceStepCloudProd<br/>cloud GPU - PRODUCTION]
    LAB[AIBackend FastAPI<br/>4x L40S - LAB/STAGING]
  end

  EXT_LLM[[LLM provider via AI SDK]]
  STRIPE[[Stripe]]
  AUTH[[Firebase Auth]]
  LS[[Looker Studio]]

  B --> WEB
  WEB --> AUTH
  WEB --> ORCH
  WEB --> PAY --> STRIPE
  ORCH --> Q --> ORCH
  ORCH --> LYR --> EXT_LLM
  ORCH --> ROUTER
  ROUTER --> CLOUD
  ROUTER -. optional/staging .-> LAB
  ORCH --> R2
  WEB --> DB
  CRED --> DB
  ANA --> PS --> BQ --> LS
  ORCH --> ANA
  LAB == promote validated checkpoint ==> CLOUD
```

---

## 3. Class / interface diagram (engine & lyrics abstractions)

```mermaid
classDiagram
  class MusicGenerationService {
    <<interface>>
    +generate(req: MusicRequest) MusicResult
  }
  class LyricsService {
    <<interface>>
    +generateLyrics(req: LyricsRequest) LyricsResult
  }
  class MusicRequest {
    +string taggedLyrics
    +string transliteration
    +string[] styleTags
    +Dialect dialect
    +string genre
    +int bpm
    +VoiceGender voiceGender
    +string voiceProfileId
    +int durationSec
    +int numTakes
  }
  class MusicResult {
    +MusicTake[] takes
    +string engineId
    +string engineVersion
    +map meta
  }
  class MusicTake {
    +string audioUri
    +int durationSec
    +float score
  }
  class AceStepCloudProd
  class AceStepSelfHostStaging
  class MusicRouter {
    +mode: RouterMode
    +generate(req) MusicResult
  }
  class LyricsResult {
    +string taggedLyricsArabic
    +string transliteration
    +string language
    +map meta
  }

  MusicGenerationService <|.. AceStepCloudProd
  MusicGenerationService <|.. AceStepSelfHostStaging
  MusicGenerationService <|.. MusicRouter
  MusicRouter o-- MusicGenerationService : primary
  MusicRouter o-- MusicGenerationService : secondary
  MusicGenerationService ..> MusicRequest
  MusicGenerationService ..> MusicResult
  MusicResult *-- MusicTake
  LyricsService ..> LyricsResult
```

---

## 4. Entity-relationship diagram (data model)

```mermaid
erDiagram
  USER ||--o{ SONG : creates
  USER ||--o{ CREDIT_LEDGER : has
  USER ||--o{ ORDER : places
  SONG ||--o{ RATING : receives

  USER {
    uuid id PK
    string authUid
    string email
    timestamp createdAt
  }
  SONG {
    uuid id PK
    uuid userId FK
    string occasion
    string dialect
    string genre
    string voiceGender
    string status
    string previewUri
    string fullUri
    string shareSlug
    bool unlocked
    string engineId
    string engineVersion
    string lyricsModel
    timestamp createdAt
  }
  CREDIT_LEDGER {
    uuid id PK
    uuid userId FK
    int delta
    string reason
    string refId
    timestamp createdAt
  }
  ORDER {
    uuid id PK
    uuid userId FK
    string packId
    int amountMinor
    string currency
    string stripeSessionId
    string status
    timestamp createdAt
  }
  RATING {
    uuid id PK
    uuid songId FK
    int takeIndex
    string thumb
    timestamp createdAt
  }
```

---

## 5. Song lifecycle (state diagram)

```mermaid
stateDiagram-v2
  [*] --> pending : wizard submit (FR-6)
  pending --> lyrics : LyricsService (FR-8)
  lyrics --> generating : MusicService.generate (FR-12)
  generating --> postprocess : takes returned
  postprocess --> ready : preview+full stored (FR-18)
  ready --> [*]
  lyrics --> failed : error
  generating --> failed : engine error
  postprocess --> failed : ffmpeg/storage error
  failed --> pending : regenerate (FR-20)
```

---

## 6. Sequence — generate a song (async)

```mermaid
sequenceDiagram
  actor U as User
  participant W as Web/API
  participant DB as Postgres
  participant Q as Cloud Tasks
  participant O as Orchestrator
  participant L as LyricsService
  participant R as Music Router
  participant E as Engine (cloud/lab)
  participant S as R2 Storage
  participant A as Analytics

  U->>W: POST /api/songs (wizard data) [FR-4/5]
  W->>DB: insert song(status=pending)
  W->>Q: enqueueGeneration(songId) [FR-6]
  W-->>U: {songId, shareSlug}
  Q->>O: worker /api/jobs/generate (OIDC)
  O->>L: generateLyrics(req) [FR-8/9]
  L-->>O: {taggedLyricsArabic, transliteration}
  O->>R: generate(MusicRequest) [FR-12/13]
  R->>E: POST /generate
  E-->>R: MusicResult{takes, engineId, engineVersion}
  R-->>O: MusicResult [FR-16 provenance]
  O->>S: upload full + watermarked preview [FR-17/18]
  O->>DB: update song(status=ready, uris, provenance)
  O->>A: emit generation_completed [FR-27]
  loop poll
    U->>W: GET /api/songs/:id/status
    W-->>U: {status, previewUri}
  end
  U->>U: play preview
```

---

## 7. Sequence — buy credits & unlock full song

```mermaid
sequenceDiagram
  actor U as User
  participant W as Web/API
  participant P as Payments
  participant ST as Stripe
  participant H as Webhook
  participant C as Credit Ledger
  participant DB as Postgres

  U->>W: POST /api/checkout {packId} [FR-21]
  W->>P: createCheckoutSession(userId, packId)
  P->>DB: insert order(status=pending)
  P->>ST: create session
  ST-->>U: hosted checkout
  U->>ST: pay
  ST->>H: checkout.session.completed (signed) [IR-3]
  H->>H: verify signature
  H->>DB: order.status=paid
  H->>C: credit(userId, packCredits, "purchase", orderId) [FR-22 idempotent]
  U->>W: POST /api/songs/:id/unlock [FR-23]
  W->>C: debit(userId, 1, "song", songId)
  alt sufficient balance
    C-->>W: ok (idempotent by refId)
    W->>DB: song.unlocked=true
    W-->>U: {fullUri}
  else insufficient
    C-->>W: InsufficientCreditsError
    W-->>U: 402 [FR-24]
  end
```

---

## 8. Model release pipeline (Phase 2 — fine-tune → promote)

```mermaid
flowchart LR
  D[Curated dialect x genre dataset] --> T[LoRA / full fine-tune<br/>on 4x L40S]
  T --> CK[Versioned checkpoint<br/>+ eval scores]
  CK --> V{Eval gate +<br/>A-B vs prod}
  V -- fail --> T
  V -- pass --> PKG[Package image]
  PKG --> PROMO[Promote to cloud<br/>release version N]
  PROMO --> PROD[(Cloud production serving)]
  PROD -- regression --> RB[Rollback to N-1]
```

---

## 9. Analytics flywheel (data → decision)

```mermaid
flowchart LR
  APP[App + Worker events] --> PS[[Pub/Sub: analytics-events]]
  PS --> BQ[(BigQuery: ghanneli_analytics.events)]
  BQ --> DASH1[Behavior / funnel]
  BQ --> DASH2[Engine heatmap<br/>dialect x genre x engineVersion]
  BQ --> DASH3[Unit economics]
  DASH2 --> DECIDE{Pick fine-tune target}
  DECIDE --> D[Phase-2 dataset for weak cells]
```

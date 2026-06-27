# Ghanneli (غنّيلي)

Personalized AI-generated **Arabic gift songs** — across dialects and the styles of the
hits people love. A SongOven-style product built for the Arab world.

## Project structure (two parts)

- **`/app`** — business logic: Next.js web app, orchestrator/API, credits, payments,
  analytics. Deployed on GCP via Terraform. *(scaffolded during implementation)*
- **`/ai-backend`** — model dev & serving: ACE-Step inference + fine-tuning on a
  self-hosted 4× L40S GPU server. *(scaffolded during implementation)*

The two parts communicate over one stable inference API (the `MusicGenerationService`
boundary), so the App runs on managed cloud while the AIBackend evolves independently.

## Design

The full design lives in
[`docs/superpowers/specs/2026-06-27-ghanneli-design.md`](docs/superpowers/specs/2026-06-27-ghanneli-design.md).

Status: **design approved; implementation plan next.**

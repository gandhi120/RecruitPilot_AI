# RecruitPilot AI

**AI Executive Voice Assistant** — answers recruiter phone calls on Varun Gandhi's behalf. When Varun is unavailable, the assistant picks up, **declares itself as an AI** (never impersonates Varun), asks permission, screens the opportunity, uses tools (calendar, resume, notify), and afterward generates a transcript + summary and notifies Varun.

Pipeline: **Exotel** (telephony) → **Deepgram** (speech-to-text) → **Claude** (LLM brain + tools) → **ElevenLabs** (text-to-speech), bridged over WebSockets by a **Fastify** backend, with a **Next.js** dashboard and **Supabase** (Postgres/Auth/Storage/Realtime) behind it.

## Documentation

The full engineering design + zero-to-deploy setup guide lives in [`docs/`](./docs) — 21 files, read in order, starting with [`docs/00_PROJECT_OVERVIEW.md`](./docs/00_PROJECT_OVERVIEW.md). Build sequencing is in [`docs/20_ROADMAP.md`](./docs/20_ROADMAP.md).

## Repository layout (monorepo, npm workspaces)

```
apps/api        # Fastify backend (TypeScript) — voice gateway, agent, REST API
apps/web        # Next.js dashboard (added in Phase 1)
packages/shared # Zod schemas, domain events, shared types (browser-safe)
docs/           # the 21-file documentation suite
```

See [`docs/03_FOLDER_STRUCTURE.md`](./docs/03_FOLDER_STRUCTURE.md) for the canonical structure.

## Getting started

```bash
nvm use                # Node 22 LTS (see .nvmrc)
npm install            # installs + links all workspaces
cp .env.example .env   # then fill in values as you reach each setup doc
```

Requires Node 22 LTS, Docker Desktop, and Git. Full prerequisites: [`docs/00_PROJECT_OVERVIEW.md`](./docs/00_PROJECT_OVERVIEW.md) §5.

## Status

Documentation complete. Implementation in progress — **Phase 0: Foundations** (see `docs/20_ROADMAP.md`).

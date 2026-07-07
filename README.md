# Tennis World

A curated luxury tennis-court discovery platform. This repository is the **web +
backend monorepo** (Turborepo + pnpm). The Flutter mobile app lives in a separate
repository and integrates only through the published API contract.

> **Status: Phase 0 (Foundation) complete.** This is the monorepo skeleton — shared
> contracts/data packages, a hello-world web app, a health-only API, an empty admin
> placeholder, and a disposable draft Prisma schema. No auth, no payments, no admin
> UI, no Phase 1 screens. See `docs/PHASE_0_FOUNDATION.md`.

## Structure

```
tennis-world/
├── apps/
│   ├── web/      Next.js (App Router, TS, Tailwind) — hello-world only in Phase 0
│   ├── api/      NestJS — /v1/health only in Phase 0; owns Prisma (apps/api/prisma)
│   └── admin/    Empty placeholder — Refine NOT installed until Phase 3
├── packages/
│   ├── contracts/  Shared DTOs, enums, zod schemas (single source of truth)
│   ├── mock-data/   Mock dataset ported from the HTML prototypes (also Phase-2 seed)
│   └── config/      Shared tsconfig / eslint / prettier
├── docker-compose.yml   Postgres only
└── turbo.json
```

## Prerequisites

- Node.js >= 20 (developed on v24)
- pnpm 11 (`npm i -g pnpm`)
- Docker (for local Postgres)

## Pinned versions (resolved at Phase 0 scaffold)

Per the version-pin policy, "latest stable" was resolved at scaffold time and is
locked by `pnpm-lock.yaml`:

| Package | Version |
|---|---|
| Next.js | 15.5.19 |
| React | 19.2.x |
| NestJS core | 10.4.22 |
| Prisma | 6.19.3 |
| TypeScript | 5.9.3 |
| Turborepo | 2.9.18 |

## Setup

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Start local Postgres
pnpm db:up           # docker compose up -d

# 3. Copy env templates
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Generate the Prisma client + apply the DRAFT schema
pnpm --filter @tennis/api prisma:generate
pnpm --filter @tennis/api exec prisma migrate dev --name 000_draft_do_not_build_on
```

> ⚠️ The Prisma schema and the `000_draft_do_not_build_on` migration are **draft /
> disposable** (Decision #13). Phase 2 resets the database and regenerates a
> finalized schema. Do not build production features against it.

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run all apps in dev (web on :3000, api on :3001) |
| `pnpm build` | Build every workspace |
| `pnpm lint` | Lint every workspace |
| `pnpm typecheck` | Typecheck every workspace |
| `pnpm format` | Prettier write |
| `pnpm db:up` / `pnpm db:down` | Start / stop local Postgres |

### Run a single app

```bash
pnpm --filter @tennis/web dev     # http://localhost:3000
pnpm --filter @tennis/api dev     # http://localhost:3001/v1/health
```

## What's next (Phase 1)

Build the `apps/web` UI mock-first and data-driven against local repository
interfaces (`apps/web/src/domain/*`) reading from `@tennis/mock-data`. See
`docs/PHASE_1_WEB_MOCK_FIRST.md`. No auth, no payments, no live API, and no
`apps/web/app/api` directory.

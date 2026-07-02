# Prixes Platform

Rewrite of the Prixes PWA onto a modern, scalable stack:

- **Frontend:** Next.js (App Router, TypeScript, Tailwind, PWA) — `apps/web`
- **Backend:** FastAPI (async, Pydantic v2, SQLAlchemy 2.0) — `apps/api`
- **Data:** PostgreSQL + PostGIS · Redis · S3/R2 object storage
- **Worker:** ARQ (ingestion, feed ranking, images, email)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design, references, and roadmap.

## Quick start (local)

```bash
cp .env.example .env            # fill in secrets
docker compose up -d            # postgres, redis
cd apps/api && uv sync          # backend deps
uv run alembic upgrade head     # migrations
uv run uvicorn app.main:app --reload --port 8000
# in another shell:
cd apps/web && pnpm install && pnpm dev
```

- API docs (OpenAPI/Swagger): http://localhost:8000/docs
- Web app: http://localhost:3000

## Repository layout

```
apps/web      Next.js frontend
apps/api      FastAPI backend + ARQ worker
packages/     shared (generated TS API client)
scripts/      Firestore → Postgres migration
```

## Build phases

Tracked in [ARCHITECTURE.md §12](./ARCHITECTURE.md#12-build-phases-roadmap--how-this-rewrite-proceeds).

- ✅ Phase 0 — Scaffold (monorepo, docker-compose, CI)
- ✅ Phase 1 — Backend core (auth, users, deals + votes, Redis feed ranking)
- ✅ Phase 2 — Products & fuel (OpenFoodFacts / OpenPrices / fuel ingestion + caching)
- ✅ Phase 3 — Frontend (App Router, 5 tabs, scanner, fuel geo, PWA, typed client)
- ✅ Phase 4 — Migration (`scripts/migrate_firestore.py`) + infra/CI
- ✅ Phase 5 — Hardening (Redis rate limits, GDPR export/delete, deal reporting + moderation)

### Endpoints (API)
`/api/v1/auth/{register,login,refresh,google}` · `/users/{me,:id}` ·
`/deals` (feed, create, vote, delete) · `/products/{search,:barcode,prices}` ·
`/fuel/nearby` · `/uploads/presign` · `/users/me/export` + `DELETE /users/me` (GDPR) ·
`/moderation/reports` · `/health` · `/docs`

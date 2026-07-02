# Prixes — System Design & Architecture

> Target rewrite: **Next.js (frontend) + Python/FastAPI (backend)**, replacing the
> current monolithic `index.html` PWA + Firebase (Auth/Firestore/Storage).
> Optimised for a **B2C**, read-heavy, mobile-first French market app.

Version: 1.0 · Date: 2026-06-27 · Owner: aymenrobert@gmail.com

---

## 1. What Prixes is

Prixes is a French consumer app that helps people **save money on everyday spending**:

| Domain | What the user does | Data source today |
|---|---|---|
| **Courses** (groceries) | Search/scan a product, compare prices, see nutrition/eco/NOVA badges | OpenFoodFacts + OpenPrices APIs |
| **Carburants** (fuel) | See nearby fuel prices, open in Maps | French open fuel-price data |
| **Deals** | Post / browse / upvote community deals, build reputation | Firestore |
| **Scanner** | Barcode scan → product lookup | ZXing / native BarcodeDetector |
| **Compte** | Email/Google auth, reputation, posted-deals count | Firebase Auth |

It is a **PWA**: installable, offline-capable (service worker), dark mode, haptics, voice search.

**Workload shape:** overwhelmingly **read-heavy** (browsing deals/prices) with bursty
writes (posting, voting). External third-party APIs are slow and rate-limited, so
**caching is the core architectural concern**, not raw compute.

---

## 2. Why move off the current design

The current app is a single 2,244-line `index.html` with all logic inline and Firebase as
the only backend. That was perfect for a v0/MVP, but for a growing B2C product it hits walls:

- **No server-side logic** → can't cache/normalise external APIs, can't rank feeds server-side,
  can't enforce business rules beyond Firestore security rules.
- **Vendor lock-in & cost cliffs** → Firestore reads (50k/day free) are the first thing to blow
  up on a read-heavy social feed; every render hits the DB.
- **No SEO / shareability** → deals are shareable content; a CSR-only app indexes poorly.
- **Untestable / unmaintainable** → one file, no modules, no types, no CI.
- **No control over abuse** → voting/posting fraud is hard to stop purely client-side.

The new design keeps what worked (PWA UX, free open-data sources) and adds a real
**server tier** that owns caching, ranking, auth, and abuse control.

---

## 3. Reference architectures (research)

This design is grounded in established patterns from comparable systems:

- **Next.js + FastAPI full-stack template** (Vinta Software) — the de-facto "state of the art"
  layout: separate `web`/`api`, async SQLAlchemy 2.0, Pydantic, OpenAPI-generated typed client,
  end-to-end type safety. <https://github.com/vintasoftware/nextjs-fastapi-template>
- **FastAPI Best Practices** (zhanymkanov, battle-tested at a startup) — domain-driven module
  layout, dependency-injection patterns, settings, async pitfalls.
  <https://github.com/zhanymkanov/fastapi-best-practices>
- **Production-ready FastAPI** — async top-to-bottom, health checks, observability, graceful
  shutdown. <https://oneuptime.com/blog/post/2026-01-26-fastapi-production-ready/view>
- **Read-heavy / feed-ranking systems** (Dealabs/Pepper, Reddit, Idealo class) — the standard
  pattern is **cache-aside with Redis**, **Redis Sorted Sets for ranked feeds/leaderboards**
  (`ZADD`/`ZREVRANGE`), trending recomputed on a short interval, CDN in front of read APIs.
  <https://redis.io/tutorials/operate/redis-at-scale/scalability/>
- **BaaS cost trade-off** — caching a read-heavy app typically cuts DB load 40–60%; this is why
  we put Redis + CDN in front of both our DB and the upstream open-data APIs.

**Closest analogues to Prixes** and what we borrow from each:
- **Dealabs / Pepper (mydealz)** → community deal feed with a *temperature* (hot/cold) ranking
  driven by votes + time decay. We adopt a Reddit/HN-style time-decayed score in a Sorted Set.
- **Yuka** → OpenFoodFacts-backed product scoring; we cache OFF responses aggressively.
- **Idealo / Google Shopping** → price aggregation per product; we model `product → price points`.
- **Waze/fuel apps & the French `prix-carburants` open data** → geo price lookup; we use
  PostGIS for "nearby stations".

---

## 4. Target architecture (high level)

```
                         ┌──────────────────────────────────────────┐
                         │                 Clients                    │
                         │   PWA (installable) · iOS/Android browser   │
                         └───────────────┬────────────────────────────┘
                                         │ HTTPS
                         ┌───────────────▼────────────────┐
                         │         CDN / Edge (Vercel)      │
                         │  static assets, ISR, image opt   │
                         └───────────────┬──────────────────┘
                                         │
              ┌──────────────────────────▼───────────────────────────┐
              │              Next.js (App Router) — apps/web           │
              │  RSC + SSR/ISR pages · server actions · typed API SDK   │
              │  Auth session (httpOnly cookie) · PWA service worker    │
              └──────────────────────────┬───────────────────────────┘
                                         │  REST/JSON (OpenAPI contract)
              ┌──────────────────────────▼───────────────────────────┐
              │                FastAPI (async) — apps/api               │
              │  Domains: auth · users · deals · votes · products ·     │
              │           fuel · uploads · admin                        │
              │  Pydantic v2 · SQLAlchemy 2.0 async · DI · rate limit    │
              └───┬───────────────┬───────────────┬───────────────┬────┘
                  │               │               │               │
        ┌─────────▼───┐   ┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼───────────┐
        │ PostgreSQL  │   │    Redis      │  │ Object store│  │ Background worker│
        │ + PostGIS   │   │ cache · feed  │  │ (S3/R2)     │  │ (ARQ/Celery)     │
        │ source of   │   │ sorted-sets   │  │ deal photos │  │ ingest · rank ·  │
        │ truth       │   │ rate-limit    │  │             │  │ image · email    │
        └─────────────┘   └──────────────┘  └─────────────┘  └────────┬─────────┘
                                                                       │
                                   ┌───────────────────────────────────▼─────────┐
                                   │      Upstream open-data (cached via worker)   │
                                   │  OpenFoodFacts · OpenPrices · prix-carburants │
                                   └───────────────────────────────────────────────┘
```

**Key principle:** the client **never** calls OpenFoodFacts/OpenPrices/fuel APIs directly
anymore. The backend ingests + caches them, so the app is fast, resilient to upstream outages,
and not rate-limited per-user.

---

## 5. Technology choices

### Frontend — `apps/web`
- **Next.js (App Router)** + **TypeScript**, React Server Components for read pages (deals feed,
  product pages) → SSR/ISR for SEO + speed; Client Components for scanner/voice/interactive bits.
- **Tailwind CSS** + a small design-token layer (port the existing green `#005c3c` theme).
- **TanStack Query** for client-side data (votes, infinite feed) + **server actions** for mutations.
- **next-pwa / Serwist** for the service worker, offline cache, install prompt (replaces hand-rolled `sw.js`).
- **Auth.js (NextAuth)** session in an httpOnly cookie; backend issues/validates JWT.
- **openapi-typescript** → generated, fully-typed API client from the FastAPI OpenAPI schema.
- Barcode scanning kept client-side: native `BarcodeDetector` with **ZXing** WASM fallback.

### Backend — `apps/api`
- **FastAPI** (async), **Pydantic v2** for schemas/settings, **uvicorn/gunicorn**.
- **SQLAlchemy 2.0 async** + **Alembic** migrations; **asyncpg** driver.
- **PostgreSQL 16 + PostGIS** (geo for fuel stations, full-text search for products/deals).
- **Redis** — cache-aside, Sorted-Set feed ranking, rate limiting, dedupe of votes.
- **ARQ** (async Redis-based task queue) for: upstream ingestion, feed recomputation, image
  processing, email. (Celery is the heavier alternative if we outgrow ARQ.)
- **fastapi-users** or custom JWT auth (email/password + Google OAuth) — mirrors current auth.
- **Object storage**: Cloudflare R2 / S3 for deal photos (replaces Firebase Storage), served via CDN.

### Cross-cutting
- **uv** for Python deps, **Ruff** + **mypy** for lint/type; **ESLint/Prettier** for web.
- **Docker** + **docker-compose** for local; **pytest** (async) + **Playwright** for e2e.
- **OpenTelemetry** traces, **Sentry** errors, structured JSON logs.

---

## 6. Data model (PostgreSQL)

Migrated from the Firestore collections (`deals`, `votes`, `users`) and normalised.

```
users
  id (uuid, pk) · email (unique) · username · initials · password_hash (nullable for OAuth)
  oauth_provider · oauth_sub · reputation (int) · deals_count · votes_received
  created_at · role (user|moderator|admin) · is_banned

deals
  id (uuid, pk) · author_id (fk users) · title · description · store · category
  price_now (numeric) · price_before (numeric) · discount_pct (computed)
  photo_url · link · expires_at · status (active|expired|removed)
  votes_up · votes_down · score (cached ranking score) · created_at
  search_tsv (tsvector, GIN index)

votes
  user_id (fk) · deal_id (fk) · value (+1 / -1) · created_at
  PRIMARY KEY (user_id, deal_id)         -- one vote per user per deal, enforced

products                                  -- cache/normalisation of OpenFoodFacts
  barcode (pk) · name · brand · image_url · nutriscore · ecoscore · nova_group
  categories · raw_off (jsonb) · fetched_at

price_points                              -- from OpenPrices + user contributions
  id · barcode (fk) · store · price (numeric) · currency · source (off|op|user)
  contributor_id (nullable fk) · location · created_at

fuel_stations                             -- from prix-carburants open data
  id · brand · address · geo (geography Point, GiST index)
  prices (jsonb: gazole/sp95/sp98/e85/gplc) · updated_at
```

Indexes that matter: `deals(score desc)` partial on `status='active'`,
GIN on `deals.search_tsv` and `products` trigram, GiST on `fuel_stations.geo`.

---

## 7. Feed ranking (the core read path)

Mirrors Dealabs/Reddit "hot" ranking, computed server-side, cached in Redis:

```
score = log10(max(|up - down|, 1)) * sign(up - down)
        + (created_epoch - EPOCH_BASE) / 45000        # time decay (~12.5h half-step)
```

- On each vote, the worker recomputes the deal's score and does
  `ZADD deals:feed:hot <score> <deal_id>` (Redis Sorted Set).
- Feed endpoints read ranked IDs with `ZREVRANGE` (paginated), then `MGET` the deal
  payloads from a Redis hash cache (cache-aside, TTL + invalidation on write).
- "Nouveaux" / "Top" feeds are separate Sorted Sets keyed by `created_at` / raw score.
- This keeps the hot path **O(log n)** in Redis with **zero DB hits** on a cache hit.

---

## 8. Caching strategy

| Layer | What | Policy |
|---|---|---|
| CDN/Edge | static assets, ISR product & deal pages | Next.js ISR `revalidate`, stale-while-revalidate |
| Redis (app) | deal payloads, feed sorted-sets, user reputation | cache-aside, TTL + explicit invalidation on mutation |
| Redis (upstream) | OFF / OpenPrices / fuel responses | TTL per source (products 7d, prices 1h, fuel 1h) |
| Postgres | source of truth + materialised search | — |

Upstream ingestion runs in the worker (scheduled + on-demand on cache miss), never on the
user's request path beyond a fast cache lookup. Upstream outage ⇒ serve stale, flag freshness.

---

## 9. Security, privacy & abuse (B2C + GDPR)

- **EU data residency** (current app already chose `europe-west`): host DB + storage in EU.
- **Auth**: JWT access (short-lived) + refresh, httpOnly+Secure+SameSite cookies, password hashing
  with Argon2; Google OAuth via Auth.js. Email verification before first post.
- **Authorization**: server-enforced (replaces Firestore rules). Author-only edit/delete;
  vote = one row per `(user, deal)` enforced by PK; moderators can remove.
- **Abuse / fraud**: Redis rate limits (per-IP + per-user) on post/vote/upload; vote dedupe;
  content moderation queue; image scanning on upload; link/URL safety checks.
- **Input validation** at the edge with Pydantic (mirrors the current Firestore rule checks:
  title length, `price_now < price_before`, positive prices).
- **GDPR**: data export + account deletion endpoints, consent/cookie banner, minimal PII, audit log.
- **Secrets**: never in client; env + secret manager. CSP, HSTS, CORS allow-list.

---

## 10. Deployment topology

**Recommended (cost-efficient, scales):**
- **Web**: Vercel (Next.js native, edge CDN, ISR, image optimisation).
- **API + worker**: containers on Fly.io / Railway / Render (EU region) — or AWS ECS Fargate later.
- **DB**: managed Postgres (Neon / Supabase Postgres / RDS) with PostGIS, read replica when needed.
- **Redis**: Upstash / managed Redis (EU).
- **Object storage**: Cloudflare R2 (S3-compatible, no egress fees) + CDN.

**Scaling path:** start single API instance → horizontal scale stateless API behind LB →
add Postgres read replica → shard Redis / add read replicas → move ingestion to scheduled jobs.
Free-tier-friendly equivalents exist for every box to keep launch cost near €0.

---

## 11. Migration plan (Firestore → Postgres)

1. **Dual-read shim**: export Firestore `deals/votes/users` via Admin SDK → JSON.
2. **Transform**: map fields (`vOui/vNon → votes_up/votes_down`, `ini → initials`, etc.),
   recompute `score`, derive `discount_pct`.
3. **Load**: bulk insert into Postgres (Alembic-migrated schema), upload photos Firebase Storage → R2.
4. **Backfill caches**: warm Redis feed Sorted Sets + product cache.
5. **Cutover**: deploy new stack on a staging domain, smoke-test, then flip DNS; keep Firebase
   read-only as rollback for one cycle.
6. Decommission Firebase once stable.

A `scripts/migrate_firestore.py` will implement steps 1–4 idempotently.

---

## 12. Build phases (roadmap / how this rewrite proceeds)

- **Phase 0 — Scaffold**: monorepo, docker-compose, tooling, CI. *(this iteration)*
- **Phase 1 — Backend core**: config, DB, auth, users, deals + votes, Redis feed.
- **Phase 2 — Products & fuel**: cached OFF/OpenPrices/fuel ingestion + endpoints.
- **Phase 3 — Frontend**: App Router shell, all 6 tabs, typed SDK, PWA, auth.
- **Phase 4 — Migration + infra**: Firestore importer, deploy configs, observability.
- **Phase 5 — Hardening**: rate limits, moderation, tests, load test, GDPR endpoints.

Each phase is independently shippable and testable.

---

## 13. Repository layout

```
prixes-platform/
├── ARCHITECTURE.md            ← this document
├── README.md
├── docker-compose.yml
├── .env.example
├── apps/
│   ├── web/                   ← Next.js (App Router, TS, Tailwind, PWA)
│   └── api/                   ← FastAPI (async) + worker
│       ├── app/
│       │   ├── main.py
│       │   ├── core/          ← config, security, db, redis, deps
│       │   ├── domains/
│       │   │   ├── auth/   users/   deals/   products/   fuel/   uploads/
│       │   │   └── (each: router.py, schemas.py, models.py, service.py)
│       │   └── worker/        ← ARQ tasks: ingest, rank, images, email
│       ├── alembic/
│       ├── tests/
│       └── pyproject.toml
├── packages/
│   └── api-client/            ← generated TS client from OpenAPI
└── scripts/
    └── migrate_firestore.py
```

---

*Living document — updated as the rewrite progresses through the phases above.*

# Load testing (k6)

Load tests for Prixes' read-heavy endpoints (catalog, search, deals feed,
nearby-stores). Written for [k6](https://k6.io) — a single static binary, no
Python/Node runtime needed on top of what already runs the app.

This was the last unaddressed item from the 2026-07-15 SIT audit ("Aucun test
de charge"). Not wired into CI — load tests are meant to be run deliberately
against a specific target (local, staging, or prod during a quiet window), not
on every push.

## Install k6

- Windows: `winget install k6 --source winget` (or download from k6.io)
- macOS: `brew install k6`
- Linux: see https://k6.io/docs/get-started/installation/

## Running

```bash
# 1. Smoke test first — 1 user, 3 requests, fails fast if something's broken.
k6 run loadtest/smoke.js

# 2. Full ramp test against local dev (postgres/redis/api running via docker compose).
k6 run loadtest/api-load.js

# Against staging/prod — use sparingly, see the warning below.
BASE_URL=https://prixes.omnilink.software k6 run loadtest/api-load.js
```

## What `api-load.js` does

Ramps 0 → 10 → 50 virtual users over ~2 minutes, each looping:
catalog browse → product search → deals feed → nearby-stores lookup, with a
1-3s "think time" between requests to approximate a real user rather than a
tight request-spam loop.

Thresholds (the run fails if these aren't met):
- Error rate < 1%
- p95 latency < 500ms, p99 < 1.5s

## ⚠️ Before running against the production URL

- `nearby-stores` calls out to the public OpenStreetMap Overpass API on a cache
  miss, and `geocode` calls Nominatim — both are shared, rate-limited public
  services. The load test intentionally reuses one fixed coordinate so repeat
  requests hit Prixes' own Redis cache instead of re-querying OSM, but don't
  run many parallel load tests or add more distinct coordinates without
  understanding that cache.
- Coordinate with anyone else operating the droplet before running the ramp
  test against prod — 50 concurrent users is real load on a small droplet.
- Prefer running the full `api-load.js` against a local or staging stack, and
  reserve the prod target for the lightweight `smoke.js`.

## Interpreting results

k6 prints a summary at the end (`http_req_duration`, `http_req_failed`, per-
threshold pass/fail). If `http_req_failed` rate creeps up or p95 crosses the
threshold, check `docker compose logs api` / `docker compose logs db` for the
first sign of saturation (connection pool exhaustion, slow queries) before
assuming it's a capacity problem — see [`docs/ROLLBACK.md`](../docs/ROLLBACK.md)
if a bad deploy is the actual cause.

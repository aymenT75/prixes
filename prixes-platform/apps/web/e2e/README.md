# E2E tests (Playwright)

Browser-level "does the golden path actually work" tests, run against a real
running instance of the app — a different layer than the Vitest unit tests in
`src/lib/*.test.ts`, which only cover pure functions.

## Scope: unauthenticated flows only

Login goes through Firebase Auth directly in the browser (`AuthModal.tsx`) —
there's no Firebase test project wired in here, so any real sign-in can't be
automated without one. These tests cover what doesn't require a session:
home page, product search/browse, the stores geolocation-fallback (the exact
RGPD requirement added in the audit's module 3 — geolocation must never be the
*only* way in), the manual barcode entry on the scanner page, and the privacy
policy page.

If Firebase test credentials are ever added, a `auth.spec.ts` covering
login → add to shopping list → logout would be the natural next addition.

## Running locally

Requires the full stack up (Postgres + Redis + API), seeded with data:

```bash
docker compose up -d                      # postgres, redis
cd apps/api && uv run alembic upgrade head && uv run python scripts/seed.py
cd apps/api && uv run uvicorn app.main:app --port 8000 &   # in the background

cd apps/web
npx playwright install chromium           # first time only
npm run test:e2e                          # auto-starts `next dev` for you
```

Playwright's config auto-starts `next dev` unless `E2E_BASE_URL` is set. To run
against an already-running server (dev, or a deployed environment) instead:

```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

## Debugging a failure

```bash
npx playwright test --ui        # interactive UI mode, step through actions
npx playwright show-report      # HTML report from the last run
```

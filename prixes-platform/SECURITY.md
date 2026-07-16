# Security Policy

Prixes is a French grocery price-comparison PWA (web + iOS/Android via Capacitor).
This document describes how to report a vulnerability and summarizes the security
measures already in place, so reporters can judge what's already covered.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email **aymenrobert@gmail.com** with:
- A description of the vulnerability and its potential impact
- Steps to reproduce (a minimal repro is ideal)
- Any relevant logs, requests, or screenshots

This is a small, single-maintainer project — there is no bug bounty program, but
every report will be acknowledged and looked at. Please allow a reasonable time
to investigate and ship a fix before any public disclosure.

## Supported versions

Only the `main` branch / production deployment (https://prixes.omnilink.software)
is supported. There are no maintained older versions.

## Scope

In scope: the web app, the FastAPI backend (`apps/api`), the ARQ worker, and the
mobile apps built from this repository via Capacitor.

Out of scope: third-party services Prixes depends on (OpenFoodFacts, OpenPrices,
OpenStreetMap/Nominatim/Overpass, Firebase, OpenAI, Sentry) — report issues in
those upstream.

## What's already in place

- **Authentication**: Firebase Auth (Google + email/password) is the identity
  provider; the backend verifies Firebase ID tokens (PyJWT + JWKS, audience/issuer
  checked) and mints its own short-lived JWT access token (15 min) + refresh token
  (30 days). Passwords for any legacy local accounts are hashed with Argon2.
- **Authorization**: role-based checks (`user` / `moderator` / `admin`) on every
  admin/moderation endpoint, enforced server-side via FastAPI dependencies —
  never trusted from the client.
- **Transport**: HTTPS everywhere in production (Caddy, automatic Let's Encrypt
  certs); HTTP is not exposed.
- **Input validation**: every request body is a Pydantic v2 schema with explicit
  bounds (e.g. price contributions are rejected outside €0.01–€1000 — see
  `app/domains/products/schemas.py` and `ingest.py`'s `is_plausible_price`).
- **SQL injection**: 100% SQLAlchemy ORM / parameterized queries — no raw string-
  interpolated SQL anywhere in the codebase.
- **Rate limiting**: sensitive/expensive endpoints (auth, geocoding, TTS,
  price-alert evaluation) are rate-limited per client (`app/core/rate_limit.py`),
  falling back to per-IP limiting for unauthenticated requests.
- **CORS**: explicit origin allowlist (`CORS_ORIGINS` env var), not a wildcard.
- **Secrets**: never committed — `.env` files are gitignored, and production
  secrets live only in the droplet's `.env.production` (never read or echoed by
  tooling/automation working on this repo).
- **Data minimisation / GDPR (RGPD)**: users can export (`/account` → "Exporter
  mes données") and permanently delete their account and all associated data;
  anonymous analytics events are pruned automatically after 90 days
  (`prune_analytics` worker cron); see [`/privacy`](https://prixes.omnilink.software/privacy)
  for the full policy.
- **Dependency hygiene**: CI (`ruff` + `mypy` in strict mode for the backend,
  `eslint` + `tsc` for the frontend) runs on every push/PR; see
  `.github/workflows/ci.yml`.
- **Backups & rollback**: automated daily encrypted-at-rest DB backups with a
  14-day retention, plus a one-command image rollback — see
  [`docs/ROLLBACK.md`](./docs/ROLLBACK.md).

## Known limitations (accepted risk, not currently planned)

- No formal penetration test has been performed; this is a small side project,
  not a funded product with a security budget.
- No Web Application Firewall in front of the API beyond Caddy + application-level
  rate limiting.

If you believe any of the above is inaccurate or insufficient, that's useful
information too — say so in your report.

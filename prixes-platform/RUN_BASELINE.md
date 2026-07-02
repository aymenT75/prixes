# Run the working baseline

Everything below is on your machine already (Python 3.14, uv, Node 26, Docker are installed).
The app uses **PostgreSQL + JWT** — there is no Firebase in this stack anymore, so "make Firebase
work" = run the backend + seed data, then log in with the demo account.

## 1. Start infrastructure (Postgres + Redis)
Make sure **Docker Desktop is running** (whale icon steady), then:
```bash
cd prixes-platform
docker compose up -d db redis
```

## 2. Backend: install, migrate, seed
```bash
cd apps/api
uv sync                      # installs deps into .venv
uv run alembic upgrade head  # creates tables + enables PostGIS

# Seed REAL French products (OpenFoodFacts) + multi-store prices + demo deals:
uv run python scripts/seed.py            # ~48 products across 6 categories, 6 stores
# Pull live fuel prices from the official French gov API:
uv run python scripts/ingest_fuel.py
```
The `.env` is already written for local Docker defaults (`apps/api/.env`).

## 3. Run the API
```bash
uv run uvicorn app.main:app --reload     # http://localhost:8000  (/docs for Swagger)
```

## 4. Run the web app (new terminal)
```bash
cd apps/web
npm install
cp .env.local.example .env.local         # points to http://localhost:8000
npm run dev                              # http://localhost:3000
```

## 5. Log in
**Email:** `demo@prixes.app`  ·  **Password:** `demo1234`  (admin, 1240 rep)
Or register a fresh account from the app.

---

## What you'll see
- **Accueil / Deals** — seeded community deals (real product photos, discounts, votes).
- **Courses** — "Produits populaires" lists the seeded catalogue; search hits OpenFoodFacts live;
  each product shows the 6-supermarket price comparison (Lidl, Aldi, E.Leclerc, Intermarché,
  Auchan, Carrefour).
- **Carburant** — allow location → nearest real stations with live gov prices + itinéraire.

## Notes on the data
- **Products** are real (OpenFoodFacts FR): real EAN barcodes, names, brands, images, Nutri/Eco/NOVA.
- **Store prices** are synthesised deterministically around a per-category base (`source="seed"`).
  Live Lidl/Aldi/Carrefour scraping isn't reliable enough for a baseline (JS + bot protection);
  the extension point to wire real retailer feeds is `apps/api/scripts/retailers/base.py`.
- **Fuel** is 100% real, straight from `donnees.roulez-eco.fr` (no synthesis). The ARQ worker also
  refreshes it hourly: `uv run arq app.worker.main.WorkerSettings`.

Re-running `seed.py` is safe (idempotent): products upsert, prices/deals only added when absent.

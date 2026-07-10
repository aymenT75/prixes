# Prixes V1.0.0 — Release Notes

**Released :** 2026-07-10  
**Tag :** `v1.0.0`  
**Live :** https://prixes.omnilink.software

---

## ✨ Features

### Core
- 🔍 **Price comparison** — search products, see best prices across retailers
- 📍 **Nearby stores** — find closest supermarket + driving route (OSRM)
- ⛽ **Fuel finder** — cheapest fuel stations nearby (Diesel/SP95-E10/E85)
- 📱 **Shopping list** — add products, track what you need
- 🏪 **Store map** — Leaflet interactive map with OpenStreetMap

### Accessibility
- 🎙️ **Voice assistant** — French neural voices (browser + OpenAI TTS opt-in)
- 🔊 **Voice input** — speak to search
- ♿ **WCAG 2.1 AA** — light/dark/high-contrast modes, keyboard nav, screen reader
- 🔤 **Text scaling** — user-controlled font sizes

### Brand & Design
- 🎨 **Light Frost theme** — Material Design 3, cool blue palette (light + dark + contrast)
- 🔷 **Logo** — 4-arrow X + green price tag, SVG vector
- 📱 **PWA** — installable, offline-ready (with cache)
- 📲 **Native** — Capacitor wrapper (iOS/Android builds)

### Analytics & Feedback
- 📊 **Anonymous usage tracking** — session-based, respects Do Not Track, no cookies
- 💬 **Feedback form** (`/feedback`) — star rating + message, works anonymous or logged-in
- 👤 **Admin dashboard** — `/admin/feedback` (read submissions), `/admin/analytics` (usage stats)
- 📈 **Rate-limited APIs** — anti-spam protection

### User Testing
- 📋 **Protocol** — 8 tasks, SUS questionnaire, observation grid
- 📧 **Invitation kit** — email template, NDA, testee guide, facilitator checklist
- 📊 **Tracking sheet** — Google Sheets template for results

---

## 🏗️ Architecture

**Frontend :** Next.js 15 (React), Tailwind CSS, TypeScript  
**Backend :** FastAPI, async SQLAlchemy, Alembic migrations  
**Database :** PostgreSQL + PostGIS, Redis cache  
**Infra :** Docker Compose, DigitalOcean droplet (164.90.213.47)  
**APIs :** OpenStreetMap Overpass, OpenAI TTS, OSRM routing  

---

## 📊 DB Schema (7 migrations)
1. `0001_create_all` — Base schema (users, products, prices, etc.)
2. `0002_devices` — Push notifications
3. `0003_alerts` — Price alerts
4. `0004_feedback_schema` — Feedback domain
5. `0005_devices` — Device tracking
6. `0006_feedback` — Feedback table
7. `0007_analytics` — Analytics events

---

## 🧪 What's NOT in V1 (V2 roadmap)

- ❌ Tactile target sizes (44px) — buttons currently 36px
- ❌ Search clarity — placeholder could be clearer
- ❌ Performance polish — lazy-load images, bundle optimization
- ❌ Animations — micro-interactions on interactions
- ❌ In-app help/FAQ — onboarding + tutorials
- ❌ Social features — share deals, follow friends

**These will be part of V2** after gathering user feedback (Sep 2026).

---

## 🚀 Deployment

**Live environment :**
- Web : https://prixes.omnilink.software (Caddy reverse proxy)
- API : https://prixes.omnilink.software/api/v1 (FastAPI behind Caddy)
- Database : PostgreSQL 16 + PostGIS
- Cache : Redis 7
- Worker : Arq (async task queue)

**Dev environment :**
- `npm run dev` (web, localhost:3000)
- `uvicorn app.main:app --reload` (API, localhost:8000)
- `docker compose up` (full stack)

---

## 📝 Next Steps (V2)

1. **Run user tests** (September) — 5–8 sessions, gather real feedback
2. **Analyze results** — SUS scores, task completion rates, blockers
3. **Prioritize fixes** — roadmap based on frequency + severity
4. **Implement V2** — accessibility, performance, UX polish
5. **Iterate** — monthly releases based on user feedback

---

## 🎯 Success Metrics (for V1)

- ✅ App runs in production without crashes
- ✅ All core features work (search, stores, fuel, list, map)
- ✅ Analytics & feedback systems collect real data
- ✅ WCAG 2.1 AA compliant (color contrast verified)
- ✅ User testing kit ready to launch
- ✅ Logo applied everywhere (header, favicon, PWA, native)

---

## 👤 Author

**Aymen** (aymenrobert@gmail.com)  
Built with Next.js, FastAPI, and a love for price comparison. 🛒

---

**Live now. Testing in September. V2 coming soon. 🚀**

# Déploiement en production

Stack : **Caddy (HTTPS) → Next.js (web) + FastAPI (api) → PostgreSQL + Redis**, le
tout en Docker. Caddy obtient et renouvelle le certificat TLS automatiquement
(Let's Encrypt).

## Prérequis
- Un serveur Linux avec Docker + Docker Compose v2.24+.
- Un nom de domaine dont l'enregistrement DNS **A/AAAA pointe vers le serveur**.
- Les ports **80** et **443** ouverts.

## 1. Configurer l'environnement
```bash
cd prixes-platform
cp .env.production.example .env.production
# Renseigner le domaine :
#   DOMAIN, PUBLIC_BASE_URL, WEB_BASE_URL, API_BASE_URL,
#   NEXT_PUBLIC_API_BASE_URL, NEXTAUTH_URL, CORS_ORIGINS
nano .env.production

# Générer des secrets forts (SECRET_KEY, NEXTAUTH_SECRET, mot de passe DB) :
./scripts/gen-secrets.sh
```

## 2. Lancer la stack
```bash
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
L'API applique les migrations au démarrage. Caddy publie le site en HTTPS sur le
domaine ; web et api ne sont plus exposés directement (uniquement via le proxy).

## 3. Charger les données réelles (une fois)
```bash
# Dans le conteneur api :
docker compose exec api python scripts/scrape_prices.py   # prix réels (toutes enseignes)
docker compose exec api python scripts/ingest_fuel.py     # carburants (API gov)
# (Le worker ré-ingère les carburants chaque heure automatiquement.)
```
Compte de démo créé par le seed : `demo@prixes.app` / `demo1234`.

## 4. Vérifier
- `https://VOTRE-DOMAINE/health` → `{"status":"ok"}`
- `https://VOTRE-DOMAINE/` → l'app

## 5. Sauvegardes automatiques (à faire une fois, après le premier déploiement)
Le serveur de prod étant limité en ressources, les images sont construites en
local puis envoyées (`docker save` + `scp` + `docker load`), pas buildées sur
le serveur — voir `scripts/deploy.sh`. Ce script sauvegarde toujours la DB
avant de déployer. Pour avoir aussi une sauvegarde quotidienne indépendante
des déploiements :
```bash
crontab -e
# ajouter :
0 3 * * * cd /opt/prixes-platform && ./scripts/backup-db.sh >> backups/cron.log 2>&1
```

---

## Mises à jour (déploiement courant)
Une fois la stack initiale en place, les mises à jour se font en local puis
via `scripts/deploy.sh` sur le serveur (sauvegarde la DB + garde l'image
sortante en `:previous` avant de charger la nouvelle) :
```bash
# En local : construire + sauvegarder les images
docker buildx build --platform linux/amd64 -t prixes-platform-web:latest --load apps/web
docker buildx build --platform linux/amd64 -t prixes-platform-api:latest --load apps/api
docker save prixes-platform-web:latest | gzip > web.tar.gz
docker save prixes-platform-api:latest | gzip > api.tar.gz
scp web.tar.gz api.tar.gz root@SERVEUR:/opt/prixes-platform/

# Sur le serveur :
cd /opt/prixes-platform && ./scripts/deploy.sh
```
En cas de problème après déploiement : `./scripts/rollback-app.sh` (voir
[docs/ROLLBACK.md](docs/ROLLBACK.md) pour la procédure complète, y compris la
restauration de la base de données).

---

## Options
- **Photos de deals** : renseigner les variables `S3_*` (S3 ou Cloudflare R2).
  Tant qu'elles sont vides, l'upload de photo est **masqué** dans l'UI (les deals
  se publient sans photo). `GET /api/v1/meta` expose `uploads_enabled`.
- **Suivi d'erreurs** : renseigner `SENTRY_DSN`.
- **Connexion Google** : renseigner `GOOGLE_OAUTH_CLIENT_ID/SECRET`.

## Sécurité / robustesse déjà en place
- Secrets hors-Git (`.env.production` est git-ignoré).
- `restart: unless-stopped` + healthcheck sur l'API (redémarrage auto).
- Rate-limiting (login, création de deals), CORS verrouillé sur le domaine.
- En-têtes de sécurité (HSTS, X-Content-Type-Options, X-Frame-Options) via Caddy.
- Pages d'erreur / 404 / chargement personnalisées (pas d'écran blanc).
- Sauvegarde DB avant chaque déploiement + quotidienne (cron), rollback
  applicatif en un pas — voir [docs/ROLLBACK.md](docs/ROLLBACK.md).

## Test TLS en local (sans domaine public)
```bash
DOMAIN=localhost PUBLIC_BASE_URL=https://localhost \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# Caddy émet un certificat local ; ouvrez https://localhost
```

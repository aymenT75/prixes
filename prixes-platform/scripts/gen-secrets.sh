#!/usr/bin/env bash
# Generate strong secrets into .env.production (in place).
# Replaces every __generate__ placeholder. Safe to re-run only on a fresh copy
# (it refuses to overwrite already-generated values).
set -euo pipefail

ENV_FILE="${1:-.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Copying .env.production.example -> $ENV_FILE"
  cp .env.production.example "$ENV_FILE"
fi

if ! grep -q "__generate__" "$ENV_FILE"; then
  echo "No __generate__ placeholders left in $ENV_FILE — nothing to do."
  exit 0
fi

rand() { openssl rand -hex "${1:-32}"; }

SECRET_KEY="$(rand 32)"
NEXTAUTH_SECRET="$(rand 32)"
DB_PASSWORD="$(rand 24)"

# Portable in-place edit (GNU & BSD sed differ on -i).
sedi() { sed "$@" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"; }

sedi -e "s|^SECRET_KEY=__generate__|SECRET_KEY=${SECRET_KEY}|" "$ENV_FILE"
sedi -e "s|^NEXTAUTH_SECRET=__generate__|NEXTAUTH_SECRET=${NEXTAUTH_SECRET}|" "$ENV_FILE"
sedi -e "s|^POSTGRES_PASSWORD=__generate__|POSTGRES_PASSWORD=${DB_PASSWORD}|" "$ENV_FILE"
# DATABASE_URL embeds the same DB password.
sedi -e "s|:__generate__@db:|:${DB_PASSWORD}@db:|" "$ENV_FILE"

echo "✓ Secrets written to $ENV_FILE"
echo "  - SECRET_KEY, NEXTAUTH_SECRET: 32-byte hex"
echo "  - POSTGRES_PASSWORD: 24-byte hex (also injected into DATABASE_URL)"
echo
echo "Next: set DOMAIN / *_BASE_URL to your real domain, then:"
echo "  docker compose --env-file $ENV_FILE -f docker-compose.yml -f docker-compose.prod.yml up -d --build"

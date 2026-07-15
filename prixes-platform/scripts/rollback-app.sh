#!/bin/sh
# Roll the app back to the previously-deployed image (one step back).
# Requires that deploy.sh tagged the prior :latest as :previous before loading
# the new one — if there's no :previous image, there's nothing to roll back to.
#
# Usage: ./scripts/rollback-app.sh
set -eu

COMPOSE="docker compose -p prixes-platform -f docker-compose.yml -f docker-compose.prod.yml"

for img in prixes-platform-web prixes-platform-api; do
  if ! docker image inspect "$img:previous" >/dev/null 2>&1; then
    echo "No $img:previous image found — nothing to roll back to." >&2
    exit 1
  fi
done

echo "== Rolling back web + api + worker to the previous image =="
docker tag prixes-platform-web:previous prixes-platform-web:latest
docker tag prixes-platform-api:previous prixes-platform-api:latest
docker tag prixes-platform-api:previous prixes-platform-worker:latest

$COMPOSE up -d --force-recreate web api worker

echo "== Done. Verify: curl -s https://\$DOMAIN/health =="
echo "Note: this only rolls back the app code, not the database. If the broken"
echo "deploy also ran a migration, restore a DB backup too (see docs/ROLLBACK.md)."

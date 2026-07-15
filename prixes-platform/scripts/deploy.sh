#!/bin/sh
# Deploy freshly-built images that were already uploaded as web.tar.gz / api.tar.gz
# in the current directory (see DEPLOY.md for how they get here). Always backs up
# the database first and keeps the outgoing images tagged :previous, so a bad
# deploy can be undone with rollback-app.sh / restore-db.sh without rebuilding.
#
# Usage: ./scripts/deploy.sh [web|api|all]   (default: all)
set -eu

TARGET="${1:-all}"
COMPOSE="docker compose -p prixes-platform -f docker-compose.yml -f docker-compose.prod.yml"

echo "== 1/5: Backing up the database =="
./scripts/backup-db.sh

echo "== 2/5: Tagging current images as :previous (rollback safety net) =="
docker image inspect prixes-platform-web:latest >/dev/null 2>&1 && \
  docker tag prixes-platform-web:latest prixes-platform-web:previous || true
docker image inspect prixes-platform-api:latest >/dev/null 2>&1 && \
  docker tag prixes-platform-api:latest prixes-platform-api:previous || true

echo "== 3/5: Loading new images =="
[ -f web.tar.gz ] && [ "$TARGET" != "api" ] && gunzip -c web.tar.gz | docker load
[ -f api.tar.gz ] && [ "$TARGET" != "web" ] && gunzip -c api.tar.gz | docker load

echo "== 4/5: Recreating containers =="
case "$TARGET" in
  web) $COMPOSE up -d --force-recreate web ;;
  api) $COMPOSE up -d --force-recreate api worker ;;
  all) $COMPOSE up -d --force-recreate web api worker ;;
  *) echo "Unknown target: $TARGET (use web|api|all)" >&2; exit 1 ;;
esac

echo "== 5/5: Cleaning up =="
docker image prune -f
rm -f web.tar.gz api.tar.gz

echo "== Deployed. Verify: curl -s https://\$DOMAIN/health =="
echo "If something's wrong: ./scripts/rollback-app.sh"

#!/bin/sh
# Restore the database from a backup produced by backup-db.sh.
# DESTRUCTIVE: drops and recreates the schema before restoring — always take a
# fresh backup-db.sh dump of the *current* state first if there's any chance
# you'll need it.
#
# Usage: ./scripts/restore-db.sh backups/prixes-20260716-030001.sql.gz
set -eu

FILE="${1:?Usage: ./scripts/restore-db.sh <path-to-backup.sql.gz>}"
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 1; }

COMPOSE="docker compose -p prixes-platform -f docker-compose.yml -f docker-compose.prod.yml"

echo "About to restore $FILE — this REPLACES all current data."
printf 'Type "yes" to continue: '
read -r CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 1; }

echo "== Stopping api + worker (avoid writes during restore) =="
$COMPOSE stop api worker

echo "== Restoring =="
gunzip -c "$FILE" | $COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'

echo "== Restarting api + worker =="
$COMPOSE up -d api worker

echo "== Done. Verify: curl -s https://\$DOMAIN/health =="

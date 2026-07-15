#!/bin/sh
# Dump the Postgres database to a timestamped, gzipped file on the host — outside
# the Docker volume, so it survives `docker compose down -v` / droplet rebuilds.
# Run from /opt/prixes-platform on the droplet (or wherever the prod compose files
# live). Credentials are read from inside the `db` container's own environment —
# this script never needs to know the password itself.
#
# Usage: ./scripts/backup-db.sh [retention_days]
set -eu

RETENTION_DAYS="${1:-14}"
BACKUP_DIR="./backups"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/prixes-$STAMP.sql.gz"

COMPOSE="docker compose -p prixes-platform -f docker-compose.yml -f docker-compose.prod.yml"

mkdir -p "$BACKUP_DIR"

echo "== Dumping database to $OUT =="
# Single-quoted so $POSTGRES_USER/$POSTGRES_DB expand inside the container, not here.
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "== Done: $OUT ($SIZE) =="

echo "== Pruning backups older than $RETENTION_DAYS days =="
find "$BACKUP_DIR" -name 'prixes-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete

echo "== Current backups =="
ls -lh "$BACKUP_DIR"/prixes-*.sql.gz 2>/dev/null | tail -10

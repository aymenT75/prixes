#!/bin/sh
# Dump the Postgres database to a timestamped, gzipped file on the host — outside
# the Docker volume, so it survives `docker compose down -v` / droplet rebuilds.
# Run from /opt/prixes-platform on the droplet (or wherever the prod compose files
# live). Credentials are read from inside the `db` container's own environment —
# this script never needs to know the password itself.
#
# Usage: ./scripts/backup-db.sh [retention_days]
#
# Off-site copy (optional but strongly recommended): set OFFSITE_REMOTE to an rclone
# remote such as "b2:prixes-backups" or "spaces:prixes/backups" and every dump is
# copied there as well. Configure the remote once with `rclone config` — this script
# never handles credentials itself. Without it, the dumps sit on the same droplet as
# the database they protect, so losing the droplet loses both at once.
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

# ── Off-site copy ────────────────────────────────────────────────────────────
# Local dumps survive a bad migration or a DROP TABLE, but not the loss of this
# host. Copy each dump to a remote as well, and *verify* it landed — an upload that
# fails quietly is worse than no backup, because it looks like one.
OFFSITE_REMOTE="${OFFSITE_REMOTE:-}"
OFFSITE_STATUS=0

if [ -z "$OFFSITE_REMOTE" ]; then
  echo "== Off-site copy: SKIPPED (OFFSITE_REMOTE not set) =="
  echo "   Dumps live only on this host — losing it loses them with the database."
elif ! command -v rclone >/dev/null 2>&1; then
  echo "== Off-site copy: FAILED — rclone is not installed ==" >&2
  OFFSITE_STATUS=1
elif ! rclone copy "$OUT" "$OFFSITE_REMOTE" --no-traverse; then
  echo "== Off-site copy: FAILED — rclone could not upload $OUT ==" >&2
  OFFSITE_STATUS=1
elif ! rclone lsf "$OFFSITE_REMOTE/$(basename "$OUT")" >/dev/null 2>&1; then
  # rclone exited 0 but the object is not there: treat as a failure, never as success.
  echo "== Off-site copy: FAILED — upload reported OK but the object is missing ==" >&2
  OFFSITE_STATUS=1
else
  echo "== Off-site copy verified: $OFFSITE_REMOTE/$(basename "$OUT") =="
  # Mirror the local retention window remotely (best-effort: never fail the run on it).
  rclone delete "$OFFSITE_REMOTE" --min-age "${RETENTION_DAYS}d" --include 'prixes-*.sql.gz' \
    || echo "   (remote pruning skipped — non-fatal)"
fi

echo "== Pruning backups older than $RETENTION_DAYS days =="
find "$BACKUP_DIR" -name 'prixes-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete

echo "== Current backups =="
ls -lh "$BACKUP_DIR"/prixes-*.sql.gz 2>/dev/null | tail -10

# Non-zero when the off-site copy did not happen, so cron mail / the log makes the
# failure visible instead of leaving a half-protected backup looking healthy.
exit "$OFFSITE_STATUS"

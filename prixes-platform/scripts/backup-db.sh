#!/bin/sh
# Dump every application database to timestamped, gzipped files on the host —
# outside the Docker volume, so they survive `docker compose down -v` / droplet
# rebuilds. Run from /opt/prixes-platform on the droplet (or wherever the prod
# compose files live). Credentials are read from inside the `db` container's own
# environment — this script never needs to know the password itself.
#
# Usage: ./scripts/backup-db.sh [retention_days]
#
# One file per database: prixes-<stamp>.sql.gz, prixes_coach-<stamp>.sql.gz, …
# restore-db.sh reads the target database back out of that name. The MongoDB
# document database goes to mongo-prixes-<stamp>.tar.gz (restore-mongo.sh).
#
# Off-site copy (optional but strongly recommended): set OFFSITE_REMOTE to an rclone
# remote such as "b2:prixes-backups" or "spaces:prixes/backups" and every dump is
# copied there as well. Configure the remote once with `rclone config` — this script
# never handles credentials itself. Without it, the dumps sit on the same droplet as
# the database they protect, so losing the droplet loses both at once.
set -eu

# The dumps hold every user's email and password hash. Readable by root only.
umask 077

RETENTION_DAYS="${1:-14}"
BACKUP_DIR="./backups"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

COMPOSE="docker compose -p prixes-platform -f docker-compose.yml -f docker-compose.prod.yml"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
# Dumps written before this script restricted them were world-readable.
find "$BACKUP_DIR" \( -name '*.sql.gz' -o -name '*.tar.gz' \) -exec chmod 600 {} +

# Every database, not just POSTGRES_DB. Hi Coach keeps its data in prixes_coach
# inside this same Postgres, and dumping only POSTGRES_DB left it out of every
# backup without a single warning. Listing them here means the next app to join
# the server is covered the day it arrives.
DBS="$(echo "select datname from pg_database where not datistemplate and datname <> 'postgres' order by datname" \
  | $COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -t -A')"

DUMP_STATUS=0
NEW_FILES=""

for DB in $DBS; do
  case "$DB" in
    *[!a-z0-9_]*) echo "== Skipping database with an unexpected name: $DB ==" >&2; DUMP_STATUS=1; continue ;;
  esac
  OUT="$BACKUP_DIR/$DB-$STAMP.sql.gz"
  echo "== Dumping $DB to $OUT =="
  # --clean --if-exists writes a DROP before every CREATE, so the dump can replace
  # a live database. Without it, restoring over the running data collides with
  # every existing table — which is what a real incident looks like.
  $COMPOSE exec -T db sh -c "pg_dump -U \"\$POSTGRES_USER\" --clean --if-exists \"$DB\"" | gzip > "$OUT"

  # sh has no pipefail: a pg_dump that dies halfway still leaves a valid, smaller
  # gzip behind, and it would sit in this folder looking like a backup. pg_dump
  # writes this line last, only when it finished.
  if gunzip -c "$OUT" | tail -n 5 | grep -q "PostgreSQL database dump complete"; then
    echo "== Done: $OUT ($(du -h "$OUT" | cut -f1)) =="
    NEW_FILES="$NEW_FILES $OUT"
  else
    echo "== FAILED: $OUT is incomplete, removed ==" >&2
    rm -f "$OUT"
    DUMP_STATUS=1
  fi
done

# ── MongoDB (Atlas) ──────────────────────────────────────────────────────────
# The weekly menus, imported recipes and assistant drafts live in Atlas, whose
# free tier keeps no backup of any kind. Export them with the nightly dumps, so
# they are also inside the DigitalOcean backups of this droplet. The export runs
# in the api container, which already holds pymongo and MONGO_URL: no credential
# passes through this script.
if $COMPOSE exec -T api sh -c 'test -n "$MONGO_URL"'; then
  OUT="$BACKUP_DIR/mongo-prixes-$STAMP.tar.gz"
  echo "== Exporting MongoDB to $OUT =="
  # The manifest is written last: an export that died partway has none, and is
  # removed instead of sitting here looking like a backup.
  if $COMPOSE exec -T api python -c "$(cat scripts/mongo-backup.py)" export > "$OUT" \
    && tar -xzOf "$OUT" manifest.json >/dev/null 2>&1; then
    echo "== Done: $OUT ($(du -h "$OUT" | cut -f1)) =="
    NEW_FILES="$NEW_FILES $OUT"
  else
    echo "== FAILED: MongoDB export, $OUT removed ==" >&2
    rm -f "$OUT"
    DUMP_STATUS=1
  fi
else
  echo "== MongoDB: MONGO_URL not set — skipped =="
fi

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
else
  for OUT in $NEW_FILES; do
    if ! rclone copy "$OUT" "$OFFSITE_REMOTE" --no-traverse; then
      echo "== Off-site copy: FAILED — rclone could not upload $OUT ==" >&2
      OFFSITE_STATUS=1
    elif ! rclone lsf "$OFFSITE_REMOTE/$(basename "$OUT")" >/dev/null 2>&1; then
      # rclone exited 0 but the object is not there: a failure, never a success.
      echo "== Off-site copy: FAILED — upload reported OK but $(basename "$OUT") is missing ==" >&2
      OFFSITE_STATUS=1
    else
      echo "== Off-site copy verified: $OFFSITE_REMOTE/$(basename "$OUT") =="
    fi
  done
  # Mirror the local retention window remotely (best-effort: never fail the run on it).
  rclone delete "$OFFSITE_REMOTE" --min-age "${RETENTION_DAYS}d" --include '*.sql.gz' --include '*.tar.gz' \
    || echo "   (remote pruning skipped — non-fatal)"
fi

echo "== Pruning backups older than $RETENTION_DAYS days =="
find "$BACKUP_DIR" \( -name '*.sql.gz' -o -name '*.tar.gz' \) -mtime "+$RETENTION_DAYS" -print -delete

echo "== Current backups =="
ls -lht "$BACKUP_DIR"/*.sql.gz "$BACKUP_DIR"/*.tar.gz 2>/dev/null | head -10

# Non-zero when a dump failed or the off-site copy did not happen, so cron mail /
# the log makes the failure visible instead of leaving a half-protected backup
# looking healthy.
[ "$DUMP_STATUS" -eq 0 ] && [ "$OFFSITE_STATUS" -eq 0 ]

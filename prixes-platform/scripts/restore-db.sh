#!/bin/sh
# Restore ONE database from a dump produced by backup-db.sh.
#
#   ./scripts/restore-db.sh backups/prixes-20260917-030002.sql.gz
#   ./scripts/restore-db.sh backups/prixes_coach-20260917-030002.sql.gz
#
# DESTRUCTIVE: the database named in the file is replaced by the dump. Take a fresh
# backup-db.sh first if there is any chance you will want the current state back.
#
# Three things this script guarantees:
#   - the target comes from the file name, so a Hi Coach dump can never be poured
#     into Prixes by picking the wrong file;
#   - the restore runs in a single transaction: it either applies whole or leaves
#     the database exactly as it was — never a half-restored mix;
#   - the services writing to that database are stopped during the restore and
#     started again afterwards, even if the restore fails.
set -eu

FILE="${1:?Usage: ./scripts/restore-db.sh <backups/DATABASE-YYYYMMDD-HHMMSS.sql.gz>}"
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 1; }

NAME="$(basename "$FILE")"
DB="${NAME%-????????-??????.sql.gz}"
if [ "$DB" = "$NAME" ] || [ -z "$DB" ]; then
  echo "Not a backup-db.sh file name (expected DATABASE-YYYYMMDD-HHMMSS.sql.gz): $NAME" >&2
  exit 1
fi
case "$DB" in
  *[!a-z0-9_]*) echo "Unexpected database name in file name: $DB" >&2; exit 1 ;;
esac

COMPOSE="docker compose -p prixes-platform -f docker-compose.yml -f docker-compose.prod.yml"

EXISTS="$(echo "select 1 from pg_database where datname = '$DB'" \
  | $COMPOSE exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -t -A')"
if [ "$EXISTS" != "1" ]; then
  echo "Database \"$DB\" does not exist on this server — nothing to restore into." >&2
  exit 1
fi

# Dumps written before backup-db.sh added --clean cannot replace a live database:
# every CREATE collides with the existing object and every COPY with its rows.
# Refuse them here, before anything is stopped. See docs/ROLLBACK.md to restore
# one into an empty database instead.
if ! gunzip -c "$FILE" | grep -q '^DROP '; then
  echo "This dump predates --clean and cannot replace a live database: $NAME" >&2
  echo "See docs/ROLLBACK.md (« Restaurer une ancienne sauvegarde »)." >&2
  exit 1
fi

case "$DB" in
  prixes)       WRITERS="the Prixes api and worker" ;;
  prixes_coach) WRITERS="the Hi Coach api" ;;
  *)            WRITERS="nothing (unknown database — stop its writers yourself)" ;;
esac

echo "About to REPLACE database \"$DB\" with $NAME."
echo "Services stopped during the restore: $WRITERS."
printf 'Type "yes" to continue: '
read -r CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted — nothing was changed."; exit 1; }

stop_writers() {
  case "$DB" in
    prixes)       $COMPOSE stop api worker ;;
    prixes_coach) docker stop hicoach-api ;;
  esac
}
start_writers() {
  case "$DB" in
    prixes)       $COMPOSE up -d api worker ;;
    prixes_coach) docker start hicoach-api ;;
  esac
}

echo "== Stopping $WRITERS =="
stop_writers
# Whatever happens next, the services come back.
trap 'echo "== Restarting $WRITERS =="; start_writers' EXIT

echo "== Restoring $DB (single transaction) =="
gunzip -c "$FILE" | $COMPOSE exec -T db sh -c \
  "psql -U \"\$POSTGRES_USER\" -d \"$DB\" -q -v ON_ERROR_STOP=1 --single-transaction"

echo "== Restored. Verify: curl -s https://\$DOMAIN/health =="

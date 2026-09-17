#!/bin/sh
# Restore the MongoDB document database (weekly menus, imported recipes,
# assistant drafts) from an archive produced by backup-db.sh.
#
#   ./scripts/restore-mongo.sh backups/mongo-prixes-20260918-030002.tar.gz
#
# DESTRUCTIVE: every collection present in the archive is emptied and refilled
# with its content. Collections that are not in the archive are left alone.
#
# The archive is read and checked in full before anything is touched: a truncated
# or corrupt file stops here, not after half the collections are emptied. Indexes
# are kept (collections are emptied, not dropped). The Prixes api and worker are
# stopped during the restore and started again afterwards, even if it fails.
set -eu

FILE="${1:?Usage: ./scripts/restore-mongo.sh <backups/mongo-prixes-YYYYMMDD-HHMMSS.tar.gz>}"
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 1; }

case "$(basename "$FILE")" in
  mongo-*-????????-??????.tar.gz) ;;
  *) echo "Not a MongoDB archive from backup-db.sh: $(basename "$FILE")" >&2; exit 1 ;;
esac

if ! MANIFEST="$(tar -xzOf "$FILE" manifest.json 2>/dev/null)"; then
  echo "Unreadable archive, or manifest.json missing: $FILE" >&2
  exit 1
fi

COMPOSE="docker compose -p prixes-platform -f docker-compose.yml -f docker-compose.prod.yml"

echo "About to REPLACE the MongoDB collections listed in this archive:"
echo "$MANIFEST"
printf 'Type "yes" to continue: '
read -r CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted — nothing was changed."; exit 1; }

echo "== Stopping the Prixes api and worker =="
$COMPOSE stop api worker
trap 'echo "== Restarting the Prixes api and worker =="; $COMPOSE up -d api worker' EXIT

# A one-off container from the api image: same pymongo, same MONGO_URL, while the
# real api is stopped and cannot write in the middle of the restore.
$COMPOSE run --rm --no-deps -T api python -c "$(cat scripts/mongo-backup.py)" restore < "$FILE"

echo "== Restored. Verify: curl -s https://\$DOMAIN/api/v1/meta =="

#!/bin/sh
# Point Prixes at a different MongoDB Atlas user — typically a dedicated
# readWrite@prixes user instead of the cluster administrator.
#
#   ssh -t prixes-droplet /opt/prixes-platform/scripts/set-mongo-user.sh
#
# Or from Windows, straight from the clipboard, without pasting anything:
#
#   "prixes-app`n$(Get-Clipboard)" | ssh prixes-droplet /opt/prixes-platform/scripts/set-mongo-user.sh
#
# The password is typed at an invisible prompt. It never appears on a command
# line, in the shell history, in a process listing or on screen: it travels
# through environment variables and pipes only, and ends up in .env alone.
#
# Nothing is written until the new credentials have been tried for real — a
# connection, then a write and a delete in the `prixes` database. A typo stops
# here instead of taking the menus offline at the next restart.
#
# It does not restart anything: the api and worker keep the old user until they
# are recreated (docker compose up -d --force-recreate api worker).
set -eu

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env}"
COMPOSE="docker compose -p prixes-platform -f docker-compose.yml -f docker-compose.prod.yml"

grep -q '^MONGO_URL=' "$ENV_FILE" || { echo "No MONGO_URL line in $ENV_FILE — nothing to change." >&2; exit 1; }

printf "Utilisateur MongoDB : "
read -r MONGO_NEW_USER
printf "Mot de passe (la saisie reste invisible) : "
# Without a terminal (piped input) there is nothing to hide: keep going.
stty -echo 2>/dev/null || true
trap 'stty echo 2>/dev/null || true' EXIT
read -r MONGO_NEW_PASS
stty echo 2>/dev/null || true
echo
# Input piped from Windows (PowerShell, a clipboard) ends each line with \r\n: the
# stray \r would become part of the user name and the password, and Atlas would
# refuse credentials that look right on screen. PowerShell also puts an invisible
# byte-order mark in front of the first line, that is, in front of the user name.
MONGO_NEW_USER="$(printf '%s' "$MONGO_NEW_USER" | tr -d '\r' | sed '1s/^\xEF\xBB\xBF//')"
MONGO_NEW_PASS="$(printf '%s' "$MONGO_NEW_PASS" | tr -d '\r')"
[ -n "$MONGO_NEW_USER" ] && [ -n "$MONGO_NEW_PASS" ] || { echo "Empty user or password — nothing changed." >&2; exit 1; }
export MONGO_NEW_USER MONGO_NEW_PASS ENV_FILE

# Build the new URL from the current one: same host and options, new credentials,
# both percent-encoded so any character in the password is safe.
build_url() {
  python3 - <<'PY'
import os, re, sys, urllib.parse
text = open(os.environ["ENV_FILE"], encoding="utf-8").read()
m = re.search(r"^MONGO_URL=(mongodb(?:\+srv)?://)[^@\s]+@(\S+)$", text, flags=re.M)
if not m:
    sys.exit("MONGO_URL is not in the expected mongodb+srv://user:pass@host form.")
user = urllib.parse.quote(os.environ["MONGO_NEW_USER"], safe="")
password = urllib.parse.quote(os.environ["MONGO_NEW_PASS"], safe="")
sys.stdout.write(f"{m.group(1)}{user}:{password}@{m.group(2)}")
PY
}

echo "== Trying the new credentials against Atlas =="
# The URL reaches the api container through a pipe, never an argument.
if ! build_url | $COMPOSE exec -T api python -c '
import os, sys
from pymongo import MongoClient
url = sys.stdin.read()
try:
    db = MongoClient(url, serverSelectionTimeoutMS=15000)[os.environ.get("MONGO_DB", "prixes")]
    db.command("ping")
    col = db["_verif_utilisateur"]
    col.insert_one({"verif": True})
    col.drop()
except Exception as exc:
    # One line, not a traceback. pymongo never puts the password in its messages.
    reason = str(exc).split(", full error")[0]
    sys.exit(f"   refused by Atlas: {reason}")
print("   connection, write and delete: OK")
'; then
  echo "The new credentials do not work (wrong password, missing role?). $ENV_FILE was NOT modified." >&2
  exit 1
fi

cp "$ENV_FILE" "$ENV_FILE.avant-$(date -u +%Y%m%d-%H%M%S)"
python3 - <<'PY'
import os, re, urllib.parse
path = os.environ["ENV_FILE"]
text = open(path, encoding="utf-8").read()
user = urllib.parse.quote(os.environ["MONGO_NEW_USER"], safe="")
password = urllib.parse.quote(os.environ["MONGO_NEW_PASS"], safe="")
new = re.sub(
    r"^(MONGO_URL=mongodb(?:\+srv)?://)[^@\s]+@",
    lambda m: f"{m.group(1)}{user}:{password}@",
    text,
    count=1,
    flags=re.M,
)
open(path, "w", encoding="utf-8").write(new)
PY
chmod 600 "$ENV_FILE" "$ENV_FILE".avant-*

echo "== $ENV_FILE updated: Prixes will connect as « $MONGO_NEW_USER » after its next restart =="
echo "   Previous file kept next to it (.avant-…), readable by root only."

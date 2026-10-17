#!/usr/bin/env bash
# Bring Office Ping back from a backup, e.g. on a new server after a crash:
#
#   git clone https://github.com/mangeshchavan/office-ping.git && cd office-ping
#   DOMAIN=ping.tejgyan.org scripts/restore.sh /path/to/officeping-<date>.sql.gz
#
# Everyone's accounts and passwords, groups, templates and history come back
# as they were in the backup. It creates .env with new secrets if there is
# none (people just sign in again), replaces whatever is in this copy's
# database, starts the app and shows what was restored.
set -euo pipefail
source "$(dirname "$0")/_common.sh"

FILE="" YES=""
for a in "$@"; do
  case "$a" in
    -y|--yes)  YES=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) FILE="$a" ;;
  esac
done
[ -n "$FILE" ] || fail "say which backup to restore: scripts/restore.sh <file.sql.gz>"
case "$FILE" in /*) ;; *) FILE="$OLDPWD/$FILE" ;; esac   # relative to where you ran it
[ -f "$FILE" ] || fail "no such file: $FILE"
gunzip -t "$FILE" 2>/dev/null || fail "$FILE isn't a readable .gz backup"

ensure_env

if [ -z "$YES" ]; then
  echo "This replaces everything in this copy's database with the backup:"
  echo "  $FILE"
  read -r -p "Type 'restore' to continue: " answer
  [ "$answer" = "restore" ] || fail "cancelled"
fi

say "Starting the database"
docker compose up -d postgres redis
wait_for_postgres

say "Restoring $(basename "$FILE")"
docker compose stop backend escalator >/dev/null 2>&1 || true
psql_q -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gunzip -c "$FILE" | psql_q >/dev/null

say "Starting Office Ping (this builds the app the first time, a few minutes)"
docker compose up -d --build
docker compose restart nginx >/dev/null
wait_for_app
show_summary
say "Done. Office Ping is running on http://127.0.0.1:$APP_PORT"

#!/usr/bin/env bash
# Back up the Office Ping database (users and passwords, groups, templates,
# statuses, ping history, audit log) to a compressed SQL file.
#
#   scripts/backup.sh                         # → ~/office-ping-backups/officeping-<date>.sql.gz
#   scripts/backup.sh --keep-days 30          # also delete backups older than 30 days
#   scripts/backup.sh --copy-to user@host:dir # also copy it to another machine (scp)
#   scripts/backup.sh --label before-upgrade  # add a note to the file name
#
# Restore on any machine with: scripts/restore.sh <file>
# Run from cron for daily backups (see docs/disaster-recovery.md). The files
# hold password hashes and messages: keep them private, never in git.
set -euo pipefail
source "$(dirname "$0")/_common.sh"

DIR="${BACKUP_DIR:-$HOME/office-ping-backups}"
KEEP_DAYS="" COPY_TO="" LABEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --keep-days) KEEP_DAYS="$2"; shift 2 ;;
    --copy-to)   COPY_TO="$2"; shift 2 ;;
    --label)     LABEL="-${2//[^A-Za-z0-9_-]/-}"; shift 2 ;;
    -h|--help)   sed -n '2,13p' "$0"; exit 0 ;;
    *) fail "unknown option: $1" ;;
  esac
done

mkdir -p "$DIR"; chmod 700 "$DIR"
FILE="$DIR/officeping-$(date +%Y%m%d-%H%M%S)$LABEL.sql.gz"

docker compose exec -T postgres sh -c \
  'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > "$FILE.part"
# A complete dump ends with this line; anything else means it was cut short.
gunzip -c "$FILE.part" | tail -n 5 | grep -q "PostgreSQL database dump complete" \
  || { rm -f "$FILE.part"; fail "the backup looks incomplete; nothing was saved"; }
mv "$FILE.part" "$FILE"; chmod 600 "$FILE"
echo "$(date '+%F %T') saved $FILE ($(du -h "$FILE" | cut -f1))"

if [ -n "$COPY_TO" ]; then
  scp -q "$FILE" "$COPY_TO/" && echo "$(date '+%F %T') copied to $COPY_TO"
fi

if [ -n "$KEEP_DAYS" ]; then
  find "$DIR" -maxdepth 1 -name 'officeping-*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete \
    | sed 's/^/deleted old backup: /'
fi

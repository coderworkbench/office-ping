#!/usr/bin/env bash
# Start Office Ping from scratch when there's no backup to restore:
#
#   git clone https://github.com/mangeshchavan/office-ping.git && cd office-ping
#   DOMAIN=ping.tejgyan.org scripts/fresh-install.sh
#
# Creates .env with new secrets if there is none, starts the app, loads the
# message templates kept in the repo (backend/initial_data/templates.json)
# and asks for the first admin's username, email and password. Everything
# else (other users, groups, history) starts empty. With a backup, use
# scripts/restore.sh instead.
set -euo pipefail
source "$(dirname "$0")/_common.sh"

ensure_env
say "Starting Office Ping (this builds the app the first time, a few minutes)"
docker compose up -d --build
docker compose restart nginx >/dev/null
wait_for_app

say "Templates and first admin"
if [ -t 0 ]; then
  docker compose exec backend python manage.py bootstrap
else
  docker compose exec -T -e ADMIN_USERNAME -e ADMIN_EMAIL -e ADMIN_PASSWORD -e ADMIN_FIRST_NAME \
    backend python manage.py bootstrap --no-input
fi
show_summary
say "Done. Office Ping is running on http://127.0.0.1:$APP_PORT"

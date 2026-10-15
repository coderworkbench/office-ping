#!/usr/bin/env bash
# Dev convenience: wipe the Postgres volume and re-run migrations + seed.
# DO NOT use in production — this permanently destroys all data.
set -euo pipefail

read -r -p "This will DELETE all data in the Office Ping database. Continue? [y/N] " ans
[[ "${ans:-}" =~ ^[Yy]$ ]] || exit 0

docker compose down -v
docker compose up -d postgres redis
sleep 3
docker compose up -d backend
sleep 3
docker compose exec backend python manage.py migrate --noinput
docker compose exec backend python manage.py seed_demo
echo "Done."

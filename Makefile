.PHONY: setup dev down migrate makemigrations backup restore fresh-install seed test lint format logs shell manual

setup:
	cp -n .env.example .env || true
	docker compose build

dev:
	docker compose up -d
	@echo "App:          http://localhost:8080"
	@echo "API:          http://localhost:8080/api/"
	@echo "Django admin: http://localhost:8080/django-admin/"

down:
	docker compose down

migrate:
	docker compose exec backend python manage.py migrate

# After changing a model: generate the migration, then commit it.
makemigrations:
	docker compose exec backend python manage.py makemigrations

seed:
	docker compose exec backend python manage.py seed_demo

test:
	docker compose exec backend pytest

# Frontend checks run on the host (the production image has no ESLint): needs
# Node.js 20 and `npm install` in frontend/ once.
lint:
	docker compose exec backend python -m compileall -q apps config
	cd frontend && npm run lint && npm run typecheck

logs:
	docker compose logs -f --tail=200

shell:
	docker compose exec backend python manage.py shell

# Regenerate docs/user-manual.md and CHANGELOG.md from frontend/content/*.json
manual:
	node scripts/export-manual.mjs

# Backups and recovery (docs/disaster-recovery.md)
backup:
	scripts/backup.sh --keep-days 30

restore:
	@test -n "$(FILE)" || (echo "Usage: make restore FILE=path/to/officeping-<date>.sql.gz" && exit 1)
	scripts/restore.sh "$(FILE)"

fresh-install:
	scripts/fresh-install.sh

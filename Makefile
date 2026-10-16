.PHONY: setup dev down migrate seed test lint format logs shell manual

setup:
	cp -n .env.example .env || true
	docker compose build

dev:
	docker compose up -d
	@echo "App:   http://localhost"
	@echo "API:   http://localhost/api/"
	@echo "Admin: http://localhost/admin/"

down:
	docker compose down

migrate:
	docker compose exec backend python manage.py migrate

seed:
	docker compose exec backend python manage.py seed_demo

test:
	docker compose exec backend pytest

lint:
	docker compose exec backend python -m compileall -q apps config
	docker compose exec frontend npm run lint

logs:
	docker compose logs -f --tail=200

shell:
	docker compose exec backend python manage.py shell

# Regenerate docs/user-manual.md from frontend/content/manual.json
manual:
	node scripts/export-manual.mjs

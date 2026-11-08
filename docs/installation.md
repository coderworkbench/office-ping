# Installation

## Prerequisites

- Docker Engine 24+ with the Compose plugin (`docker compose version`)
- Port 8080 free on the machine (the compose stack publishes nginx there)

## Steps

```bash
git clone https://github.com/coderworkbench/office-ping.git
cd office-ping
cp .env.example .env
# Edit .env: set a strong DJANGO_SECRET_KEY and POSTGRES_PASSWORD for anything
# other than local development.
make setup
make dev
make migrate
make seed   # dev-only demo data; skip in production
```

Verify:

- `http://localhost:8080/`              — PWA login page
- `http://localhost:8080/django-admin/` — Django admin (log in as `admin` after `make seed`)
- `http://localhost:8080/api/me/`       — API (answers `401` until you sign in)

## Running tests

```bash
make test
```

## Updating

```bash
git pull
make down && make setup && make dev && make migrate
```

See [deployment-lan.md](deployment-lan.md) for office LAN deployment and
HTTPS, [disaster-recovery.md](disaster-recovery.md) for backups, and
[troubleshooting.md](troubleshooting.md) if something misbehaves.

# Installation

## Prerequisites

- Docker 24+ and Docker Compose plugin
- Open ports: 80 (and 443 in prod)

## Steps

```bash
git clone <this repo>
cd office-ping
cp .env.example .env
# Edit .env — set a strong DJANGO_SECRET_KEY and POSTGRES_PASSWORD.
make setup
make dev
make migrate
make seed   # dev-only demo data; skip in production
```

Verify:

- `http://localhost/`       — PWA login page
- `http://localhost/admin/` — Django admin (log in as `admin` after `make seed`)
- `http://localhost/api/`   — DRF browsable API

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
HTTPS. See [troubleshooting.md](troubleshooting.md) if something misbehaves.

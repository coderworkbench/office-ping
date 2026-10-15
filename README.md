# Office Ping

An internal office notification / ping system for sending targeted alerts
to employees and groups over the office LAN. Supports real-time delivery via
WebSocket, PWA with desktop notifications, and acknowledgement tracking.

## Stack

- **Backend:** Django 5, Django REST Framework, Django Channels, PostgreSQL, Redis
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, PWA (service worker)
- **Transport:** REST for CRUD + history, WebSocket (`/ws/notifications/`, `/ws/presence/`) for real-time
- **Infra:** Docker Compose, nginx reverse proxy

## Quick start (dev)

```bash
cp .env.example .env         # edit DJANGO_SECRET_KEY etc.
make setup
make dev
make migrate
make seed
```

Then open `http://localhost` and log in with the seeded demo credentials
(see output of `make seed`).

| User       | Role   |
|------------|--------|
| `admin`    | ADMIN  |
| `hr`       | HR     |
| `mangesh`  | MEMBER |
| `rahul`    | MEMBER |
| `sneha`    | MEMBER |
| `amit`     | MEMBER |

Dev password for all seeded users is printed by `make seed`.

## Architecture

```
+----------+   HTTPS   +--------+   HTTP/WS    +---------+
| Browser  | <-------->| nginx  | <----------->| backend | (Daphne, Django+Channels)
| (PWA)    |           +--------+              +----+----+
+----------+               |                        |
                           v                        v
                    +------+-----+            +-----+------+
                    |  frontend  |            | postgres   |
                    |  (Next.js) |            |  redis     |
                    +------------+            +------------+
```

- REST handles auth, users, groups, templates, pings, history, dashboard, audit.
- WebSockets handle presence heartbeats and real-time delivery of pings + status.
- Service worker surfaces OS-level notifications even when the tab is backgrounded.
- Notification delivery goes through a service abstraction so a `WebPushNotifier`
  can be added later without touching ping logic.

See `docs/` for deeper topics:

- [architecture.md](docs/architecture.md)
- [installation.md](docs/installation.md)
- [deployment-lan.md](docs/deployment-lan.md)
- [authentication.md](docs/authentication.md)
- [notifications.md](docs/notifications.md)
- [websocket.md](docs/websocket.md)
- [administration.md](docs/administration.md)
- [troubleshooting.md](docs/troubleshooting.md)

## Tests

```bash
make test
```

## Status / scope

This repository is a production-ready scaffold with all the core workflows
listed in the spec: auth, roles, device registration, presence, individual
and group pings with per-recipient delivery/ack tracking, templates, audit
logs, dashboard, PWA + service worker, Docker/nginx deployment, seed data,
and backend tests covering auth, permissions, pings, groups, templates, and
audit.

Items intentionally **not** included at this stage:

- Web Push (requires VAPID keys and a signed push server; the architecture
  leaves a clean seam for `WebPushNotifier` to be added).
- Playwright E2E tests (configuration provided, scenarios are listed in
  `docs/troubleshooting.md` and the DOD scenarios in the spec).
- Password reset email (code path is documented in `authentication.md`).
- TLS automation (compose exposes `:80`; use `docker-compose.prod.yml` and
  mount certs into nginx for internal HTTPS — see `deployment-lan.md`).

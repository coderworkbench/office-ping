# LAN deployment

Target scenario:

```
Office Network: 192.168.1.0/24
Server:         192.168.1.50
URL:            https://ping.office.local
```

## 1. Install Docker on the server

Install Docker Engine + Compose plugin on the office server.

## 2. Create .env

Copy `.env.example` to `.env` on the server and set:

```
DJANGO_SECRET_KEY=<long random>
DJANGO_ALLOWED_HOSTS=ping.office.local,192.168.1.50
CORS_ALLOWED_ORIGINS=https://ping.office.local
CSRF_TRUSTED_ORIGINS=https://ping.office.local
POSTGRES_PASSWORD=<strong>
```

## 3. Internal DNS

Preferred: add an `A` record for `ping.office.local` → `192.168.1.50` in
your internal DNS (Windows DC, pihole, dnsmasq, UniFi, etc.).

Fallback: distribute the entry via `/etc/hosts` or `C:\Windows\System32\drivers\etc\hosts`
on each client machine.

Initial testing without DNS also works via the raw IP: `http://192.168.1.50`.

## 4. HTTPS (recommended for notifications)

Browser notifications and service workers require a **secure context**.
Use an internal CA to issue a cert for `ping.office.local`, or run
`mkcert -install` on each client and generate a cert for the server:

```bash
mkcert ping.office.local 192.168.1.50
# copy ping.office.local.pem and ping.office.local-key.pem into ./nginx/certs/
```

Uncomment the TLS blocks in `docker-compose.prod.yml` and `nginx/nginx.conf`
(see comments) and bring up with:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 5. Firewall

Expose only `80/443` on the server LAN interface. Keep `5432` (Postgres)
and `6379` (Redis) bound to the internal docker network — the default
`docker-compose.yml` already does this (`expose` not `ports`).

Example `ufw`:

```bash
ufw default deny incoming
ufw allow from 192.168.1.0/24 to any port 80
ufw allow from 192.168.1.0/24 to any port 443
ufw allow ssh
ufw enable
```

## 6. Backups

PostgreSQL volume: `postgres_data`.

```bash
docker compose exec postgres pg_dump -U officeping officeping > backup.sql
```

Restore:

```bash
docker compose exec -T postgres psql -U officeping officeping < backup.sql
```

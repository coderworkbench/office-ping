# Office Ping — Setup Runbook

> Target audience: the sysadmin installing Office Ping on an office LAN server
> for the first time. Every command below is copy-pasteable.

**Reference deployment (used throughout):**

| Item | Value |
|---|---|
| Server OS | Ubuntu Server 22.04 LTS (any Linux with Docker works) |
| Server IP | `192.168.1.50` |
| Internal URL | `https://ping.office.local` |
| Office subnet | `192.168.1.0/24` |
| App port on host | `80` (and `443` once TLS is set up) |
| Repo location | `/opt/office-ping` |

Adjust these for your network as you go.

---

## 0. Before you start

Confirm the following with whoever owns your office network:

- [ ] A static IP for the server (e.g. `192.168.1.50`).
- [ ] One hostname in your internal DNS (`ping.office.local` → `192.168.1.50`),
      **or** a plan to distribute `/etc/hosts` entries.
- [ ] Server has outbound internet access during install (to pull Docker images).
      After install it does **not** need internet to run.
- [ ] You have `sudo` access on the server.
- [ ] Backups go somewhere off this server (NAS, S3, etc.).

Estimated time: **30 minutes** for a clean install, **~15 min** of that is
Docker image download time on the first run.

---

## 1. Prepare the server

SSH to the box, then:

```bash
# System up to date
sudo apt-get update && sudo apt-get -y upgrade

# Install Docker Engine + Compose plugin (official repo)
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow your user to run docker without sudo (log out & back in after this)
sudo usermod -aG docker "$USER"

# Confirm
docker --version
docker compose version
```

Open the office-only ports on the firewall:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 80 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 443 proto tcp
sudo ufw allow ssh
sudo ufw --force enable
sudo ufw status
```

**Do not** open 5432 (Postgres) or 6379 (Redis) — they stay on the internal
docker network only.

---

## 2. Get the code

```bash
sudo mkdir -p /opt && cd /opt
sudo git clone <your-repo-url> office-ping
sudo chown -R "$USER:$USER" office-ping
cd office-ping
```

If you don't use git, SCP the `office-ping/` directory to the server and
`cd` into it.

---

## 3. Configure the environment

```bash
cp .env.example .env
```

Open `.env` and set:

```ini
# Required: a 32+ character random secret.
# Generate one on the server with:  openssl rand -hex 32
DJANGO_SECRET_KEY=paste-random-value-here

DJANGO_DEBUG=false

# Hostnames the Django app should respond to.
# Include the LAN IP, internal hostname, and localhost.
DJANGO_ALLOWED_HOSTS=ping.office.local,192.168.1.50,localhost,127.0.0.1

# Postgres
POSTGRES_DB=officeping
POSTGRES_USER=officeping
POSTGRES_PASSWORD=paste-another-random-value-here   # openssl rand -hex 24

# CORS + CSRF — must include every URL users will visit the app at.
CORS_ALLOWED_ORIGINS=https://ping.office.local,http://192.168.1.50
CSRF_TRUSTED_ORIGINS=https://ping.office.local,http://192.168.1.50

# Set this ONLY after TLS is working, otherwise users get stuck on https://
SECURE_SSL_REDIRECT=false
```

Lock down the file so secrets don't leak:

```bash
chmod 600 .env
```

If you want nginx to listen on the standard port 80 (the default), make sure
nothing else is on that port on this host:

```bash
sudo ss -tlnp | grep ':80 '
```

If port 80 is in use by Apache / another nginx / anything else, either stop
that service or change the host port in `docker-compose.yml` (see step 10).

---

## 4. First boot

```bash
make setup      # builds the backend + frontend images (first time: ~5 min)
make dev        # starts postgres, redis, backend, frontend, nginx
```

Wait ~30 seconds for the backend to run migrations, then verify:

```bash
docker compose -p officeping ps
# Expect all 5 services up; postgres & redis "healthy"
```

Smoke-test the HTTP endpoints:

```bash
curl -s -o /dev/null -w "login     -> %{http_code}\n" http://192.168.1.50/login
curl -s -o /dev/null -w "api/me/   -> %{http_code}  (expect 401)\n" http://192.168.1.50/api/me/
curl -s -o /dev/null -w "manifest  -> %{http_code}\n" http://192.168.1.50/manifest.json
curl -s -o /dev/null -w "icon      -> %{http_code}\n" http://192.168.1.50/icons/icon-192.png
```

All four should return `200` (except `/api/me/` which should return `401` —
that proves auth is working).

---

## 5. Create the first admin

**Do not** run `make seed` on a production install — that creates demo users
with a known password. Instead:

```bash
docker compose -p officeping exec backend python manage.py createsuperuser
# Enter: username, email, password (12+ chars, mixed)

# Mark the new user as role=ADMIN (createsuperuser only sets is_staff/is_superuser)
docker compose -p officeping exec backend python manage.py shell -c "
from apps.accounts.models import User
u = User.objects.get(username='<the-username-you-just-chose>')
u.role = 'ADMIN'; u.department = 'IT'; u.save()
print('OK:', u, u.role)
"
```

Log in at `http://192.168.1.50/` → navigate to **Admin → Users** → create the
rest of the office (HR, members). Admins **should not** share credentials;
each person gets their own account.

---

## 6. Internal DNS

Preferred: add an A record in your internal DNS server:

```
ping.office.local  IN  A  192.168.1.50
```

Verify from any office machine:

```bash
nslookup ping.office.local
# → should resolve to 192.168.1.50
```

**Fallback** (if you don't run internal DNS): add the following line to every
client machine's hosts file:

| OS | File |
|---|---|
| Windows | `C:\Windows\System32\drivers\etc\hosts` (edit as Administrator) |
| macOS / Linux | `/etc/hosts` (edit with `sudo`) |

```
192.168.1.50  ping.office.local
```

---

## 7. HTTPS (strongly recommended)

Browser notifications and PWA install **require a secure context**. On a LAN
without a public domain, use an internal certificate.

### Easiest: `mkcert` with per-client install

On an admin machine, install [mkcert](https://github.com/FiloSottile/mkcert):

```bash
# Ubuntu
sudo apt install libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64 && sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
mkcert -install
```

Generate the cert for the server's name + IP:

```bash
mkdir -p /opt/office-ping/nginx/certs
cd /opt/office-ping/nginx/certs
mkcert ping.office.local 192.168.1.50
# Produces:  ping.office.local+1.pem   and   ping.office.local+1-key.pem
```

Then copy mkcert's root CA (`mkcert -CAROOT`) to every office client and
install it as a trusted root (Windows: double-click → Install → "Trusted Root
Certification Authorities"; macOS: Keychain → System → trust; Linux: NSS DB).

### Wire the cert into nginx

Edit `/opt/office-ping/nginx/nginx.conf`, add a `server { listen 443 ssl; … }`
block alongside the existing `listen 80` block. Point it at the certs you just
generated. Minimal addition:

```nginx
server {
  listen 443 ssl;
  server_name ping.office.local;

  ssl_certificate     /etc/nginx/certs/ping.office.local+1.pem;
  ssl_certificate_key /etc/nginx/certs/ping.office.local+1-key.pem;

  # … same location blocks as the :80 server …
}
```

Edit `/opt/office-ping/docker-compose.yml` to also publish 443 and mount the
cert dir — the overlay `docker-compose.prod.yml` already has these commented:

```yaml
nginx:
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./nginx/certs:/etc/nginx/certs:ro
```

Also redirect HTTP → HTTPS once TLS works. Add to the `listen 80` server:

```nginx
return 301 https://$host$request_uri;
```

And in `.env`:

```
SECURE_SSL_REDIRECT=true
```

Reload the stack:

```bash
cd /opt/office-ping
docker compose -p officeping -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Verify from a client:

```bash
curl -I https://ping.office.local/login
# Expect: HTTP/2 200   (certificate must be trusted)
```

---

## 8. Auto-start on boot

Docker Compose with `restart: unless-stopped` (already set) will restart
containers on reboot **as long as Docker itself starts**. Make sure it does:

```bash
sudo systemctl enable docker
sudo systemctl is-enabled docker   # → enabled
```

That's it — nothing else to install.

---

## 9. Backups

### What to back up

1. The Postgres volume `officeping_postgres_data` — the only durable state.
2. The `.env` file (contains `DJANGO_SECRET_KEY`; without it, old sessions
   die on restore).
3. (Optional) The `nginx/certs/` directory if you have real TLS certs.

### Nightly dump

```bash
sudo tee /etc/cron.daily/office-ping-backup <<'SH' >/dev/null
#!/bin/sh
set -eu
TS=$(date -u +%Y%m%d-%H%M)
DEST=/var/backups/office-ping
mkdir -p "$DEST"
cd /opt/office-ping
docker compose -p officeping exec -T postgres \
  pg_dump -U officeping officeping | gzip > "$DEST/officeping-$TS.sql.gz"
cp .env "$DEST/env-$TS.backup"
# Keep 30 days
find "$DEST" -type f -mtime +30 -delete
SH
sudo chmod +x /etc/cron.daily/office-ping-backup
```

Then **copy `/var/backups/office-ping/` offsite** daily (rsync to NAS, upload
to object storage, etc.).

### Restore

```bash
cd /opt/office-ping
docker compose -p officeping down
docker volume rm officeping_postgres_data
docker compose -p officeping up -d postgres redis
# wait a few seconds for postgres to be ready
gunzip -c /var/backups/office-ping/officeping-<TIMESTAMP>.sql.gz | \
  docker compose -p officeping exec -T postgres \
    psql -U officeping -d officeping
docker compose -p officeping up -d
```

---

## 10. Changing the public port

If port 80 or 8080 is already taken on your server, edit
`/opt/office-ping/docker-compose.yml`:

```yaml
nginx:
  ports:
    - "8081:80"       # change left side only
```

Then add the new URL to `.env` (`CORS_ALLOWED_ORIGINS` and
`CSRF_TRUSTED_ORIGINS`). Restart:

```bash
docker compose -p officeping up -d
```

---

## 11. Updating to a new version

```bash
cd /opt/office-ping
git fetch && git log --oneline HEAD..origin/main   # review what's coming
git pull
docker compose -p officeping build backend frontend
docker compose -p officeping up -d
docker compose -p officeping exec backend python manage.py migrate --noinput
```

Confirm with the smoke tests from step 4.

**Rollback** if a release misbehaves:

```bash
cd /opt/office-ping
git checkout <previous-good-tag-or-sha>
docker compose -p officeping build backend frontend
docker compose -p officeping up -d
# If the bad release introduced a DB migration you want to undo:
docker compose -p officeping exec backend python manage.py migrate <app_label> <previous_migration_name>
```

---

## 12. Day-2 operations

### Watch logs

```bash
docker compose -p officeping logs -f backend          # Django + Channels
docker compose -p officeping logs -f nginx            # HTTP access logs
docker compose -p officeping logs -f --tail=100       # everything, last 100
```

### Open a Django shell

```bash
docker compose -p officeping exec backend python manage.py shell
```

### Reset a user's password

```bash
docker compose -p officeping exec backend python manage.py changepassword <username>
```

### Deactivate someone

Admin UI → **Admin → Users** → Deactivate. (Deactivation preserves their past
pings and audit entries. Full delete is irreversible and not recommended.)

### Check who is online

```bash
docker compose -p officeping exec backend python manage.py shell -c "
from apps.accounts.models import User
from django.utils import timezone
from datetime import timedelta
cutoff = timezone.now() - timedelta(seconds=60)
for u in User.objects.filter(is_active=True, last_seen_at__gte=cutoff).order_by('last_seen_at'):
    print(f'{u.username:20} last seen {u.last_seen_at}')
"
```

### Shut down for maintenance

```bash
docker compose -p officeping down
# Later:
docker compose -p officeping up -d
```

---

## 13. Troubleshooting

| Symptom | Check |
|---|---|
| Login page returns 502 | `docker compose -p officeping logs backend` — is Daphne running? Migrations complete? |
| Login works but no OS popup | Site must be on `https://` or `http://localhost`. Chrome: `chrome://settings/content/notifications` and verify this site is "Allowed". Check OS Focus / Do Not Disturb. |
| WebSocket won't connect | `curl -I http://192.168.1.50/ws/presence/` should NOT return 404. If it does, the `location /ws/` block in `nginx.conf` is missing. If `4401`, the user's JWT is invalid — log out and back in. |
| Presence stuck on "Offline" | The `/ws/presence/` WebSocket isn't connecting from the client. See above. |
| Permissions denied changing admin | HR can't modify admin accounts by design. Log in as ADMIN. |
| Icons broken on install prompt | Hard-refresh (Ctrl+Shift+R), then DevTools → Application → Service Workers → Unregister. The SW cache is versioned so a rebuild usually fixes this automatically. |
| 429 "Rate limit" | Members cap at 10 pings/min, Admin/HR at 60/min. Tune `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']` in `backend/config/settings.py`. |
| Migrations fail on first boot | `docker compose -p officeping exec backend python manage.py migrate --run-syncdb`. For a totally fresh dev DB: `docker compose -p officeping down -v` and start again. |
| CORS error in browser console | The URL the user is on isn't in `.env`'s `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS`. Add it and restart. |

Full issue list and WebSocket deep-dive in [`docs/troubleshooting.md`](troubleshooting.md).

---

## 14. Hand-off checklist

Before you call the install done, confirm:

- [ ] `docker compose -p officeping ps` — all 5 services `Up`, postgres + redis `healthy`
- [ ] HTTP smoke tests from step 4 pass
- [ ] First admin created with role=ADMIN
- [ ] At least one HR + one MEMBER user created manually (not via `seed_demo`)
- [ ] A test ping from HR → MEMBER arrives, OS notification pops, Acknowledge works
- [ ] Internal DNS resolves `ping.office.local` **or** hosts entry distributed to every client
- [ ] TLS cert installed and `https://ping.office.local` loads with a trusted lock icon
- [ ] `/etc/cron.daily/office-ping-backup` installed and the first dump exists
- [ ] A copy of the backup is sitting on something that **isn't this server**
- [ ] `.env` is `chmod 600` and the password is in your password manager
- [ ] Documented, for the next on-call engineer: server IP, SSH access, backup location

That's it. Ping away.

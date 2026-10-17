#!/usr/bin/env bash
# One-time preparation of a new Ubuntu server for Office Ping (run as root):
#
#   sudo DOMAIN=ping.tejgyan.org APP_USER=$USER bash scripts/server-setup.sh
#
# Installs Docker + Compose, git, curl, nginx and certbot; lets APP_USER run
# Docker; and adds an nginx site for DOMAIN that forwards to the app on
# 127.0.0.1:8080 (WebSockets included). HTTPS comes after DNS points here:
#   sudo certbot --nginx -d $DOMAIN --redirect
# Then, as APP_USER: clone the repo and run scripts/restore.sh or
# scripts/fresh-install.sh (docs/disaster-recovery.md has the whole list).
set -euo pipefail

DOMAIN="${DOMAIN:?set DOMAIN, e.g. DOMAIN=ping.tejgyan.org}"
APP_USER="${APP_USER:-${SUDO_USER:-}}"
APP_PORT="${APP_PORT:-8080}"
[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo."; exit 1; }
[ -n "$APP_USER" ] || { echo "Set APP_USER (the account that will run Office Ping)."; exit 1; }

echo "==> 1/5 Base packages"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git nginx certbot python3-certbot-nginx openssl

echo "==> 2/5 Docker Engine + Compose (official Docker repository)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> 3/5 Let ${APP_USER} use Docker without sudo"
usermod -aG docker "${APP_USER}"

echo "==> 4/5 nginx site for ${DOMAIN} → 127.0.0.1:${APP_PORT}"
cat > "/etc/nginx/sites-available/${DOMAIN}" <<NGINX
# Office Ping: the app runs in docker compose, bound to 127.0.0.1:${APP_PORT}
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ { root /var/www/html; }   # Let's Encrypt

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;      # WebSockets (live pings)
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
    }
}
NGINX
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "==> 5/5 Firewall"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp; ufw allow 443/tcp
else
  echo "ufw not active; nothing changed"
fi

echo
echo "Done. Next (as ${APP_USER}, after logging out and back in so Docker works):"
echo "  git clone https://github.com/mangeshchavan/office-ping.git && cd office-ping"
echo "  cp deploy/docker-compose.override.server.yml docker-compose.override.yml"
echo "  DOMAIN=${DOMAIN} scripts/restore.sh <backup.sql.gz>     # or scripts/fresh-install.sh"
echo "Then, once DNS for ${DOMAIN} points here:  sudo certbot --nginx -d ${DOMAIN} --redirect"

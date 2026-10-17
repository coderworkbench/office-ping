# Shared helpers for the backup / restore / install scripts. Source, don't run.

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
REPO_DIR="$PWD"

say()  { printf '\n==> %s\n' "$*"; }
fail() { printf '\nError: %s\n' "$*" >&2; exit 1; }

# Create .env with fresh secrets if there isn't one. DOMAIN (e.g.
# ping.tejgyan.org) sets the allowed host and HTTPS origins.
ensure_env() {
  [ -f .env ] && return 0
  local domain="${DOMAIN:-}"
  if [ -z "$domain" ] && [ -t 0 ]; then
    read -r -p "Domain people will open (e.g. ping.tejgyan.org; leave empty for local only): " domain
  fi
  say "Creating .env with new secrets"
  local hosts="localhost,127.0.0.1" origins="http://localhost:8080"
  if [ -n "$domain" ]; then hosts="$domain,$hosts"; origins="https://$domain,$origins"; fi
  sed -e "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$(openssl rand -hex 32)|" \
      -e "s|^DJANGO_DEBUG=.*|DJANGO_DEBUG=false|" \
      -e "s|^DJANGO_ALLOWED_HOSTS=.*|DJANGO_ALLOWED_HOSTS=$hosts|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
      -e "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=$origins|" \
      -e "s|^CSRF_TRUSTED_ORIGINS=.*|CSRF_TRUSTED_ORIGINS=$origins|" \
      .env.example > .env
  chmod 600 .env
}

wait_for_postgres() {
  local i
  for i in $(seq 1 60); do
    docker compose exec -T postgres sh -c 'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' && return 0
    sleep 2
  done
  fail "the database didn't start. See: docker compose logs postgres"
}

# The app answers on 127.0.0.1:$APP_PORT (8080 unless the override changes it).
APP_PORT="${APP_PORT:-8080}"
wait_for_app() {
  local i
  for i in $(seq 1 90); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/api/me/")" = "401" ] && return 0
    sleep 2
  done
  fail "the app didn't come up. See: docker compose logs backend"
}

psql_q() {  # run SQL from stdin against the app database
  docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' -- "$@"
}

show_summary() {
  say "What's in the database now"
  psql_q -At -F ' ' <<'SQL'
select 'users',      count(*) from accounts_user where is_active;
select 'admins',     count(*) from accounts_user where is_active and role = 'ADMIN';
select 'templates',  count(*) from message_templates_messagetemplate where is_active;
select 'groups',     count(*) from groups_group where is_active;
select 'pings',      count(*) from notifications_ping;
SQL
  echo "admin accounts: $(psql_q -At -c "select string_agg(username, ', ') from accounts_user where is_active and role = 'ADMIN'")"
}

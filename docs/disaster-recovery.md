# Backups and disaster recovery

If the server is lost, Office Ping can be rebuilt on any machine from this
repository plus one backup file. With a backup, everything comes back as it
was: every account and password, roles, groups, templates (including the three
on the home screen), statuses, ping history and the audit log.

| You have | Run | You get back |
|---|---|---|
| A backup file | `scripts/restore.sh <file>` | Everything, as of the backup |
| No backup | `scripts/fresh-install.sh` | The templates kept in the repo and a new admin you create; everything else starts empty |

## Backups

`scripts/backup.sh` saves the whole database to
`~/office-ping-backups/officeping-<date>-<time>.sql.gz` and checks the file is
complete. It doesn't stop the app.

```bash
cd ~/office-ping
scripts/backup.sh                          # one backup now
scripts/backup.sh --keep-days 30           # and delete ones older than 30 days
scripts/backup.sh --copy-to ubuntu@other-server:office-ping-backups   # and copy it off this server
```

**Daily, automatically:** add this with `crontab -e` (as the user that runs
Office Ping; no sudo needed). It backs up at 02:00 and keeps 30 days:

```cron
0 2 * * * cd $HOME/office-ping && scripts/backup.sh --keep-days 30 >> $HOME/office-ping-backups/backup.log 2>&1
```

**Keep a copy somewhere else.** Backups on the same server are lost with it.
Add `--copy-to user@host:dir` (that machine needs your SSH key), or copy the
newest file off regularly, for example from another machine:

```bash
scp tgf-dev:'office-ping-backups/officeping-*.sql.gz' ~/office-ping-backups/
```

> [!WARNING]
> Backups contain password hashes and everyone's messages. Keep them private,
> and never commit them: the repository is public. `.gitignore` already
> excludes `*.sql` and `*.sql.gz`.

Secrets in `.env` (`DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`) don't need
backing up: a rebuilt server gets new ones, and people simply sign in again.

## Rebuilding after a crash

On a new Ubuntu server (any provider, or a spare machine on the office network):

1. **Prepare the server** (once, as an admin user):
   ```bash
   git clone https://github.com/mangeshchavan/office-ping.git && cd office-ping
   sudo DOMAIN=ping.tejgyan.org APP_USER=$USER bash scripts/server-setup.sh
   ```
   This installs Docker, nginx and certbot and adds the nginx site. Log out and
   back in afterwards, so your user can use Docker.

2. **Point the app at the host's nginx:**
   ```bash
   cd office-ping
   cp deploy/docker-compose.override.server.yml docker-compose.override.yml
   ```

3. **Bring the data back**, with the newest backup file copied to the server:
   ```bash
   DOMAIN=ping.tejgyan.org scripts/restore.sh ~/officeping-20261017-020000.sql.gz
   ```
   It creates `.env` with new secrets, restores the database, builds and starts
   the app (a few minutes the first time), then lists what's there: users,
   admins, templates, groups and pings. Type `restore` when asked.

   **No backup?** Run `DOMAIN=ping.tejgyan.org scripts/fresh-install.sh`
   instead. It loads the templates from `backend/initial_data/templates.json`
   and asks for the first admin's username, email and password.

4. **Point DNS at the new server** (BigRock: the A record for
   `ping.tejgyan.org` → the new IP) and, once it resolves there, turn on HTTPS:
   ```bash
   sudo certbot --nginx -d ping.tejgyan.org --redirect
   ```

5. **Check:** open https://ping.tejgyan.org and sign in as the admin. Then set
   up the daily backup (above) on the new server.

People's browsers reconnect by themselves. Because `.env` has new secrets,
everyone is asked to sign in again, with their usual password.

## Trying it out safely

A restore replaces the database of the copy you run it in. To practise without
touching anything, use a separate folder and port on any machine with Docker:

```bash
git clone https://github.com/mangeshchavan/office-ping.git op-test && cd op-test
printf 'services:\n  nginx:\n    ports: !override\n      - "127.0.0.1:8099:80"\n' > docker-compose.override.yml
COMPOSE_PROJECT_NAME=op-test APP_PORT=8099 scripts/restore.sh ~/officeping-<date>.sql.gz
# … check http://127.0.0.1:8099, then remove it:
COMPOSE_PROJECT_NAME=op-test docker compose down -v
```

## Keeping the template list current

`backend/initial_data/templates.json` is what a backup-less install starts
with. When templates change in the app, update it (titles, messages and
`"show_on_home": true` for up to three) and commit it. Templates aren't
secret; users and passwords are never stored in the repo.

# Administration

## Day-to-day tasks

- Create a user:
  Admin UI → **Admin → Users** → fill the form.
  Or via API: `POST /api/users/` (ADMIN only).

- Create a group:
  **Groups** → enter name → add members via the dropdown.
  HR and ADMIN can both do this; MEMBER cannot unless
  `ALLOW_MEMBERS_CREATE_GROUPS=true` is set in `.env`.

- Create a template:
  **Templates** → title + message. HR/ADMIN only.

- Deactivate a user:
  **Admin → Users** → Deactivate. The user is retained for history
  integrity (`is_active=False`); past audit logs still reference them.

## Audit logs

**Admin → Audit logs** or `GET /api/audit-logs/` (ADMIN only). Logged
events include LOGIN, LOGOUT, USER_CREATED/UPDATED, PASSWORD_CHANGED, PASSWORD_RESET,
GROUP_CREATED/UPDATED/DELETED, MEMBER_ADDED/REMOVED, TEMPLATE_CREATED/UPDATED/DELETED,
PING_SENT, PING_BLOCKED, PING_ACKNOWLEDGED (with the quick reply, if any),
PING_ESCALATED, PINGS_EXPORTED and LOGIN_FAILED.

## Sign-in protection

Only failed sign-ins count. After `LOGIN_MAX_FAILURES_PER_USER` (5) failures a
username is locked, and after `LOGIN_MAX_FAILURES_PER_IP` (20) failures an IP
address is locked, until `LOGIN_LOCKOUT_SECONDS` (900) have passed since the
first failure. A successful sign-in clears that username's count. To unlock
someone early, reset their password and restart Redis, or wait.

The app is reachable from the internet at its public domain. If it should be
office-only, restrict it at the host nginx (`allow 203.0.113.0/24; deny all;`
with the office's public IP) or put it behind the VPN.

## Urgent escalation

The `escalator` service (`python manage.py escalate_urgent --loop`) checks
every 30 seconds. An urgent ping still unacknowledged after
`URGENT_ESCALATE_AFTER_MINUTES` (5) pops up again for the recipient, marked as
a reminder, and the sender gets a notice. Each delivery escalates once.
Set it to `0` to turn this off. There is no phone or e-mail escalation (no SMS
gateway or mail server is configured).

## Opening Office Ping at sign-in

`frontend/public/autostart/` holds the setup files the Help page offers:
`windows.ps1` (a Startup-folder shortcut), `mac.sh` (a LaunchAgent) and
`linux.sh` (an XDG autostart entry plus an app-menu launcher). Each opens
`<site>/dashboard` with Chrome/Edge/Chromium/Brave `--app=…` at sign-in, needs
no admin rights, and undoes itself with `-Remove` / `--remove`. The address
defaults to `https://ping.tejgyan.org`; another deployment changes that line
in the three files (or users set `OFFICE_PING_URL`). The Help page's
copy-paste commands use whatever address the app is opened at.

For many machines at once, IT can push the same thing centrally, for example
a Group Policy logon shortcut to `msedge.exe --app=https://ping.tejgyan.org/dashboard`.

## Exporting history

Admins can download any History view as CSV (**History → Export CSV**, or
`GET /api/pings/export/` with the same filters as `/api/pings/`). Each export
is audited as `PINGS_EXPORTED`. Messages that start with `=`, `+`, `-` or `@`
are prefixed with `'` so spreadsheet apps don't run them as formulas.

## System limits

- Ping rate: 5/minute for everyone; a group ping counts once. Change it with
  `PING_RATE` (members) and `PING_RATE_ELEVATED` (HR/admins) in `.env`, for
  example `PING_RATE_ELEVATED=20/minute`, then `docker compose up -d backend`.
- Same person: at most 2 direct pings a minute from one sender, and no
  repeating the same message within that minute (`PING_RATE_PER_RECIPIENT`).
  Refused attempts are audited as `PING_BLOCKED`.
- Message length: 500 chars (`PingCreateSerializer`); quick replies 120.
- Day boundary for "Pings today": midnight in `TIME_ZONE` (default
  `Asia/Kolkata`).

## Database migrations

Migrations are committed under `backend/apps/*/migrations/`; the backend only
runs `migrate` at start-up. After changing a model, run `make makemigrations`,
review the new file and commit it. `tests/test_migrations.py` fails if a model
change has no migration.

## Backup & restore

See [deployment-lan.md](deployment-lan.md).

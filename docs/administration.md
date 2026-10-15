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
events include LOGIN, LOGOUT, USER_CREATED/UPDATED, PASSWORD_CHANGED,
GROUP_CREATED/UPDATED/DELETED, MEMBER_ADDED/REMOVED, TEMPLATE_CREATED/UPDATED/DELETED,
PING_SENT, PING_ACKNOWLEDGED.

## System limits

- Ping rate: 10/minute for MEMBER, 60/minute for ADMIN/HR
  (`REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']` in `config/settings.py`).
- Message length: 500 chars (`PingCreateSerializer`).

## Backup & restore

See [deployment-lan.md](deployment-lan.md).

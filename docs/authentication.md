# Authentication

Current V1: username + password → JWT access/refresh pair.

Endpoints:

- `POST /api/auth/login/`   → `{ access, refresh }`
- `POST /api/auth/refresh/` → `{ access, refresh }`
- `POST /api/auth/logout/`  → blacklist refresh
- `POST /api/me/password/`  → change own password (requires current)
- `POST /api/users/<id>/set-password/` → admin sets a user's password

The access token lifetime defaults to 12 hours; refresh is 7 days.

Sign-in is protected against password guessing: after 5 failed attempts a
username is locked for 15 minutes (20 failures lock an IP address), and the
response is `429` with `Retry-After`. Sign-ins and failures are audited as
`LOGIN` and `LOGIN_FAILED`. Client IPs come from the last `X-Forwarded-For`
entry (the one nginx adds), so a browser can't forge its address. See
[administration.md](administration.md#sign-in-protection) for the settings.

## Server-side enforcement

Every REST endpoint and both WebSocket consumers derive the authenticated
user from the token/session. The server never trusts a client-supplied
`sender_id` or `role`:

- `PingViewSet.create` sets `sender = request.user`.
- `JWTAuthMiddleware` validates the token on WS connect and joins the
  connection to `user.<auth_user_id>`.

## Device registration

On login the PWA calls `POST /api/devices/` with a stable `device_id`
(persisted in `localStorage`) plus browser/OS. A user may have many devices.
IP is captured server-side from `REMOTE_ADDR` (nginx fills this from
`X-Forwarded-For` of a trusted private subnet).

## Future: SSO / Keycloak

The DRF/Channels stack is wired through a thin JWT boundary. To add SSO:

1. Add `mozilla-django-oidc` or `social-auth-app-django` to `INSTALLED_APPS`.
2. Add an OIDC login endpoint that exchanges the IdP response for the same
   SimpleJWT `TokenObtainPair` the PWA already consumes.
3. Keep `JWTAuthMiddleware` as-is; it only validates signatures and `user_id`.

## Passwords

**Change your own password** (every user): the key icon in the sidebar opens
`/account`, which calls `POST /api/me/password/` with
`{ current_password, new_password }`. Audited as `PASSWORD_CHANGED`.

**Admin reset** (admins only): on **Admin → Users**, *Reset password* opens a
dialog with a generated, easy-to-read password (e.g. `Kp7m-Qx4z-Rt9w`) that
the admin can copy and hand to the user. It calls
`POST /api/users/<id>/set-password/` with `{ new_password }`. HR and members
get `403`. Audited as `PASSWORD_RESET` (the password itself is never logged).

Both endpoints run Django's password validators (minimum length, common
passwords, all-numeric, similarity to the username/name).

Known limitation: the SimpleJWT token blacklist is not installed, so a reset
does not sign the user out of sessions that are already open; those expire
with their tokens (access 12 h, refresh 7 days).

There is no self-service "forgot password" email flow (SMTP is often not
available on a hardened office LAN). From the shell, an admin can also use
`python manage.py changepassword <username>`. A hosted email reset flow is
standard Django (`django.contrib.auth.views.PasswordResetView` + an SMTP
server reachable from the backend container).

# Authentication

Current V1: username + password → JWT access/refresh pair.

Endpoints:

- `POST /api/auth/login/`   → `{ access, refresh }`
- `POST /api/auth/refresh/` → `{ access, refresh }`
- `POST /api/auth/logout/`  → blacklist refresh
- `POST /api/me/password/`  → change password (requires current)

The access token lifetime defaults to 12 hours; refresh is 7 days.

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

## Password reset

Not shipped as an endpoint in V1 (SMTP is often not available on a
hardened office LAN). An admin can reset a user's password via the Django
admin or `python manage.py changepassword <username>`. The code to add a
hosted reset flow is standard Django (`django.contrib.auth.views.PasswordResetView`
+ an SMTP server reachable from the backend container).

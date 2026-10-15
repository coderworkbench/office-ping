# Troubleshooting

## Login works but no notifications appear

1. Check `Notification.permission` in DevTools console (should be `granted`).
2. Ensure the site is on **http://localhost** (allowed) or **HTTPS** —
   notifications require a secure context. `http://192.168.1.50` won't
   receive OS notifications on Chrome.
3. In DevTools → Application → Service Workers, confirm `/sw.js` is
   active. If not, hard-refresh.
4. Open two browser windows and send a ping from one to the other.
   DevTools → Network → WS → verify a message of
   `{"type":"notification",...}` arrives.

## WebSocket won't connect

- Check `/ws/notifications/` responds `HTTP 101` (upgrade). If `404`,
  nginx is proxying to the frontend; verify `location /ws/` block in
  `nginx/nginx.conf`.
- If `4401`, the token is invalid or missing. Log out & back in.
- CORS/origin: `AllowedHostsOriginValidator` in `config/asgi.py` requires
  the request `Origin` to be in `DJANGO_ALLOWED_HOSTS`.

## Presence stuck at offline

- Check `last_seen_at` in Django admin after the user logs in. If it never
  updates, the presence WebSocket isn't connecting — see above.
- The threshold is 60 seconds. During reconnects, that window is normal.

## Rate-limited pings

- Members are capped at 10/min. If an HR account is rate-limited, verify
  the user's role in admin.

## Migrations fail with `relation does not exist`

```bash
docker compose exec backend python manage.py migrate --run-syncdb
```

For a fresh dev environment, you can nuke and reseed:

```bash
docker compose down -v && make dev && make migrate && make seed
```

## Scenarios to verify after deploy

- A → B individual ping delivers in < 2s on LAN and reaches `Delivered`.
- Group ping to a 5-person group creates 5 `PingDelivery` rows; offline
  members show `delivered: 0` for that row until they connect.
- A MEMBER cannot `GET /api/pings/<id>/` for a ping they are not party to
  (should return 404).
- A MEMBER cannot `GET /api/audit-logs/` (403).
- A MEMBER cannot `POST /api/groups/` unless `ALLOW_MEMBERS_CREATE_GROUPS`.

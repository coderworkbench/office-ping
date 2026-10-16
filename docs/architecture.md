# Architecture

## Apps

- `apps.accounts` — custom `User`, roles (ADMIN/HR/MEMBER), status
  (meeting / DND / lunch / away, with an end time), `Device`
  (per-browser session), JWT auth with sign-in lockout, password change,
  device registration.
- `apps.groups` — `Group` + `GroupMember`.
- `apps.templates` — `MessageTemplate` (DRF app label `message_templates`
  to avoid collision with Django's `templates`).
- `apps.notifications` — `Ping` (sender XOR recipient/group), `PingDelivery`
  (per-recipient status, quick reply, escalation time), REST ViewSet with
  History filters and CSV export, Channels consumers, and the
  `escalate_urgent` command run by the `escalator` service.
- `apps.audit` — `AuditLog` with helpers and middleware. Only admins can read.
- `apps.common` — role-based permission classes and the aggregate dashboard.

## Request flow — individual ping

```
Mangesh (PWA)
  POST /api/pings/ { recipient: rahul.id, message: "Please come here" }
    ↓
PingViewSet.create()
  ├─ validate (recipient XOR group, non-empty message, rate-limit)
  ├─ Ping.objects.create(...)
  ├─ PingDelivery(ping=p, recipient=rahul)
  └─ NotificationService().deliver(ping, [delivery])
       ↓ (channel layer group_send to `user.rahul.id`)
Rahul's NotificationConsumer receives `notification.message`
  ↓
Browser PWA receives WS event
  ├─ ACKs delivered   -> consumer updates PingDelivery.delivered_at
  │                     and notifies sender via `user.mangesh.id` group
  └─ SW shows OS notification; user may Acknowledge from inbox
       ↓
POST /api/pings/<id>/acknowledge/
  └─ marks delivery+ping as ACKNOWLEDGED, notifies sender
```

## Routing isolation

Each authenticated user is joined to a channel-layer group `user.<id>` at
connect time. The server only addresses that group. A connected user
**cannot** subscribe to another user's channel.

## Rate limiting

Scoped throttles on `POST /api/pings/`:

- `ping_send` — MEMBER, default `5/minute` (`PING_RATE` in `.env`).
- `ping_send_elevated` — ADMIN/HR, default `5/minute` (`PING_RATE_ELEVATED`).

A group ping counts once. Over the limit the API answers `429` with a
`Retry-After` header and a message such as "You can send 5 pings a minute.
Try again in 42 seconds.", which the UI shows as-is.

Direct pings also have a per-pair limit, checked in `PingViewSet.create`
against recent `Ping` rows: at most `PING_RATE_PER_RECIPIENT` (default
`2/minute`) from one sender to the same recipient, and never the same message
twice to the same recipient within that period. It applies to every role;
group pings are exempt. Refusals are `429` with `Retry-After`, and a
`PING_BLOCKED` audit entry is written at most once per period per pair.

Chosen scope depends on the authenticated user; clients cannot bypass.

## Permissions

| Action                              | ADMIN | HR | MEMBER |
|-------------------------------------|:-----:|:--:|:------:|
| Create / deactivate users           |  ✓    |    |        |
| Change another user's role          |  ✓    |    |        |
| Create / edit / delete groups       |  ✓    | ✓  |  (flag) |
| Add / remove group members          |  ✓    | ✓  |        |
| Create / edit / delete templates    |  ✓    | ✓  |        |
| Send ping to user                   |  ✓    | ✓  |  ✓     |
| Send ping to group                  |  ✓    | ✓  |        |
| View audit logs                     |  ✓    |    |        |
| View dashboard aggregates           |  ✓    | ✓  |        |

All checks run server-side. The frontend uses role to shape UI only.

## Future compatibility

`NotificationService` is a composite of notifiers. Add a `WebPushNotifier`
that calls `pywebpush` with VAPID keys and the user's push subscription;
the ping path does not change.

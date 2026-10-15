# Architecture

## Apps

- `apps.accounts` — custom `User`, roles (ADMIN/HR/MEMBER), `Device`
  (per-browser session), JWT auth, password change, device registration.
- `apps.groups` — `Group` + `GroupMember`.
- `apps.templates` — `MessageTemplate` (DRF app label `message_templates`
  to avoid collision with Django's `templates`).
- `apps.notifications` — `Ping` (sender XOR recipient/group), `PingDelivery`
  (per-recipient status), REST ViewSet, Channels consumers.
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

- `ping_send` — default `10/minute`.
- `ping_send_elevated` — `60/minute` for ADMIN/HR.

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

# WebSocket

Two endpoints, both authenticated by `?token=<access-jwt>`.

## `/ws/notifications/`

Server → client messages:

```json
{ "type": "notification",
  "payload": {
    "ping_id": 42, "delivery_id": 7, "sender_name": "HR",
    "message": "Please join the meeting", "priority": "NORMAL",
    "group_name": "Backend Team", "created_at": "..." } }

{ "type": "ping_status",
  "payload": { "ping_id": 42, "kind": "acknowledged",
               "delivery_id": 7, "recipient_id": 102, "at": "..." } }
```

Client → server messages:

```json
{ "type": "ack_delivered", "delivery_id": 7 }
{ "type": "ack_seen",      "delivery_id": 7 }
```

Backend never trusts a user-supplied `recipient_id` — the consumer only
accepts ACKs for `PingDelivery` rows where `recipient_id == scope.user.id`.

## `/ws/presence/`

Client → server:

```json
{ "type": "heartbeat" }
```

Server → client:

```json
{ "type": "heartbeat_ack", "server_time": "..." }
```

The client heartbeats every 25s (configurable). The server updates
`User.last_seen_at`; a user is considered "online" if `last_seen_at` is
within 60s. On WS close that stops updating, so the user naturally rolls
to offline.

## Reconnect

The `ReconnectingWS` client in `lib/ws.ts` uses capped exponential backoff
starting at 500ms, max 30s. It de-duplicates: at most one `WebSocket` per
`ReconnectingWS` instance. The `NotificationsRuntime` component creates
exactly one instance per logged-in session and tears it down on logout.

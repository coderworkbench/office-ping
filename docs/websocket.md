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

{ "type": "ping_handled", "payload": { "ping_id": 42 } }
```

- `notification` goes to every open tab/device of the recipient. On connect,
  the server also re-sends pings that never reached a browser
  (`delivered_at` is null, last 24 h). Delivered-but-unacknowledged pings
  are *not* re-sent; they live in the inbox. A ping created while a socket is
  connecting can arrive twice (live and as pending), so the client shows each
  `ping_id` once per session.
- `ping_handled` goes to all of the recipient's tabs/devices when they
  acknowledge a ping anywhere, so the pop-up and OS notification close
  everywhere.
- `ping_status` goes to the sender.

Chat (see `apps/chat`):

```json
{ "type": "chat_message",
  "payload": {
    "conversation_id": 5, "sender_name": "Mem A", "client_id": "lq3x9a1b2c",
    "quiet": false,
    "message": { "id": 812, "conversation_id": 5, "sender_id": 12,
                 "body": "Lunch?", "created_at": "..." } } }

{ "type": "chat_read",
  "payload": { "conversation_id": 5, "user_id": 47, "message_id": 812 } }

{ "type": "chat_typing", "payload": { "conversation_id": 5, "user_id": 12 } }
```

- `chat_message` goes to both members (the sender's other tabs and devices
  too). `client_id` is whatever the sending tab passed to the REST call, so
  it can replace its "Sending…" bubble. `quiet` is true when that recipient
  is *In a meeting* or *Do not disturb*: no desktop notification.
- `chat_read` goes to both members when someone's read marker moves forward.
- `chat_typing` goes only to the other member.

Client → server messages:

```json
{ "type": "ack_delivered", "delivery_id": 7 }
{ "type": "ack_seen",      "delivery_id": 7 }
{ "type": "chat_typing",   "conversation_id": 5 }
```

`chat_typing` is sent at most once every 3 seconds while typing. The server
checks membership once per conversation per connection and drops anything
else. Messages themselves are sent over REST
(`POST /api/chat/conversations/<id>/messages/`), never over the socket.

Backend never trusts a user-supplied `recipient_id` — the consumer only
accepts ACKs for `PingDelivery` rows where `recipient_id == scope.user.id`.

## `/ws/presence/`

Heartbeats only. This socket does not join the `user.<id>` group, so ping
events never reach it.

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

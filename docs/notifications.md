# Notifications

## Delivery pipeline

1. `POST /api/pings/` creates `Ping` + one `PingDelivery` per recipient
   (one row for individual, N for group).
2. `NotificationService.deliver` fans out via WebSocket (`WebSocketNotifier`).
3. Each recipient's `NotificationConsumer` receives the event and sends it
   to the browser.
4. The browser:
   - Posts a message to the service worker to show the OS notification.
   - Sends `{ type: "ack_delivered", delivery_id }` back on the WS.
5. Consumer marks `PingDelivery.delivered_at` and emits a `ping_status`
   event back on the sender's channel.
6. The recipient opens the inbox → `POST /api/pings/<id>/seen/` (or the
   consumer updates on receipt). Clicking **Acknowledge** triggers
   `POST /api/pings/<id>/acknowledge/`.

Delivery states are tracked **per recipient** so group pings can honestly
report `Delivered: 4 / Offline: 1 / Acknowledged: 3`.

## How an incoming ping is shown

- **In-app pop-up** (`components/PingAlert.tsx`): the page dims and a card
  appears in the middle of the screen. It stays until the recipient clicks
  **Acknowledge** or **Later** (Escape). Several pings queue up, with a
  "N more waiting · Open inbox" shortcut. We deliberately avoid a
  full-screen takeover.
- **Tab title** flashes `🔔 <sender>` while any ping is waiting in the pop-up.
- **OS notification**: every ping uses `requireInteraction: true`, so it stays
  on screen until clicked. Clicking it focuses the open Office Ping window,
  and the service worker posts `focus-ping` so that ping's pop-up comes first.
  Once a ping is handled in-app, its OS notification (tag `ping-<id>`) is
  closed automatically.
- **Several tabs or devices**: each one shows the ping, but acknowledging it
  in one closes the pop-up and OS notification in all of them
  (`ping_handled` WebSocket message).

## Priority

- `NORMAL` → pop-up with a blue accent and a two-note chime.
- `URGENT` → jumps to the front of the queue, red pulsing pop-up, and a
  three-note chime.

## Service worker

`/public/sw.js`:

- Minimal offline shell cache so `/login` and `/dashboard` stay reachable
  during brief LAN hiccups.
- Receives `show-notification` messages from pages and calls
  `showNotification` so background tabs still notify.
- `notificationclick` → focuses an existing tab (navigating it to
  `/notifications`) or opens a new one.

## Permission handling

On first authenticated page load `NotificationsRuntime` calls
`Notification.requestPermission()`. If the user denies, the inbox still
works but no OS notifications fire. The UI shows a clear status strip
(`Nav` shows unread badge regardless).

## Adding Web Push later

The abstraction supports it:

```python
# apps/notifications/services.py
class WebPushNotifier:
    def send(self, user_id, envelope):
        for sub in PushSubscription.objects.filter(user_id=user_id):
            pywebpush.webpush(sub.to_dict(), json.dumps(...), vapid_private_key=..., ...)

class NotificationService:
    def __init__(self):
        self.notifiers = [WebSocketNotifier(), WebPushNotifier()]
```

Add a `PushSubscription` model, a `POST /api/push-subscriptions/` endpoint,
and extend `sw.js` with a `push` listener. Ping code remains unchanged.

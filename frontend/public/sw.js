// Office Ping — minimal service worker.
// Responsibilities:
//   1. Install/activate as the controlling SW for the PWA scope.
//   2. Provide a basic offline shell cache for the login/dashboard chrome.
//   3. Receive messages from pages and show OS-level notifications.
//
// We do NOT include Web Push here (that requires VAPID keys and a push server);
// the architecture is designed so WebPushNotifier can be added server-side
// without touching ping logic. See docs/notifications.md.

const CACHE = 'office-ping-shell-v3';
const SHELL = ['/', '/login', '/dashboard', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only intercept GET navigations
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return;

  event.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((cached) => cached || caches.match('/'))
    )
  );
});

// Pages post messages for us to show a notification (when the page is backgrounded).
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'show-notification') return;
  const { title, body, tag, url, priority } = data;
  const requireInteraction = priority === 'URGENT';
  self.registration.showNotification(title || 'Office Ping', {
    body: body || '',
    tag: tag || 'office-ping',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    requireInteraction,
    data: { url: url || '/notifications' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/notifications';
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Prefer an already-open Office Ping window → focus + navigate.
    for (const w of wins) {
      try {
        const u = new URL(w.url);
        if (u.origin === self.location.origin) {
          if ('navigate' in w) { try { await w.navigate(url); } catch {} }
          return w.focus();
        }
      } catch {}
    }
    // Fallback: open a new window (brings PWA forward in Chrome/Edge).
    return clients.openWindow(url);
  })());
});

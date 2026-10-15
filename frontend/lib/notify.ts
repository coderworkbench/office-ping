// Browser notification helpers.
// The service worker shows the actual OS notification so backgrounded tabs
// still notify. Chrome will not prompt for permission unless the request
// originates from a user gesture — ensureNotificationPermission is called
// from a click handler in NotificationPermissionBanner.

export type Perm = NotificationPermission | 'unsupported';

export function notificationPermission(): Perm {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function ensureNotificationPermission(): Promise<Perm> {
  const p = notificationPermission();
  if (p === 'unsupported' || p !== 'default') return p;
  try {
    return (await Notification.requestPermission()) as Perm;
  } catch {
    return 'denied';
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) {
    console.warn('SW registration failed', e);
    return null;
  }
}

export async function showNotification(
  title: string,
  body: string,
  opts: { tag?: string; url?: string; priority?: 'NORMAL' | 'URGENT' } = {}
) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Prefer the SW path so a backgrounded tab still shows the notification.
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        tag: opts.tag || 'office-ping',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        requireInteraction: opts.priority === 'URGENT',
        data: { url: opts.url || '/notifications' },
      });
      return;
    } catch (e) {
      console.warn('SW showNotification failed, falling back', e);
    }
  }
  try {
    new Notification(title, { body, tag: opts.tag || 'office-ping' });
  } catch {}
}

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
  opts: {
    tag?: string; url?: string; priority?: 'NORMAL' | 'URGENT'; pingId?: number;
    /** false: an informational notice that may go away by itself. */
    sticky?: boolean;
    /** Alert again even though a notification with this tag is showing. */
    renotify?: boolean;
    /** No sound or vibration (chat). */
    silent?: boolean;
  } = {}
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
        // Pings stay on screen until clicked; closed by closeNotification() once handled in-app.
        requireInteraction: opts.sticky !== false,
        renotify: !!opts.renotify,
        silent: !!opts.silent,
        data: { url: opts.url || '/notifications', ping_id: opts.pingId },
      } as NotificationOptions);
      return;
    } catch (e) {
      console.warn('SW showNotification failed, falling back', e);
    }
  }
  try {
    new Notification(title, { body, tag: opts.tag || 'office-ping', requireInteraction: opts.sticky !== false, silent: !!opts.silent });
  } catch {}
}

// Close the OS notification for a ping once it has been handled in the app.
export async function closeNotification(tag: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const open = await reg?.getNotifications({ tag });
    open?.forEach(n => n.close());
  } catch {}
}

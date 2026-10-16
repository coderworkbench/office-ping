'use client';

// Visible, gesture-driven permission banner. Modern browsers often ignore
// Notification.requestPermission() when it is called outside of a user
// gesture, which is why we can't just prompt on load — we show this bar
// until the user clicks "Enable". After "granted" or "denied" we hide it.

import { useEffect, useState } from 'react';
import { ensureNotificationPermission, notificationPermission, showNotification, Perm } from '../lib/notify';

export function NotificationPermissionBanner() {
  const [perm, setPerm] = useState<Perm>('default');

  useEffect(() => { setPerm(notificationPermission()); }, []);

  if (perm === 'granted' || perm === 'unsupported') return null;

  const denied = perm === 'denied';

  return (
    <div className="mb-6 animate-slideIn" data-tour="notify-enable">
      <div className={
        'flex flex-wrap items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm ' +
        (denied ? 'border-rose/30 bg-rose-soft text-rose'
                : 'border-gold-fill/50 bg-gold-soft text-ink')
      }>
        <span className={'grid h-9 w-9 shrink-0 place-items-center rounded-xl ' +
                         (denied ? 'bg-surface/70' : 'bg-surface')}
              aria-hidden>🔔</span>
        {denied ? (
          <span>
            Desktop notifications are <b>blocked</b>. Click the lock icon in the
            address bar → <b>Notifications → Allow</b>, then reload.
          </span>
        ) : (
          <span className="min-w-0 flex-1 basis-56">Enable desktop notifications so pings pop up even when this tab is in the background.</span>
        )}
        {!denied && (
          <button
            onClick={async () => {
              const p = await ensureNotificationPermission();
              setPerm(p);
              if (p === 'granted') {
                await showNotification('Office Ping', 'Notifications enabled ✓',
                  { tag: 'test', url: '/notifications' });
              }
            }}
            className="btn-primary btn-sm w-full sm:ml-auto sm:w-auto"
          >Enable</button>
        )}
      </div>
    </div>
  );
}

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
    <div className="mb-6 animate-slideIn">
      <div className={
        'rounded-tool border px-3.5 py-2.5 text-sm flex items-center gap-3 ' +
        (denied ? 'bg-ember/5 text-ember border-ember/30'
                : 'bg-paper text-ink border-hairline')
      }>
        <span className={'h-8 w-8 rounded-tool grid place-items-center shrink-0 ' +
                         (denied ? 'bg-ember/10 text-ember' : 'bg-card border border-hairline')}
              aria-hidden>🔔</span>
        {denied ? (
          <span>
            Desktop notifications are <b>blocked</b>. Click the lock icon in the
            address bar → <b>Notifications → Allow</b>, then reload.
          </span>
        ) : (
          <span>Enable desktop notifications so pings pop up even when this tab is in the background.</span>
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
            className="ml-auto btn-dark !py-1"
          >Enable</button>
        )}
      </div>
    </div>
  );
}

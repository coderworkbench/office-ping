'use client';

// Register the service worker on first paint, regardless of auth state.
// Required so Chrome/Edge offer "Install app" on the login page too.

import { useEffect } from 'react';

export function ServiceWorkerBoot() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}

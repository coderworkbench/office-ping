'use client';

// Global in-app toast that slides in when a ping arrives via WebSocket.
// Works even when the OS banner is suppressed (focused tab, DND, quiet mode).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';

type Payload = {
  ping_id: number;
  delivery_id: number;
  sender_name: string;
  message: string;
  priority: 'NORMAL' | 'URGENT';
  group_name: string | null;
};

export function PingToast() {
  const router = useRouter();
  const [item, setItem] = useState<Payload | null>(null);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    const onPing = (ev: Event) => {
      const payload = (ev as CustomEvent<Payload>).detail;
      setItem(payload);
      try { chime(payload.priority); } catch {}
      flashTitle(payload.sender_name);
      updateBadge();
      if (payload.priority === 'URGENT') {
        // Jump into the app for urgent pings (preserves the request).
        router.push('/notifications');
      }
    };
    window.addEventListener('op:ping', onPing);
    return () => window.removeEventListener('op:ping', onPing);
  }, [router]);

  useEffect(() => {
    if (!item) return;
    // auto-dismiss after a while so a stream of pings doesn't pile up
    const t = setTimeout(() => setItem(null), 15000);
    return () => clearTimeout(t);
  }, [item]);

  if (!item) return null;

  const urgent = item.priority === 'URGENT';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={
        'fixed z-50 right-4 top-4 w-[22rem] max-w-[95vw] rounded-xl2 shadow-pop ' +
        'border p-4 bg-card animate-slideIn ' +
        (urgent ? 'border-ember ring-2 ring-ember/20' : 'border-hairline')
      }
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl" aria-hidden>{urgent ? '🚨' : '🔔'}</div>
        <div className="flex-1 min-w-0">
          <div className="eyebrow truncate">
            {item.sender_name}{item.group_name ? ` · ${item.group_name}` : ''}
          </div>
          <div className="font-medium break-words mt-0.5">{item.message}</div>
        </div>
        <button
          aria-label="Dismiss"
          className="text-inkmute hover:text-ink"
          onClick={() => setItem(null)}
        >✕</button>
      </div>
      <div className="mt-3 flex gap-2 justify-end">
        <button
          onClick={() => { setItem(null); router.push('/notifications'); }}
          className="btn-outline !py-1.5"
        >View</button>
        <button
          disabled={acking}
          onClick={async () => {
            setAcking(true);
            try { await apiFetch(`/api/pings/${item.ping_id}/acknowledge/`, { method: 'POST' }); } catch {}
            setAcking(false); setItem(null); resetTitle();
          }}
          className="btn-ember !py-1.5"
        >Acknowledge</button>
      </div>
      <style jsx>{`
        @keyframes slide { from { transform: translateX(110%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

let originalTitle: string | null = null;
let flashTimer: any = null;

function flashTitle(sender: string) {
  if (typeof document === 'undefined') return;
  if (!originalTitle) originalTitle = document.title;
  let on = true;
  clearInterval(flashTimer);
  flashTimer = setInterval(() => {
    document.title = on ? `🔔 ${sender} — Office Ping` : (originalTitle || 'Office Ping');
    on = !on;
  }, 1000);
  // auto-stop after 20s or when the tab regains focus
  const stop = () => resetTitle();
  setTimeout(stop, 20000);
  window.addEventListener('focus', stop, { once: true });
}

function resetTitle() {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
  if (originalTitle && typeof document !== 'undefined') document.title = originalTitle;
}

async function updateBadge() {
  try {
    const r = await apiFetch<{ unread: number }>('/api/notifications/unread_count/');
    const nav: any = navigator;
    if (nav.setAppBadge) await nav.setAppBadge(r.unread);
  } catch {}
}

// Very small chime using WebAudio — no asset shipping needed.
function chime(priority: 'NORMAL' | 'URGENT') {
  if (typeof window === 'undefined') return;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const g = ctx.createGain();
  g.gain.value = 0.05;
  g.connect(ctx.destination);
  const beep = (freq: number, start: number, dur: number) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur);
  };
  if (priority === 'URGENT') {
    beep(880, 0, 0.12); beep(660, 0.14, 0.12); beep(880, 0.28, 0.15);
  } else {
    beep(660, 0, 0.1); beep(880, 0.12, 0.14);
  }
  setTimeout(() => ctx.close().catch(() => {}), 800);
}

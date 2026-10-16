'use client';

// Global pop-up that appears in the middle of the screen when a ping arrives
// via WebSocket. It stays until the recipient acknowledges it or picks
// "Later"; several pings queue up (urgent ones jump to the front). While
// anything is waiting, the tab title keeps flashing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { closeNotification } from '../lib/notify';
import { Avatar } from './ui';

type Payload = {
  ping_id: number;
  delivery_id: number;
  sender_name: string;
  message: string;
  priority: 'NORMAL' | 'URGENT';
  group_name: string | null;
};
type Queued = Payload & { received_at: Date };

export function PingAlert() {
  const router = useRouter();
  const { user } = useAuth();
  const [queue, setQueue] = useState<Queued[]>([]);
  const [acking, setAcking] = useState(false);
  const ackRef = useRef<HTMLButtonElement>(null);
  const item = queue[0];

  useEffect(() => {
    const onPing = (ev: Event) => {
      const p = (ev as CustomEvent<Payload>).detail;
      const q: Queued = { ...p, received_at: new Date() };
      setQueue(prev => {
        if (prev.some(x => x.ping_id === p.ping_id)) return prev;
        return p.priority === 'URGENT' ? [q, ...prev] : [...prev, q];
      });
      try { chime(p.priority); } catch {}
      updateBadge();
    };
    // The service worker posts this when a desktop notification is clicked.
    const onSwMessage = (ev: MessageEvent) => {
      if (ev.data?.type !== 'focus-ping') return;
      setQueue(prev => {
        const i = prev.findIndex(x => x.ping_id === ev.data.ping_id);
        return i <= 0 ? prev : [prev[i], ...prev.slice(0, i), ...prev.slice(i + 1)];
      });
    };
    // Acknowledged in another tab or on another device.
    const onHandled = (ev: Event) => {
      const { ping_id } = (ev as CustomEvent<{ ping_id: number }>).detail;
      setQueue(prev => prev.filter(x => x.ping_id !== ping_id));
    };
    window.addEventListener('op:ping', onPing);
    window.addEventListener('op:ping_handled', onHandled);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      window.removeEventListener('op:ping', onPing);
      window.removeEventListener('op:ping_handled', onHandled);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);

  // Signed out → drop anything still queued.
  useEffect(() => { if (!user) setQueue([]); }, [user]);

  // Flash the tab title until every queued ping has been handled.
  useEffect(() => {
    if (item) startFlash(item.sender_name, queue.length);
    else stopFlash();
  }, [item, queue.length]);
  useEffect(() => stopFlash, []);

  useEffect(() => {
    if (item) setTimeout(() => ackRef.current?.focus(), 30);
  }, [item?.ping_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = useCallback((p: Queued) => {
    setQueue(prev => prev.filter(x => x.ping_id !== p.ping_id));
    closeNotification(`ping-${p.ping_id}`);
  }, []);

  const later = useCallback(() => { if (item) remove(item); }, [item, remove]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') later(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, later]);

  if (!item) return null;

  const urgent = item.priority === 'URGENT';
  const waiting = queue.length - 1;

  async function acknowledge() {
    if (!item || acking) return;
    setAcking(true);
    try { await apiFetch(`/api/pings/${item.ping_id}/acknowledge/`, { method: 'POST' }); } catch {}
    setAcking(false);
    remove(item);
    updateBadge();
  }

  function openInbox() {
    queue.forEach(p => closeNotification(`ping-${p.ping_id}`));
    setQueue([]);
    router.push('/notifications');
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4 bg-slab-900/55 backdrop-blur-sm animate-fadeIn"
    >
      <div
        role="alertdialog" aria-modal="true"
        aria-labelledby="ping-alert-from" aria-describedby="ping-alert-message"
        key={item.ping_id}
        className={
          'w-full max-w-md rounded-xl2 bg-card shadow-pop overflow-hidden ' +
          (urgent ? 'ring-4 ring-ember animate-alertPulse' : 'ring-1 ring-hairline animate-popIn')
        }
      >
        <div className={'h-1.5 ' + (urgent ? 'bg-ember' : 'bg-indigo')} />
        <div className="p-6 sm:p-7 text-center">
          <div className={'mx-auto h-14 w-14 rounded-full grid place-items-center text-3xl ' +
            (urgent ? 'bg-ember-50' : 'bg-paper')} aria-hidden>
            <span className="animate-ring inline-block">{urgent ? '🚨' : '🔔'}</span>
          </div>

          {urgent && (
            <div className="mt-3 inline-block chip border-ember/30 bg-ember-50 text-ember-600 font-semibold">
              URGENT
            </div>
          )}

          <div id="ping-alert-from" className="mt-3 flex items-center justify-center gap-2">
            <Avatar name={item.sender_name} size={26} />
            <span className="font-medium">{item.sender_name}</span>
            {item.group_name && <span className="text-inkmute text-sm">→ {item.group_name}</span>}
          </div>
          <div className="text-xs text-inkmute mt-1 font-mono">
            {item.received_at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </div>

          <p id="ping-alert-message"
             className="display mt-4 text-[clamp(1.4rem,4vw,1.9rem)] leading-snug break-words">
            {item.message}
          </p>

          <div className="mt-7 flex gap-2 justify-center">
            <button onClick={later} className="btn-outline">Later</button>
            <button ref={ackRef} disabled={acking} onClick={acknowledge}
                    className="btn-ember px-6">
              {acking ? 'Acknowledging…' : 'Acknowledge'}
            </button>
          </div>

          {waiting > 0 && (
            <button onClick={openInbox}
                    className="mt-4 text-sm text-inkmute hover:text-ink underline underline-offset-2">
              {waiting} more waiting · Open inbox
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

let originalTitle: string | null = null;
let flashTimer: ReturnType<typeof setInterval> | null = null;

function startFlash(sender: string, count: number) {
  if (typeof document === 'undefined') return;
  if (!originalTitle) originalTitle = document.title;
  if (flashTimer) clearInterval(flashTimer);
  const alert = count > 1 ? `🔔 (${count}) ${sender} — Office Ping` : `🔔 ${sender} — Office Ping`;
  let on = true;
  document.title = alert;
  flashTimer = setInterval(() => {
    on = !on;
    document.title = on ? alert : (originalTitle || 'Office Ping');
  }, 1000);
}

function stopFlash() {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
  if (originalTitle && typeof document !== 'undefined') document.title = originalTitle;
  originalTitle = null;
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

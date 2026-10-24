'use client';

// Small notices for the sender: "Rahul: On my way" when someone replies, and
// "Rahul hasn't acknowledged your urgent ping" when an urgent ping escalates.
// Also shown as a desktop notification when the tab is in the background.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { showNotification } from '../lib/notify';
import { useAuth } from '../lib/auth';

type Toast = { id: string; tone: 'ok' | 'warn'; title: string; body: string };

export function SenderToasts() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onStatus = (ev: Event) => {
      const p = (ev as CustomEvent<any>).detail || {};
      let t: Toast | null = null;
      if (p.kind === 'acknowledged' && p.reply) {
        t = { id: `r${p.delivery_id}`, tone: 'ok', title: `${p.recipient_name}: “${p.reply}”`,
              body: `Reply to “${p.message}”` };
      } else if (p.kind === 'unacknowledged') {
        t = { id: `u${p.delivery_id}`, tone: 'warn', title: `${p.recipient_name} hasn’t acknowledged yet`,
              body: `Your urgent ping “${p.message}” is ${p.minutes} min old. They’ve been reminded; consider calling or walking over.` };
      }
      if (!t) return;
      const toast = t;
      setToasts(prev => prev.some(x => x.id === toast.id) ? prev : [...prev.slice(-2), toast]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== toast.id)), toast.tone === 'warn' ? 15000 : 8000);
      if (document.hidden) {
        showNotification(toast.tone === 'warn' ? `⚠️ ${toast.title}` : `↩ ${toast.title}`, toast.body,
          { tag: toast.id, url: '/history', sticky: toast.tone === 'warn' });
      }
    };
    window.addEventListener('op:ping_status', onStatus);
    return () => window.removeEventListener('op:ping_status', onStatus);
  }, []);

  useEffect(() => { if (!user) setToasts([]); }, [user]);

  if (!toasts.length) return null;
  return (
    <div aria-live="polite"
         className="pointer-events-none fixed inset-x-4 bottom-24 z-[90] flex flex-col items-center gap-2 lg:inset-x-auto lg:bottom-20 lg:right-6 lg:items-end">
      {toasts.map(t => (
        <div key={t.id}
             className={'pointer-events-auto w-full max-w-sm rounded-2xl border bg-surface p-4 shadow-lg animate-slideIn ' +
               (t.tone === 'warn' ? 'border-live' : 'border-line')}>
          <div className="flex items-start gap-3">
            <span aria-hidden className={'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm ' +
              (t.tone === 'warn' ? 'bg-live-soft' : 'bg-success-soft')}>{t.tone === 'warn' ? '⚠️' : '↩'}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{t.title}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">{t.body}</p>
              <Link href="/history" className="mt-1 inline-block text-[13px] font-semibold text-brand hover:underline">View in History</Link>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} aria-label="Dismiss"
                    className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full text-lg text-ink-3 hover:bg-inset">×</button>
          </div>
        </div>
      ))}
    </div>
  );
}

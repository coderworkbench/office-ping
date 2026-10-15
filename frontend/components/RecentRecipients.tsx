'use client';

// Dashboard "Quick ping" strip — the row of people you can ping in one click.
// Priority order of chips:
//   1. People you've recently pinged (most recent first)
//   2. Fill with currently-online teammates
// Up to 6 chips total, deduped, self excluded. Members and first-time users
// always see something to click.
//
// Each chip: click body → opens the PingDialog preselected to that person.
//            click the ember bell → instant "👋 Nudge", no dialog.

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Avatar, Icon } from './ui';
import { PingDialog } from './PingDialog';

type Chip = {
  id: number;
  full_name: string;
  is_online: boolean;
  last_sent_at?: string;  // present if this came from "recent"
};

const MAX_CHIPS = 5;

export function RecentRecipients() {
  const { user } = useAuth();
  const [chips, setChips] = useState<Chip[]>([]);
  const [dialogTarget, setDialogTarget] = useState<Chip | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    try {
      const [pingsR, usersR] = await Promise.all([
        apiFetch<any>('/api/pings/?scope=sent').catch(() => null),
        apiFetch<any>('/api/users/').catch(() => null),
      ]);
      const pings: any[] = pingsR?.results || pingsR || [];
      const users: any[] = usersR?.results || usersR || [];
      const byId = new Map<number, any>(users.map(u => [u.id, u]));

      // 1. recent recipients (dedupe, keep latest)
      const seen = new Map<number, Chip>();
      for (const p of pings) {
        if (!p.recipient || p.recipient === user?.id) continue;
        if (seen.has(p.recipient)) continue;
        const u = byId.get(p.recipient);
        seen.set(p.recipient, {
          id: p.recipient,
          full_name: p.recipient_name,
          is_online: !!u?.is_online,
          last_sent_at: p.created_at,
        });
        if (seen.size >= MAX_CHIPS) break;
      }

      setChips(Array.from(seen.values()));
    } catch {
      setChips([]);
    }
  }

  useEffect(() => {
    if (!user) return;
    load();
    const refresh = () => load();
    window.addEventListener('op:ping',        refresh);
    window.addEventListener('op:ping_status', refresh);
    const t = setInterval(load, 30000);
    return () => {
      window.removeEventListener('op:ping', refresh);
      window.removeEventListener('op:ping_status', refresh);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function nudge(p: Chip) {
    setBusyId(p.id);
    try {
      await apiFetch('/api/pings/', {
        method: 'POST',
        body: JSON.stringify({ recipient: p.id, message: '👋 Nudge' }),
      });
      setFlash(`Nudged ${p.full_name}`);
    } catch {
      setFlash(`Couldn't nudge ${p.full_name}`);
    } finally {
      setBusyId(null);
      setTimeout(() => setFlash(null), 2500);
    }
  }

  if (!chips.length) return null;

  return (
    <>
      <div className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <div className="eyebrow">Recent</div>
          {flash && <span className="text-xs text-ember animate-fadeIn">{flash}</span>}
        </div>

        <ul className="flex gap-2 flex-wrap">
          {chips.map(p => (
            <li key={p.id}
                className="flex items-center gap-2 p-1.5 pr-2
                           border border-hairline bg-card rounded-full
                           hover:border-ink/30 hover:shadow-paper transition
                           whitespace-nowrap">
              <Avatar name={p.full_name} size={28} online={p.is_online} />
              <span className="text-sm font-medium">{p.full_name}</span>
              {p.last_sent_at && (
                <span className="text-[11px] uppercase tracking-wider text-inkmute">
                  {timeAgo(p.last_sent_at)}
                </span>
              )}
              <span className="mx-1 h-5 w-px bg-hairline" aria-hidden />
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => nudge(p)}
                title="Send a quick nudge — no message"
                className="text-sm px-2.5 py-1 rounded-full text-ink hover:bg-paper
                           disabled:opacity-50 transition"
              >
                Nudge
              </button>
              <button
                type="button"
                onClick={() => setDialogTarget(p)}
                title={`Write a message to ${p.full_name}`}
                className="text-sm px-3 py-1 rounded-full bg-ember text-white
                           hover:bg-ember-600 transition"
              >
                Ping
              </button>
            </li>
          ))}
        </ul>
      </div>

      <PingDialog
        open={!!dialogTarget}
        recipientId={dialogTarget?.id || 0}
        recipientName={dialogTarget?.full_name || ''}
        recipientIsOnline={dialogTarget?.is_online}
        defaultMessage="Please come here"
        onClose={() => setDialogTarget(null)}
        onSent={() => {
          setFlash(`Sent to ${dialogTarget?.full_name}`);
          setTimeout(() => setFlash(null), 2500);
        }}
      />
    </>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

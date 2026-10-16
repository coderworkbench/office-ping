'use client';

// Dashboard "Quick ping" strip — the row of people you can ping in one click.
// Priority order of chips:
//   1. People you've recently pinged (most recent first)
//   2. Fill with currently-online teammates
// Up to 6 chips total, deduped, self excluded. Members and first-time users
// always see something to click.
//
// Each chip: click body → opens the PingDialog preselected to that person.
//            click "Nudge" → instant "👋 Nudge", no dialog.

import { useMemo, useState } from 'react';
import { apiFetch, pingErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { listOf, useApi } from '../lib/useApi';
import { Avatar } from './ui';
import { PingDialog } from './PingDialog';
import { NudgeHint } from './NudgeHint';
import { describeStatus, Status, statusEmoji } from '../lib/status';

type Chip = {
  id: number;
  full_name: string;
  is_online: boolean;
  last_sent_at?: string;  // present if this came from "recent"
  status?: Status | null;
};

const MAX_CHIPS = 5;

export function RecentRecipients() {
  const { user } = useAuth();
  const [dialogTarget, setDialogTarget] = useState<Chip | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const live = { refreshOn: ['op:ping', 'op:ping_status', 'op:sent'], intervalMs: 30000 };
  const { data: pingsR } = useApi(user ? '/api/pings/?scope=sent' : null, live);
  const { data: usersR } = useApi(user ? '/api/users/' : null, live);

  // Recent recipients, latest first, one chip each.
  const chips = useMemo(() => {
    const byId = new Map<number, any>(listOf<any>(usersR).map(u => [u.id, u]));
    const seen = new Map<number, Chip>();
    for (const p of listOf<any>(pingsR)) {
      if (!p.recipient || p.recipient === user?.id || seen.has(p.recipient)) continue;
      const u = byId.get(p.recipient);
      if (usersR && !u) continue;   // deactivated since
      seen.set(p.recipient, {
        id: p.recipient, full_name: p.recipient_name,
        is_online: !!u?.is_online, last_sent_at: p.created_at, status: u?.status,
      });
      if (seen.size >= MAX_CHIPS) break;
    }
    return Array.from(seen.values());
  }, [pingsR, usersR, user?.id]);

  function show(text: string, ok: boolean, ms = 4000) {
    setFlash({ text, ok });
    setTimeout(() => setFlash(null), ms);
  }

  async function nudge(p: Chip) {
    setBusyId(p.id);
    try {
      await apiFetch('/api/pings/', {
        method: 'POST',
        body: JSON.stringify({ recipient: p.id, message: '👋 Nudge' }),
      });
      show(`Nudged ${p.full_name}`, true);
      window.dispatchEvent(new Event('op:sent'));
    } catch (e) {
      show(pingErrorMessage(e, `Couldn't nudge ${p.full_name}`), false, 6000);
    } finally {
      setBusyId(null);
    }
  }

  if (!chips.length) return null;

  return (
    <>
      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <h2 className="eyebrow">Recent</h2>
          <NudgeHint />
        </div>
        {flash && (
          <p aria-live="polite"
             className={'-mt-1 mb-2 text-sm font-semibold animate-fadeIn ' + (flash.ok ? 'text-success' : 'text-rose')}>
            {flash.text}
          </p>
        )}

        {/* Chips wrap rather than scroll sideways (§10.1); each chip can shrink
            (min-w-0 + truncated name) so a narrow phone never scrolls (§6.4). */}
        <ul className="flex flex-wrap gap-2">
          {chips.map(p => (
            <li key={p.id}
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-line
                           bg-surface p-1 pl-1.5 shadow-sm transition-colors duration-150 hover:border-gold-fill/60">
              <Avatar name={p.full_name} size={28} online={p.is_online} />
              <span className="min-w-0 truncate pl-0.5 text-sm font-semibold text-ink">{p.full_name}</span>
              {p.status && (
                <span className="shrink-0 cursor-default" title={describeStatus(p.status)} aria-label={describeStatus(p.status)}>
                  {statusEmoji(p.status)}
                </span>
              )}
              {p.last_sent_at && (
                <span className="shrink-0 text-xs text-ink-3" title={new Date(p.last_sent_at).toLocaleString()}>
                  pinged {timeAgo(p.last_sent_at)}
                </span>
              )}
              <span className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden />
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => nudge(p)}
                title="Send a quick nudge — no message"
                aria-label={`Nudge ${p.full_name}`}
                className="shrink-0 min-h-[34px] rounded-full px-3 text-[13.5px] font-semibold text-ink-2
                           transition-colors duration-150 hover:bg-inset hover:text-ink active:bg-inset
                           disabled:opacity-50 [@media(pointer:coarse)]:min-h-[40px]"
              >
                Nudge
              </button>
              <button
                type="button"
                onClick={() => setDialogTarget(p)}
                title={`Write a message to ${p.full_name}`}
                aria-label={`Ping ${p.full_name}`}
                className="shrink-0 min-h-[34px] rounded-full border border-gold-fill px-3.5 text-[13.5px] font-bold text-brand
                           transition-colors duration-150 hover:bg-gold-soft hover:border-gold active:bg-gold-soft
                           [@media(pointer:coarse)]:min-h-[40px]"
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
          show(`Sent to ${dialogTarget?.full_name}`, true, 2500);
        }}
      />
    </>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

'use client';
import { useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { collapseRepeats, Run } from '../../lib/group';
import { invalidate, useApi, usePagedApi } from '../../lib/useApi';
import { QUICK_REPLIES } from '../../lib/replies';
import { Avatar, Empty, Icon, PageHeader, RepeatCount, Section, Segmented, Skeleton, StatusPill, UrgentPill } from '../../components/ui';

type Item = {
  id: number; ping_id: number; sender_id: number; message: string; priority: string;
  sender_name: string; group_name: string | null; sent_at: string;
  status: string; is_read: boolean;
  acknowledged_at: string | null; seen_at: string | null;
  reply: string;
};

const LIVE = ['op:ping', 'op:ping_status', 'op:ping_handled', 'op:inbox_changed'];

export default function NotificationsPage() { return <Guard><Inner /></Guard>; }

function Inner() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const url = filter === 'unread' ? '/api/notifications/?unread=1' : '/api/notifications/';
  const { items, count, hasMore, loadMore, loadingMore, reload } = usePagedApi<Item>(url, { refreshOn: LIVE });
  const { data: unread } = useApi<{ unread: number }>('/api/notifications/unread_count/', { refreshOn: LIVE });

  function refresh() {
    invalidate('/api/notifications/');
    reload();
    window.dispatchEvent(new Event('op:inbox_changed'));
  }
  async function markAllRead() {
    await apiFetch('/api/notifications/read-all/', { method: 'POST' });
    refresh();
  }
  // Acknowledging a collapsed row acknowledges every ping in it; a reply
  // goes with the latest one only.
  async function acknowledge(run: Run<Item>, reply?: string) {
    const open = run.items.filter(i => !i.acknowledged_at);
    await Promise.all(open.map(i =>
      apiFetch(`/api/pings/${i.ping_id}/acknowledge/`, {
        method: 'POST', body: JSON.stringify(reply && i === open[0] ? { reply } : {}),
      }).catch(() => null)));
    refresh();
  }

  const runs = collapseRepeats(items || [],
    i => [i.sender_id, i.group_name, i.message, i.priority].join('|'), i => i.sent_at);
  const urgentOpen = (r: Run<Item>) => r.latest.priority === 'URGENT' && r.items.some(i => !i.acknowledged_at);
  const pinned = runs.filter(urgentOpen);
  const rest = runs.filter(r => !urgentOpen(r));

  return (
    <div className="animate-slideIn">
      <PageHeader
        eyebrow="Inbox"
        title="Who's trying to reach you"
        lead={count === undefined ? 'Loading…'
          : `${count} ${filter === 'unread' ? 'unread' : 'in total'}` +
            (filter === 'all' && unread ? ` · ${unread.unread} unread` : '')}
        actions={<>
          <Segmented label="Show" value={filter} onChange={setFilter}
                     options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} />
          <button onClick={markAllRead} className="btn-ghost">
            <Icon name="check" size={16} /> Mark all read
          </button>
        </>}
      />

      {!items && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      )}

      {items && runs.length === 0 && (
        <Section>
          <Empty title={filter === 'unread' ? 'No unread pings' : 'Nothing yet'}
                 hint={filter === 'unread' ? 'You are all caught up.' : 'New pings land here immediately.'} />
        </Section>
      )}

      {pinned.length > 0 && (
        <section aria-labelledby="urgent-waiting" className="mb-6">
          <h2 id="urgent-waiting" className="mb-2 flex items-center gap-2 text-base font-bold text-rose-deep">
            <span className="h-2 w-2 rounded-full bg-live" aria-hidden /> Urgent, waiting for you
          </h2>
          <ul className="space-y-3">{pinned.map(r => <Row key={r.latest.id} run={r} onAck={acknowledge} />)}</ul>
        </section>
      )}

      {rest.length > 0 && (
        <>
          {pinned.length > 0 && <h2 className="mb-2 text-base font-bold text-ink">Everything else</h2>}
          <ul className="space-y-3">{rest.map(r => <Row key={r.latest.id} run={r} onAck={acknowledge} />)}</ul>
        </>
      )}

      {hasMore && (
        <div className="mt-5 text-center">
          <button onClick={loadMore} disabled={loadingMore} className="btn-secondary">
            {loadingMore ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ run, onAck }: { run: Run<Item>; onAck: (r: Run<Item>, reply?: string) => Promise<void> }) {
  const it = run.latest;
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);
  const act = async (reply?: string) => { setBusy(true); await onAck(run, reply); setBusy(false); setReplying(false); };
  const myReply = run.items.find(i => i.reply)?.reply;
  const urgent = it.priority === 'URGENT';
  const ack = run.items.every(i => !!i.acknowledged_at);
  const unread = run.items.some(i => !i.is_read);
  const when = (iso: string) =>
    new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const oldest = run.items[run.items.length - 1];
  return (
    <li className={
      'surface flex flex-col gap-3 p-4 sm:flex-row sm:items-start ' +
      (urgent && !ack ? 'border-l-4 border-l-live ' : unread ? 'border-l-4 border-l-gold-fill ' : '')
    }>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name={it.sender_name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] text-ink-2">
            <span className="font-bold text-ink">{it.sender_name}</span>
            {it.group_name && <span>→ {it.group_name}</span>}
            <time className="text-xs text-ink-3 tabular-nums sm:ml-auto">
              {run.count > 1 ? `${when(oldest.sent_at)} – ${new Date(it.sent_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : when(it.sent_at)}
            </time>
          </div>
          <div className="mt-1 break-words text-[15px] font-semibold text-ink">
            {it.message}{run.count > 1 && <RepeatCount n={run.count} />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {urgent && <UrgentPill />}
            <StatusPill status={ack ? 'ACKNOWLEDGED' : it.status} />
            {myReply && <span className="text-[13px] text-ink-2">You replied “{myReply}”</span>}
          </div>
          {replying && !ack && (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick replies">
              {QUICK_REPLIES.map(r => (
                <button key={r} type="button" disabled={busy} onClick={() => act(r)} className="chip-btn">{r}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {!ack && (
        <div className="flex gap-2 sm:flex-col sm:items-stretch">
          <button disabled={busy} onClick={() => act()} className="btn-secondary btn-sm flex-1 sm:flex-none">
            <Icon name="check" size={14} /> {busy ? 'Acknowledging…' : run.count > 1 ? `Acknowledge all ${run.count}` : 'Acknowledge'}
          </button>
          <button disabled={busy} onClick={() => setReplying(r => !r)} aria-expanded={replying}
                  className="btn-ghost btn-sm flex-1 sm:flex-none">
            <Icon name="reply" size={14} /> Reply
          </button>
        </div>
      )}
    </li>
  );
}

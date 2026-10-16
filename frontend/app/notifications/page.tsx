'use client';
import { useEffect, useState, useCallback } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { Avatar, Empty, Icon, PageHeader, Section, Segmented, Skeleton, StatusPill, UrgentPill } from '../../components/ui';

type Item = {
  id: number; ping_id: number; message: string; priority: string;
  sender_name: string; group_name: string | null; sent_at: string;
  status: string; is_read: boolean;
  acknowledged_at: string | null; seen_at: string | null;
};

export default function NotificationsPage() { return <Guard><Inner /></Guard>; }

function Inner() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const load = useCallback(async () => {
    const d = await apiFetch<any>('/api/notifications/');
    setItems(d.results || d);
  }, []);
  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('op:ping', h);
    window.addEventListener('op:ping_status', h);
    return () => {
      window.removeEventListener('op:ping', h);
      window.removeEventListener('op:ping_status', h);
    };
  }, [load]);

  async function markAllRead() {
    await apiFetch('/api/notifications/read-all/', { method: 'POST' });
    load();
  }
  async function acknowledge(pingId: number) {
    await apiFetch(`/api/pings/${pingId}/acknowledge/`, { method: 'POST' });
    load();
  }

  const list = (items || []).filter(it => filter === 'all' || !it.is_read);

  return (
    <div className="animate-slideIn">
      <PageHeader
        eyebrow="Inbox"
        title="Who's trying to reach you"
        lead={items ? `${items.length} total · ${items.filter(i => !i.is_read).length} unread` : 'Loading…'}
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

      {items && list.length === 0 && (
        <Section>
          <Empty title={filter === 'unread' ? 'No unread pings' : 'Nothing yet'}
                 hint={filter === 'unread' ? 'You are all caught up.' : 'New pings land here immediately.'} />
        </Section>
      )}

      <ul className="space-y-3">
        {list.map(it => {
          const urgent = it.priority === 'URGENT';
          const ack = !!it.acknowledged_at;
          return (
            <li key={it.id}
                className={
                  'surface flex flex-col gap-3 p-4 sm:flex-row sm:items-start ' +
                  (urgent ? 'border-l-4 border-l-live ' : !it.is_read ? 'border-l-4 border-l-gold-fill ' : '')
                }>
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Avatar name={it.sender_name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] text-ink-2">
                    <span className="font-bold text-ink">{it.sender_name}</span>
                    {it.group_name && <span>→ {it.group_name}</span>}
                    <time className="text-xs text-ink-3 tabular-nums sm:ml-auto">
                      {new Date(it.sent_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </time>
                  </div>
                  <div className="mt-1 break-words text-[15px] font-semibold text-ink">{it.message}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {urgent && <UrgentPill />}
                    <StatusPill status={ack ? 'ACKNOWLEDGED' : it.status} />
                  </div>
                </div>
              </div>
              {!ack && (
                <button onClick={() => acknowledge(it.ping_id)} className="btn-secondary btn-sm w-full sm:w-auto">
                  <Icon name="check" size={14} /> Acknowledge
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

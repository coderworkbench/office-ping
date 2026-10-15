'use client';
import { useEffect, useState, useCallback } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { Avatar, Empty, Icon, PageHeader, Section, Skeleton } from '../../components/ui';

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
        title={<>Who's trying to <span className="italic font-normal">reach you</span></>}
        lead={items ? `${items.length} total · ${items.filter(i => !i.is_read).length} unread` : 'Loading…'}
        actions={
          <div className="flex gap-2 items-center">
            <div className="inline-flex rounded-tool border border-hairline overflow-hidden text-sm">
              <button className={filterCls(filter === 'all')} onClick={() => setFilter('all')}>All</button>
              <button className={filterCls(filter === 'unread')} onClick={() => setFilter('unread')}>Unread</button>
            </div>
            <button onClick={markAllRead} className="btn-ghost">
              <Icon name="check" size={16} /> Mark all read
            </button>
          </div>
        }
      />

      {!items && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl2" />)}
        </div>
      )}

      {items && list.length === 0 && (
        <Section>
          <Empty title="Nothing yet" hint="New pings land here immediately." />
        </Section>
      )}

      <ul className="space-y-3">
        {list.map(it => {
          const urgent = it.priority === 'URGENT';
          const ack = !!it.acknowledged_at;
          return (
            <li key={it.id}
                className={
                  'surface p-4 flex items-start gap-3 transition ' +
                  (urgent ? 'border-ember/40 ' : '') +
                  (it.is_read ? '' : 'ring-1 ring-ink/5 ')
                }>
              <Avatar name={it.sender_name} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-inkmute">
                  <span className="font-medium text-ink">{it.sender_name}</span>
                  {it.group_name && <>· <span className="font-medium">{it.group_name}</span></>}
                  <time className="ml-auto font-mono">
                    {new Date(it.sent_at).toLocaleString()}
                  </time>
                </div>
                <div className="font-medium break-words mt-1 text-[15px]">{it.message}</div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {urgent && (
                    <span className="chip text-ember border-ember/30 bg-ember/5">
                      🚨 Urgent
                    </span>
                  )}
                  <StatusChip status={it.status} />
                  {ack && (
                    <span className="chip text-jade-500 border-jade/30 bg-jade-50">
                      <Icon name="check" size={12} /> Acknowledged
                    </span>
                  )}
                </div>
              </div>
              {!ack && (
                <button onClick={() => acknowledge(it.ping_id)} className="btn-dark">
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

function filterCls(active: boolean) {
  return 'px-3 py-1.5 text-sm ' +
    (active ? 'bg-ink text-white' : 'bg-card text-ink hover:bg-paper');
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    SENT:         'text-inkmute',
    DELIVERED:    'text-indigo',
    SEEN:         'text-indigo',
    ACKNOWLEDGED: 'text-jade-500',
  };
  return <span className={'chip ' + (map[status] || '')}>{status}</span>;
}

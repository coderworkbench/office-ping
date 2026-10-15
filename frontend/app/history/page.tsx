'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Avatar, Empty, Icon, Section, Skeleton } from '../../components/ui';

type Ping = {
  id: number; sender_name: string; recipient_name: string | null;
  group_name: string | null; message: string; priority: string;
  status: string; created_at: string;
  acknowledged_at: string | null;
  delivery_summary?: { total: number; delivered: number; seen: number; acknowledged: number };
};

export default function HistoryPage() { return <Guard><Inner /></Guard>; }

function Inner() {
  const { user } = useAuth();
  const [scope, setScope] = useState<'all' | 'sent' | 'received'>('sent');
  const [items, setItems] = useState<Ping[] | null>(null);

  useEffect(() => {
    setItems(null);
    apiFetch<any>(`/api/pings/?scope=${scope}`).then(d => setItems(d.results || d));
  }, [scope]);

  const canSeeAll = user && user.role !== 'MEMBER';

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ping History</h1>
          <p className="text-sm text-slate-500">
            {items ? `${items.length} pings` : 'Loading…'} · See status, delivery and acknowledgements.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-0.5 bg-white inline-flex text-sm">
          <TabBtn active={scope === 'sent'}     onClick={() => setScope('sent')}>My Sent</TabBtn>
          <TabBtn active={scope === 'received'} onClick={() => setScope('received')}>My Received</TabBtn>
          {canSeeAll && <TabBtn active={scope === 'all'} onClick={() => setScope('all')}>All</TabBtn>}
        </div>
      </div>

      {!items && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <Section>
          <Empty icon={<Icon name="clock" size={20} />} title="Nothing here yet"
                 hint="Send or receive a ping to populate history." />
        </Section>
      )}

      {items && items.length > 0 && (
        <Section>
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="py-2 px-3">When</th>
                  <th className="py-2 px-3">From</th>
                  <th className="py-2 px-3">To</th>
                  <th className="py-2 px-3">Message</th>
                  <th className="py-2 px-3">Priority</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map(p => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                      {new Date(p.created_at).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={p.sender_name} size={22} />
                        <span>{p.sender_name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      {p.recipient_name ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={p.recipient_name} size={22} />
                          <span>{p.recipient_name}</span>
                        </div>
                      ) : (
                        <span className="chip border-brand/20 text-brand bg-brand/5">
                          <Icon name="group" size={12} /> {p.group_name}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 max-w-sm">
                      <span className="line-clamp-1">{p.message}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={'chip ' + (p.priority === 'URGENT'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-slate-50 text-slate-600')}>
                        {p.priority === 'URGENT' ? '🚨 Urgent' : '🔔 Normal'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={'chip ' + statusChip(p.status)}>{p.status}</span>
                      {p.delivery_summary && p.group_name && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {p.delivery_summary.delivered}/{p.delivery_summary.total} delivered
                          {' · '}{p.delivery_summary.acknowledged} ack
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button onClick={onClick}
      className={'px-3 py-1 rounded-md transition ' +
        (active ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100')}>
      {children}
    </button>
  );
}

function statusChip(status: string) {
  switch (status) {
    case 'ACKNOWLEDGED': return 'text-green-700 border-green-200 bg-green-50';
    case 'SEEN':        return 'text-sky-700 border-sky-200 bg-sky-50';
    case 'DELIVERED':   return 'text-brand border-brand/20 bg-brand/5';
    default:            return 'text-slate-600';
  }
}

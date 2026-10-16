'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Avatar, Empty, Icon, PageHeader, Section, Segmented, Skeleton, StatusPill, UrgentPill } from '../../components/ui';

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

  const groupProgress = (p: Ping) => p.delivery_summary && p.group_name
    ? `${p.delivery_summary.delivered}/${p.delivery_summary.total} delivered · ${p.delivery_summary.acknowledged} ack`
    : null;
  const when = (iso: string) =>
    new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const To = ({ p }: { p: Ping }) => p.recipient_name ? (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={p.recipient_name} size={22} />
      <span className="truncate">{p.recipient_name}</span>
    </span>
  ) : (
    <span className="chip bg-brand-soft text-brand">
      <Icon name="group" size={12} /> {p.group_name}
    </span>
  );

  return (
    <div className="animate-fadeIn">
      <PageHeader
        eyebrow="History"
        title="Ping history"
        lead={<>{items ? `${items.length} pings` : 'Loading…'} · See status, delivery and acknowledgements.</>}
        actions={
          <Segmented label="Show" value={scope} onChange={setScope}
            options={[
              { value: 'sent', label: 'Sent' },
              { value: 'received', label: 'Received' },
              ...(canSeeAll ? [{ value: 'all' as const, label: 'All' }] : []),
            ]} />
        }
      />

      {!items && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <Section>
          <Empty icon={<Icon name="clock" size={22} />} title="Nothing here yet"
                 hint="Send or receive a ping to populate history." />
        </Section>
      )}

      {items && items.length > 0 && (<>
        {/* Phones: a stack of cards (§20 — never a sideways-scrolling table). */}
        <ul className="space-y-3 md:hidden">
          {items.map(p => (
            <li key={p.id} className="surface p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-ink">
                  <Avatar name={p.sender_name} size={22} />
                  <span className="truncate">{p.sender_name}</span>
                </span>
                <span className="text-ink-3" aria-hidden>→</span>
                <span className="min-w-0 font-semibold text-ink"><To p={p} /></span>
              </div>
              <p className="mt-2 break-words font-semibold text-ink">{p.message}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.priority === 'URGENT' && <UrgentPill />}
                <StatusPill status={p.status} />
                <time className="ml-auto text-xs text-ink-3 tabular-nums">{when(p.created_at)}</time>
              </div>
              {groupProgress(p) && <div className="mt-1.5 text-xs text-ink-3">{groupProgress(p)}</div>}
            </li>
          ))}
        </ul>

        {/* Tablet and up: a table inside a bordered surface. */}
        <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-sm md:block">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-left">
                <th className="th px-4 py-3">When</th>
                <th className="th px-4 py-3">From → To</th>
                <th className="th px-4 py-3">Message</th>
                <th className="th px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-2">
              {items.map(p => (
                <tr key={p.id} className="align-top hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-3 text-ink-2 tabular-nums">{when(p.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 flex-col gap-1 text-ink">
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={p.sender_name} size={22} />
                        <span className="truncate font-semibold">{p.sender_name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 pl-1 text-ink-2">
                        <span className="text-ink-3" aria-hidden>↳</span> <To p={p} />
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink">
                    <span className="line-clamp-2">{p.message}</span>
                    {p.priority === 'URGENT' && <span className="mt-1 block"><UrgentPill /></span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={p.status} />
                    {groupProgress(p) && <div className="mt-1 whitespace-nowrap text-xs text-ink-3">{groupProgress(p)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

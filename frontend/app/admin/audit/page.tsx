'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../../components/Guard';
import { apiFetch } from '../../../lib/api';
import { Avatar, Empty, Icon, PageHeader, Section, Skeleton } from '../../../components/ui';

type Log = { id: number; timestamp: string; actor_name: string | null;
  action: string; target: string; ip_address: string | null; metadata: any };

export default function AuditPage() {
  return <Guard requireRole={['ADMIN']}><Inner /></Guard>;
}

function Inner() {
  const [items, setItems] = useState<Log[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    setItems(null);
    const url = `/api/audit-logs/${q ? `?search=${encodeURIComponent(q)}` : ''}`;
    apiFetch<any>(url).then(d => setItems(d.results || d));
  }, [q]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const ActionPill = ({ action }: { action: string }) => (
    <span className={'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold tracking-wide ' + actionTone(action)}>
      {action}
    </span>
  );

  return (
    <div className="animate-fadeIn">
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        lead={<>{items ? `${items.length} events` : 'Loading…'} · Security-relevant actions, with who did them and from where.</>}
        actions={
          <div className="relative w-full sm:w-80">
            <Icon name="search" size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search the audit log"
                   placeholder="Search action, person, target, IP…"
                   className="input pl-10" />
          </div>
        }
      />

      {!items && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <Section>
          <Empty icon={<Icon name="shield" size={22} />} title="No events match" hint="Try a different search." />
        </Section>
      )}

      {items && items.length > 0 && (<>
        {/* Phones: cards (§20) */}
        <ul className="surface divide-y divide-line-2 px-4 md:hidden">
          {items.map(l => (
            <li key={l.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ActionPill action={l.action} />
                <time className="text-xs text-ink-3 tabular-nums">{when(l.timestamp)}</time>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                {l.actor_name ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                    <Avatar name={l.actor_name} size={20} />{l.actor_name}
                  </span>
                ) : <span className="text-ink-3">System</span>}
                {l.target && <span>· target {l.target}</span>}
                {l.ip_address && <span className="tabular-nums">· {l.ip_address}</span>}
              </div>
            </li>
          ))}
        </ul>

        {/* Tablet and up: table */}
        <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-sm md:block">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr className="text-left">
                <th className="th px-4 py-3">When</th>
                <th className="th px-4 py-3">Who</th>
                <th className="th px-4 py-3">Action</th>
                <th className="th px-4 py-3">Target</th>
                <th className="th px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-2">
              {items.map(l => (
                <tr key={l.id} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-3 text-ink-2 tabular-nums">{when(l.timestamp)}</td>
                  <td className="px-4 py-3">
                    {l.actor_name ? (
                      <span className="inline-flex items-center gap-2 font-semibold text-ink">
                        <Avatar name={l.actor_name} size={22} />{l.actor_name}
                      </span>
                    ) : <span className="text-ink-3">—</span>}
                  </td>
                  <td className="px-4 py-3"><ActionPill action={l.action} /></td>
                  <td className="px-4 py-3 text-ink-2 tabular-nums">{l.target || '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-3 tabular-nums">{l.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  );
}

// Sunbeam pills only; password events and blocked pings stand out.
function actionTone(action: string) {
  if (action === 'PING_BLOCKED')                   return 'bg-rose-soft text-rose-deep';
  if (action.includes('PASSWORD'))                 return 'bg-warn-soft text-warn';
  if (action.startsWith('PING_'))                  return 'bg-brand-soft text-brand';
  if (action.startsWith('USER_'))                  return 'bg-gold-soft text-brand';
  if (action.startsWith('GROUP_') || action.startsWith('MEMBER_') || action.startsWith('TEMPLATE_'))
                                                   return 'bg-inset text-ink-2';
  return 'bg-surface-2 text-ink-2 ring-1 ring-line';
}

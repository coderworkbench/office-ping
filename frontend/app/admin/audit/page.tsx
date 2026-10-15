'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../../components/Guard';
import { apiFetch } from '../../../lib/api';
import { Avatar, Empty, Icon, Section, Skeleton } from '../../../components/ui';

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

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit logs</h1>
          <p className="text-sm text-slate-500">
            {items ? `${items.length} events` : 'Loading…'} · Every security-relevant action is recorded.
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Icon name="search" size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
                 placeholder="Search action, actor, target, IP…"
                 className="input pl-9" />
        </div>
      </div>

      {!items && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <Section>
          <Empty icon={<Icon name="shield" size={20} />} title="No events match" />
        </Section>
      )}

      {items && items.length > 0 && (
        <Section>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="py-2 px-3">When</th>
                  <th className="py-2 px-3">Actor</th>
                  <th className="py-2 px-3">Action</th>
                  <th className="py-2 px-3">Target</th>
                  <th className="py-2 px-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                      {new Date(l.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 px-3">
                      {l.actor_name ? (
                        <div className="flex items-center gap-2">
                          <Avatar name={l.actor_name} size={22} />
                          <span>{l.actor_name}</span>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-2 px-3">
                      <span className={'chip font-mono text-[11px] ' + actionTone(l.action)}>
                        {l.action}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{l.target || '—'}</td>
                    <td className="py-2 px-3 text-slate-500 font-mono text-xs">
                      {l.ip_address || '—'}
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

function actionTone(action: string) {
  if (action === 'LOGIN' || action === 'LOGOUT') return 'bg-slate-50 text-slate-700';
  if (action.startsWith('PING_'))                 return 'bg-brand/5 text-brand border-brand/20';
  if (action.startsWith('USER_'))                 return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (action.startsWith('GROUP_') || action.startsWith('MEMBER_'))
                                                   return 'bg-sky-50 text-sky-700 border-sky-200';
  if (action.startsWith('TEMPLATE_'))              return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (action.includes('PASSWORD'))                 return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600';
}

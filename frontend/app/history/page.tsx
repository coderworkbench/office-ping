'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { ApiError, getAccessToken } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { collapseRepeats, Run } from '../../lib/group';
import { listOf, useApi, usePagedApi } from '../../lib/useApi';
import { OfficeStats, type Dash } from '../../components/OfficeStats';
import { Avatar, Empty, Icon, PageHeader, RepeatCount, Section, Segmented, Skeleton, StatusPill, UrgentPill } from '../../components/ui';

type Ping = {
  id: number; sender: number; recipient: number | null;
  sender_name: string; recipient_name: string | null;
  group_name: string | null; message: string; priority: string;
  status: string; created_at: string;
  acknowledged_at: string | null;
  delivery_summary?: { total: number; delivered: number; seen: number; acknowledged: number };
  deliveries?: { recipient_name: string; reply: string }[];
};

type Filters = {
  scope: 'all' | 'sent' | 'received';
  search: string; person: string; state: string; urgent: boolean; since: string; until: string;
};
const EMPTY: Omit<Filters, 'scope'> = { search: '', person: '', state: '', urgent: false, since: '', until: '' };

// The "Status" dropdown: "awaiting" is the dashboard's Awaiting ack card.
const STATES = [
  { value: '',             label: 'Any status' },
  { value: 'awaiting',     label: 'Awaiting ack (last 24 h)' },
  { value: 'SENT',         label: 'Not delivered yet' },
  { value: 'DELIVERED',    label: 'Delivered' },
  { value: 'SEEN',         label: 'Seen' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
];

export default function HistoryPage() { return <Guard><Inner /></Guard>; }

function Inner() {
  const { user } = useAuth();
  const canSeeAll = !!user && user.role !== 'MEMBER';
  const isAdmin = user?.role === 'ADMIN';
  const [f, setF] = useState<Filters>({ scope: 'sent', ...EMPTY });
  const [search, setSearch] = useState('');      // typed text, applied after a pause
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // Filters live in the address (?scope=all&awaiting=1 …), so dashboard cards
  // and bookmarks open the right list.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const scope = (q.get('scope') as Filters['scope']) || 'sent';
    setF({
      scope: ['all', 'sent', 'received'].includes(scope) ? scope : 'sent',
      search: q.get('search') || '', person: q.get('person') || '',
      state: q.get('awaiting') === '1' ? 'awaiting' : q.get('status') || '',
      urgent: q.get('priority') === 'URGENT', since: q.get('since') || '', until: q.get('until') || '',
    });
    setSearch(q.get('search') || '');
    setReady(true);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setF(prev => prev.search === search ? prev : { ...prev, search }), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = toQuery(f);
  useEffect(() => {
    if (ready) window.history.replaceState(null, '', query === 'scope=sent' ? '/history' : `/history?${query}`);
  }, [ready, query]);

  const { items, count, hasMore, loadMore, loadingMore } =
    usePagedApi<Ping>(ready ? `/api/pings/?${query}` : null, { refreshOn: ['op:ping', 'op:ping_status', 'op:sent'] });
  // On a phone the Overview is just the composer, so the office numbers live here.
  const phone = useIsPhone();
  const office = useApi<Dash>(canSeeAll && phone ? '/api/dashboard/' : null, { intervalMs: 30000 });
  const people = listOf<{ id: number; full_name: string }>(useApi('/api/users/').data)
    .filter(p => p.id !== user?.id);

  const filtered = query !== `scope=${f.scope}`;
  const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));
  const runs = collapseRepeats(items || [],
    p => [p.sender, p.recipient, p.group_name, p.message, p.priority].join('|'), p => p.created_at);

  async function exportCsv() {
    setExporting('Preparing…');
    try {
      const r = await fetch(`/api/pings/export/?${query}`,
        { headers: { Authorization: `Bearer ${getAccessToken()}` } });
      if (!r.ok) throw new ApiError(r.status, await r.text());
      const blob = await r.blob();
      const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'office-ping-history.csv';
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      a.click();
      URL.revokeObjectURL(a.href);
      setExporting(null);
    } catch {
      setExporting('Export failed. Try again.');
      setTimeout(() => setExporting(null), 4000);
    }
  }

  return (
    <div className="animate-fadeIn">
      <PageHeader
        eyebrow="History"
        title="Ping history"
        lead={count === undefined ? 'Loading…'
          : `${count} ${count === 1 ? 'ping' : 'pings'}${filtered ? (count === 1 ? ' matches' : ' match') : ''} · status, delivery and acknowledgements`}
        actions={<>
          <Segmented label="Show" value={f.scope} onChange={scope => set({ scope })}
            options={[
              { value: 'sent', label: 'Sent' },
              { value: 'received', label: 'Received' },
              ...(canSeeAll ? [{ value: 'all' as const, label: 'All' }] : []),
            ]} />
          {isAdmin && (
            <button onClick={exportCsv} disabled={!!exporting} className="btn-secondary"
                    title="Download every ping matching these filters as a spreadsheet">
              <Icon name="download" size={16} /> {exporting === 'Preparing…' ? 'Preparing…' : 'Export CSV'}
            </button>
          )}
        </>}
      />
      {exporting && exporting !== 'Preparing…' && <p role="alert" className="mb-3 text-sm text-rose">{exporting}</p>}

      {canSeeAll && phone && (
        <section aria-labelledby="office-now" className="mb-5 sm:hidden">
          <h2 id="office-now" className="mb-2 text-base font-bold text-ink">The office right now</h2>
          <OfficeStats dash={office.data} error={office.error} compact />
        </section>
      )}

      {/* Filters */}
      <div className="surface mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="relative block sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Search</span>
          <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-10"
                 placeholder="Search messages or names…" />
        </label>
        <label className="block">
          <span className="sr-only">Person</span>
          <select value={f.person} onChange={e => set({ person: e.target.value })} className="input">
            <option value="">Anyone</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Status</span>
          <select value={f.state} onChange={e => set({ state: e.target.value })} className="input">
            {STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-3">
          <label className="inline-flex items-center gap-2 text-sm text-ink-2">
            From <input type="date" value={f.since} max={f.until || undefined}
                        onChange={e => set({ since: e.target.value })} className="input !w-auto !py-1.5" />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-ink-2">
            to <input type="date" value={f.until} min={f.since || undefined}
                      onChange={e => set({ until: e.target.value })} className="input !w-auto !py-1.5" />
          </label>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={f.urgent} onChange={e => set({ urgent: e.target.checked })}
                   className="h-4 w-4 accent-[rgb(var(--live))]" />
            Urgent only
          </label>
          {filtered && (
            <button onClick={() => { setF(prev => ({ scope: prev.scope, ...EMPTY })); setSearch(''); }}
                    className="btn-ghost btn-sm ml-auto">Clear filters</button>
          )}
        </div>
      </div>

      {!items && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <Section>
          <Empty icon={<Icon name="history" size={22} />}
                 title={filtered ? 'No pings match these filters' : 'Nothing here yet'}
                 hint={filtered ? 'Try fewer filters, or another date range.' : 'Send or receive a ping to populate history.'} />
        </Section>
      )}

      {items && items.length > 0 && <List runs={runs} />}

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

function toQuery(f: Filters) {
  const q = new URLSearchParams({ scope: f.scope });
  if (f.search.trim()) q.set('search', f.search.trim());
  if (f.person) q.set('person', f.person);
  if (f.state === 'awaiting') q.set('awaiting', '1');
  else if (f.state) q.set('status', f.state);
  if (f.urgent) q.set('priority', 'URGENT');
  if (f.since) q.set('since', f.since);
  if (f.until) q.set('until', f.until);
  return q.toString();
}

function List({ runs }: { runs: Run<Ping>[] }) {
  const groupProgress = (p: Ping) => p.delivery_summary && p.group_name
    ? `${p.delivery_summary.delivered}/${p.delivery_summary.total} delivered · ${p.delivery_summary.acknowledged} ack`
    : null;
  const when = (iso: string) =>
    new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  // Quick replies: "↩ On my way" for one person, "↩ 2 replies" for a group.
  const Replies = ({ r }: { r: Run<Ping> }) => {
    const rs = r.items.flatMap(p => (p.deliveries || []).filter(d => d.reply));
    if (!rs.length) return null;
    const one = rs.length === 1 && !r.latest.group_name;
    return (
      <div className="mt-1 text-[13px] text-ink-2" title={rs.map(d => `${d.recipient_name}: ${d.reply}`).join('\n')}>
        ↩ {one ? <>“{rs[0].reply}”</> : <>{rs.length} replies: {rs.slice(0, 2).map(d => `${d.recipient_name.split(' ')[0]} “${d.reply}”`).join(', ')}{rs.length > 2 ? '…' : ''}</>}
      </div>
    );
  };
  // A collapsed run is "Acknowledged" only when every ping in it is.
  const status = (r: Run<Ping>) => r.items.find(p => p.status !== 'ACKNOWLEDGED')?.status || 'ACKNOWLEDGED';
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

  return (<>
    {/* Phones: a stack of cards (§20 — never a sideways-scrolling table). */}
    <ul className="space-y-3 md:hidden">
      {runs.map(r => { const p = r.latest; return (
        <li key={p.id} className="surface p-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-ink">
              <Avatar name={p.sender_name} size={22} />
              <span className="truncate">{p.sender_name}</span>
            </span>
            <span className="text-ink-3" aria-hidden>→</span>
            <span className="min-w-0 font-semibold text-ink"><To p={p} /></span>
          </div>
          <p className="mt-2 break-words font-semibold text-ink">{p.message}{r.count > 1 && <RepeatCount n={r.count} />}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {p.priority === 'URGENT' && <UrgentPill />}
            <StatusPill status={status(r)} />
            <time className="ml-auto text-xs text-ink-3 tabular-nums">{when(p.created_at)}</time>
          </div>
          {groupProgress(p) && <div className="mt-1.5 text-xs text-ink-2">{groupProgress(p)}</div>}
          <Replies r={r} />
        </li>
      ); })}
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
          {runs.map(r => { const p = r.latest; return (
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
                <span className="line-clamp-2">{p.message}{r.count > 1 && <RepeatCount n={r.count} />}</span>
                {p.priority === 'URGENT' && <span className="mt-1 block"><UrgentPill /></span>}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={status(r)} />
                {groupProgress(p) && <div className="mt-1 whitespace-nowrap text-xs text-ink-2">{groupProgress(p)}</div>}
                <Replies r={r} />
              </td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
  </>);
}

function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

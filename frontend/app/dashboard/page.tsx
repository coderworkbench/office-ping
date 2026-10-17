'use client';
import Link from 'next/link';
import { Guard } from '../../components/Guard';
import { PingComposer } from '../../components/PingComposer';
import { RecentRecipients } from '../../components/RecentRecipients';
import { useLiveStatus } from '../../components/NotificationsRuntime';
import { MobileHome } from '../../components/MobileHome';
import { OfficeStats, type Dash, type Recent } from '../../components/OfficeStats';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import { collapseRepeats } from '../../lib/group';
import { Avatar, RepeatCount, Section, StatusPill, UrgentPill } from '../../components/ui';


export default function DashboardPage() {
  return (
    <Guard phoneHome>
      {/* Phones get a one-screen composer; the stats live under History there. */}
      <div className="sm:hidden"><MobileHome /></div>
      <div className="hidden sm:block"><Inner /></div>
    </Guard>
  );
}

function Inner() {
  const { user } = useAuth();
  const elevated = !!user && user.role !== 'MEMBER';
  const { data: dash, error } = useApi<Dash>(elevated ? '/api/dashboard/' : null,
    { refreshOn: ['op:ping', 'op:ping_status'], intervalMs: 30000 });

  const firstName = user?.first_name || user?.username || '';

  return (
    <div className="space-y-8 animate-slideIn">
      {/* HERO — compact, so the office stats sit beside the composer on a laptop. */}
      <section className="hero-aura relative rounded-2xl border border-line p-5 shadow-sm sm:p-7">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="eyebrow">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <LiveBadge />
        </div>
        <h1 className="display text-[26px] text-ink sm:text-[30px] lg:text-[34px] lg:leading-[1.1]">
          Who do you need, {firstName}?
        </h1>

        <div className={'mt-5 grid gap-6 border-t border-line pt-5 ' +
          (elevated ? 'lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8' : '')}>
          <div className="min-w-0">
            <RecentRecipients />
            <PingComposer homeOnly />
          </div>
          {elevated && (
            <aside aria-labelledby="office-now" className="min-w-0 lg:border-l lg:border-line lg:pl-8">
              <h2 id="office-now" className="mb-3 text-base font-bold text-ink">The office right now</h2>
              <OfficeStats dash={dash} error={error} />
            </aside>
          )}
        </div>
      </section>

      {elevated && dash && dash.recent_pings.length > 0 && <RecentPings pings={dash.recent_pings} />}
    </div>
  );
}

function RecentPings({ pings }: { pings: Recent[] }) {
  const runs = collapseRepeats(pings,
    p => [p.sender, p.recipient, p.group, p.message, p.priority].join('|'), p => p.created_at).slice(0, 10);
  // Urgent pings nobody has acknowledged yet go first.
  const waiting = (r: (typeof runs)[number]) =>
    r.latest.priority === 'URGENT' && r.items.some(p => p.status !== 'ACKNOWLEDGED');
  const ordered = [...runs.filter(waiting), ...runs.filter(r => !waiting(r))];

  return (
    <Section title="Recent pings" surface
             actions={<Link href="/history?scope=all" className="text-sm font-semibold text-brand hover:underline">All history</Link>}>
      <ul className="divide-y divide-line-2">
        {ordered.map(r => {
          const p = r.latest;
          const urgentWaiting = waiting(r);
          const status = r.items.every(x => x.status === 'ACKNOWLEDGED') ? 'ACKNOWLEDGED'
            : r.items.find(x => x.status !== 'ACKNOWLEDGED')!.status;
          return (
            <li key={p.id} className={'flex items-center gap-3 py-3 ' + (urgentWaiting ? '-mx-2 rounded-xl bg-live-soft/50 px-2' : '')}>
              <Avatar name={p.sender} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">
                  <span className="font-semibold">{p.sender}</span>
                  <span className="text-ink-3"> → </span>
                  <span className="font-semibold">{p.recipient || p.group}</span>
                </div>
                <div className="truncate text-[13px] text-ink-2">
                  {p.message}
                  {r.count > 1 && <RepeatCount n={r.count} />}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                {p.priority === 'URGENT' && <UrgentPill />}
                <StatusPill status={status} />
                <time className="text-xs text-ink-3 tabular-nums">
                  {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function LiveBadge() {
  const status = useLiveStatus();
  const live = status === 'open';
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-1 text-xs font-semibold text-ink-2"
         title={live ? 'Connected: pings arrive the moment they are sent' : 'Reconnecting to the server…'}>
      <span className={'h-1.5 w-1.5 rounded-full ' + (live ? 'bg-success' : 'bg-warn animate-pulse')} aria-hidden />
      {live ? 'Live' : 'Reconnecting…'}
    </div>
  );
}

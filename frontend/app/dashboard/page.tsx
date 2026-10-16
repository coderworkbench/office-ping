'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { PingComposer } from '../../components/PingComposer';
import { RecentRecipients } from '../../components/RecentRecipients';
import { useAuth } from '../../lib/auth';
import { apiFetch } from '../../lib/api';
import { Avatar, Icon, PageHeader, Section, Skeleton } from '../../components/ui';

type Dash = {
  total_employees: number; online_employees: number; offline_employees: number;
  total_groups: number; pings_today: number; pending_acknowledgements: number;
  recent_pings: any[];
};

export default function DashboardPage() { return <Guard><Inner /></Guard>; }

function Inner() {
  const { user } = useAuth();
  const elevated = user && user.role !== 'MEMBER';
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!elevated) { setLoading(false); return; }
    apiFetch<Dash>('/api/dashboard/')
      .then(d => { setDash(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [elevated]);

  const firstName = user?.first_name || user?.username || '';

  return (
    <div className="space-y-8 animate-slideIn lg:space-y-12">
      {/* HERO — the composer IS the headline. Gold as light (§2.6), never a gold fill. */}
      <section className="hero-aura relative rounded-2xl border border-line p-5 shadow-sm sm:p-8 lg:p-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="eyebrow">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
            Live on LAN
          </div>
        </div>

        <h1 className="display max-w-2xl text-[30px] text-ink sm:text-[40px] lg:text-[48px] lg:leading-[1.05]">
          Who do you need, {firstName}?
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-ink-2 sm:text-lg">
          Send a tap on the shoulder — delivered to their desk, their phone, and their inbox at once.
        </p>

        <div className="mt-6 border-t border-line pt-5 sm:mt-7 sm:pt-6">
          <RecentRecipients />
          <PingComposer />
        </div>
      </section>

      {/* STATS — secondary row, numeric and quiet */}
      {elevated && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">The office right now</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {loading && Array.from({ length: 6 }).map((_, i) =>
              <Skeleton key={i} className="h-20 rounded-2xl" />
            )}
            {!loading && dash && <>
              <Stat label="Employees"    value={dash.total_employees} />
              <Stat label="Online now"   value={dash.online_employees} tone="live" />
              <Stat label="Offline"      value={dash.offline_employees} tone="muted" />
              <Stat label="Groups"       value={dash.total_groups} />
              <Stat label="Pings today"  value={dash.pings_today} />
              <Stat label="Awaiting ack" value={dash.pending_acknowledgements} tone="warn" />
            </>}
          </div>
        </section>
      )}

      {/* RECENT */}
      {elevated && dash && dash.recent_pings?.length > 0 && (
        <Section title="Recent pings" surface>
          <ul className="divide-y divide-line-2">
            {dash.recent_pings.map((p: any) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <Avatar name={p.sender} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">
                    <span className="font-semibold">{p.sender}</span>
                    <span className="text-ink-3"> → </span>
                    <span className="font-semibold">{p.recipient || p.group}</span>
                  </div>
                  <div className="truncate text-[13px] text-ink-2">{p.message}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                  <StatusDot status={p.status} />
                  <time className="text-xs text-ink-3 tabular-nums">
                  {new Date(p.created_at).toLocaleTimeString([],
                    { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: {
  label: string; value: number; tone?: 'live' | 'warn' | 'muted';
}) {
  const accent =
    tone === 'live'  ? 'text-success'
    : tone === 'warn' ? 'text-warn'
    : tone === 'muted' ? 'text-ink-2' : 'text-ink';
  return (
    <div className="surface p-4">
      <div className="text-[12px] font-semibold text-ink-2">{label}</div>
      <div className={'mt-1 text-2xl font-extrabold tabular-nums ' + accent}>{value}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    SENT:         'bg-ink-3/60',
    DELIVERED:    'bg-brand',
    SEEN:         'bg-brand',
    ACKNOWLEDGED: 'bg-success',
  };
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">
      <span className={'h-1.5 w-1.5 rounded-full ' + (map[status] || 'bg-ink-3/60')} />
      {status}
    </span>
  );
}

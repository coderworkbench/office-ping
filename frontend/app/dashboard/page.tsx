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
    <div className="space-y-10 animate-slideIn">
      {/* HERO — the composer IS the headline */}
      <section className="surface p-6 lg:p-10 relative overflow-hidden">
        {/* subtle ember tick in the corner */}
        <div className="absolute top-6 right-6 flex items-center gap-2 eyebrow">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          <span>Live on LAN</span>
        </div>

        <div className="eyebrow mb-4">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>

        <h1 className="display text-[clamp(2rem,4.6vw,3.4rem)] font-medium leading-[1.02] max-w-2xl">
          Who do you need,
          <br />
          <span className="italic font-normal">{firstName}?</span>
        </h1>
        <p className="mt-3 text-inkmute max-w-xl">
          Send a tap on the shoulder — delivered to their desk, their phone, and their inbox at once.
        </p>

        <div className="mt-7 border-t border-hairline pt-6">
          <RecentRecipients />
          <PingComposer />
        </div>
      </section>

      {/* STATS — secondary row, numeric and quiet */}
      {elevated && (
        <section>
          <div className="eyebrow mb-3">The office right now</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {loading && Array.from({ length: 6 }).map((_, i) =>
              <Skeleton key={i} className="h-20 rounded-xl2" />
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
          <ul className="divide-y divide-hairline">
            {dash.recent_pings.map((p: any) => (
              <li key={p.id} className="py-3 flex items-center gap-3">
                <Avatar name={p.sender} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-medium">{p.sender}</span>
                    <span className="text-inkmute"> → </span>
                    <span className="font-medium">{p.recipient || p.group}</span>
                  </div>
                  <div className="text-xs text-inkmute truncate">{p.message}</div>
                </div>
                <StatusDot status={p.status} />
                <time className="text-xs text-inkmute font-mono">
                  {new Date(p.created_at).toLocaleTimeString([],
                    { hour: '2-digit', minute: '2-digit' })}
                </time>
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
    tone === 'live'  ? 'text-jade-500'
    : tone === 'warn' ? 'text-ember'
    : tone === 'muted' ? 'text-inkmute' : 'text-ink';
  return (
    <div className="surface p-4">
      <div className="eyebrow">{label}</div>
      <div className={'display text-3xl font-medium mt-1 ' + accent}>{value}</div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    SENT:         'bg-inkmute/40',
    DELIVERED:    'bg-indigo',
    SEEN:         'bg-indigo',
    ACKNOWLEDGED: 'bg-jade-500',
  };
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-inkmute uppercase tracking-wider">
      <span className={'h-1.5 w-1.5 rounded-full ' + (map[status] || 'bg-inkmute/40')} />
      {status}
    </span>
  );
}

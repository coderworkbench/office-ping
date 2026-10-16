'use client';

// "The office right now" cards for HR and admins. Each card opens the
// matching list. Shown beside the composer on the Overview, and at the top of
// History on a phone.

import Link from 'next/link';
import { Skeleton } from './ui';

export type Recent = {
  id: number; sender: string; recipient: string | null; group: string | null;
  message: string; priority: string; status: string; created_at: string;
};
export type Dash = {
  total_employees: number; online_employees: number; offline_employees: number;
  total_groups: number; pings_today: number; pending_acknowledgements: number;
  recent_pings: Recent[];
};

export function OfficeStats({ dash, error, compact = false }: { dash?: Dash; error?: unknown; compact?: boolean }) {
  return (
    <div className={'grid gap-2.5 ' + (compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-2')}>
      {!dash && !error && Array.from({ length: 6 }).map((_, i) =>
        <Skeleton key={i} className={(compact ? 'h-[62px]' : 'h-[74px]') + ' rounded-xl'} />)}
      {!!error && !dash && <p className="col-span-full text-sm text-ink-2">Couldn’t load the numbers.</p>}
      {dash && <>
        <Stat compact={compact} href="/people" label="Teammates" value={dash.total_employees} />
        <Stat compact={compact} href="/people" label="Online now" value={dash.online_employees} tone="live" />
        <Stat compact={compact} href="/people" label="Offline" value={dash.offline_employees} tone="muted" />
        <Stat compact={compact} href="/groups" label="Groups" value={dash.total_groups} />
        <Stat compact={compact} href={`/history?scope=all&since=${localDate()}`} label="Pings today"
              hint="whole office" value={dash.pings_today} />
        <Stat compact={compact} href="/history?scope=all&awaiting=1" label="Awaiting ack"
              hint="last 24 h" value={dash.pending_acknowledgements} tone="warn" />
      </>}
    </div>
  );
}

function Stat({ label, value, hint, tone, href, compact }: {
  label: string; value: number; hint?: string; tone?: 'live' | 'warn' | 'muted'; href: string; compact?: boolean;
}) {
  const accent =
    tone === 'live'  ? 'text-success'
    : tone === 'warn' ? 'text-warn'
    : tone === 'muted' ? 'text-ink-2' : 'text-ink';
  return (
    <Link href={href}
          className={'group rounded-xl border border-line bg-surface shadow-sm transition-colors duration-150 hover:border-gold-fill/60 ' + (compact ? 'p-2.5' : 'p-3')}>
      <div className="text-[13px] font-semibold leading-tight text-ink-2">
        {label}
        {hint && <span className="block text-xs font-normal text-ink-3">{hint}</span>}
      </div>
      <div className={'mt-1 font-extrabold tabular-nums ' + (compact ? 'text-xl' : 'text-2xl') + ' ' + accent}>{value}</div>
    </Link>
  );
}

// YYYY-MM-DD in the browser's time zone (the office's).
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

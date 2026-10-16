'use client';

import { ReactNode } from 'react';

// ---------- Page header (editorial) ----------
export function PageHeader({ eyebrow, title, lead, actions }: {
  eyebrow?: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-end gap-6 flex-wrap">
      <div className="flex-1 min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="display text-[clamp(2rem,4vw,2.75rem)] font-medium">
          {title}
        </h1>
        {lead && <p className="mt-2 text-inkmute max-w-2xl">{lead}</p>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </header>
  );
}

// ---------- Section ----------
export function Section({ title, actions, children, className = '', surface = true }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode;
  className?: string; surface?: boolean;
}) {
  const inner = (
    <>
      {(title || actions) && (
        <header className="flex items-center justify-between mb-4">
          {title && <h2 className="display text-xl font-medium">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </>
  );
  return surface
    ? <section className={'surface p-5 lg:p-6 animate-fadeIn ' + className}>{inner}</section>
    : <section className={'animate-fadeIn ' + className}>{inner}</section>;
}

// ---------- Avatar ----------
export function Avatar({ name, size = 36, online }: { name: string; size?: number; online?: boolean }) {
  const initials = name
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '').join('') || '?';
  // Warm, muted palette — low saturation so they live well on paper
  const palette = ['#C9BFA7', '#D7B88B', '#B7C2A3', '#A7BCCB', '#C7A7BF', '#E0B4A1', '#B8A79A'];
  const bg = palette[Math.abs(hash(name)) % palette.length];
  const fg = '#0F172A';
  return (
    <span className="relative inline-flex items-center justify-center shrink-0 select-none font-medium"
      style={{ width: size, height: size, borderRadius: size / 2,
               background: bg, color: fg, fontSize: size * 0.38 }}
      aria-hidden>
      {initials}
      {online !== undefined && <PresenceDot online={online} />}
    </span>
  );
}

export function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      aria-label={online ? 'Online' : 'Offline'}
      className={
        'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card ' +
        (online ? 'bg-jade animate-pulseDot' : 'bg-inkmute/50')
      }
    />
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

// ---------- Icon (inline SVGs) ----------
const paths: Record<string, ReactNode> = {
  bell:   <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0" />,
  users:  <>
    <circle cx="9" cy="8" r="4" />
    <path d="M17 11a3 3 0 1 0 0-6" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <path d="M17 14c2.8 0 5 2.2 5 5" />
  </>,
  group:  <>
    <circle cx="7" cy="10" r="3" />
    <circle cx="17" cy="10" r="3" />
    <path d="M2 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
    <path d="M12 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
  </>,
  clock:  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
  check:  <path d="M20 6 9 17l-5-5" />,
  send:   <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />,
  search: <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  inbox:  <>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.5-7Z" />
  </>,
  shield: <path d="M12 2 4 5v6c0 5 3.5 9.3 8 11 4.5-1.7 8-6 8-11V5l-8-3Z" />,
  dashboard: <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>,
  logout: <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </>,
  nudge: <>
    <path d="M6 10c0-3.3 2.7-6 6-6s6 2.7 6 6v4l1.5 2H4.5L6 14v-4Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </>,
  help: <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.4" />
    <path d="M12 17h.01" />
  </>,
  key: <>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" />
  </>,
};

export function Icon({ name, size = 18, className = '' }:
  { name: keyof typeof paths; size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
         viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         className={className} aria-hidden>
      {paths[name]}
    </svg>
  );
}

// ---------- Skeleton ----------
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={'animate-pulse rounded-md bg-hairline/80 ' + className} />;
}

// ---------- Empty state ----------
export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto h-11 w-11 rounded-full bg-paper border border-hairline flex items-center justify-center text-inkmute">
        {icon || <Icon name="inbox" size={20} />}
      </div>
      <p className="mt-3 display text-lg">{title}</p>
      {hint && <p className="mt-1 text-sm text-inkmute">{hint}</p>}
    </div>
  );
}

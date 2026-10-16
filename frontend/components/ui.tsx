'use client';

import { ReactNode, useEffect } from 'react';

// ---------- Page header (Sunbeam page scale: H1 36px/800, 28px on phones) ----------
export function PageHeader({ eyebrow, title, lead, actions }: {
  eyebrow?: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end gap-4 lg:mb-8">
      <div className="min-w-0 flex-1 basis-64">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="display text-[28px] text-ink sm:text-[32px] lg:text-[36px]">
          {title}
        </h1>
        {lead && <p className="mt-2 max-w-2xl text-[15px] text-ink-2 sm:text-base">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </>
  );
  return surface
    ? <section className={'surface p-4 sm:p-5 lg:p-6 animate-fadeIn ' + className}>{inner}</section>
    : <section className={'animate-fadeIn ' + className}>{inner}</section>;
}

// ---------- Avatar ----------
export function Avatar({ name, size = 36, online, tone }: {
  name: string; size?: number; online?: boolean;
  /** 'gold' = Sunbeam account avatar (--gold-fill with --on-gold initials). */
  tone?: 'gold';
}) {
  const initials = name
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '').join('') || '?';
  // Warm tints from the Sunbeam family so avatars sit calmly on cream.
  const palette = ['#FBF1C6', '#F3E1C7', '#E9E2C3', '#F0E4B8', '#EADBB0', '#F5E6CF', '#E6DCC4'];
  const bg = tone === 'gold' ? '#F6C62C' : palette[Math.abs(hash(name)) % palette.length];
  const fg = '#3A2F05';
  return (
    <span className="relative inline-flex items-center justify-center shrink-0 select-none font-bold"
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
        'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface ' +
        (online ? 'bg-success animate-pulseDot' : 'bg-ink-3/60')
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
  more: <>
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </>,
  key: <>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2" />
  </>,
  // History: a clock turning back.
  history: <>
    <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </>,
  // Audit log: a clipboard with a checklist.
  audit: <>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <path d="m8.5 10 1.2 1.2L12 9M8.5 15.5l1.2 1.2L12 14.5M14 10h2M14 15.5h2" />
  </>,
  // Settings: sliders.
  settings: <>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </>,
  // Users (admin): a person with a badge.
  userAdmin: <>
    <circle cx="10" cy="8" r="4" />
    <path d="M3 20c0-3.3 2.7-6 6-6h2" />
    <path d="m17.5 14 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3 1-2.1Z" />
  </>,
  chevron: <path d="m9 6 6 6-6 6" />,
  download: <>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M4 21h16" />
  </>,
  reply: <>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 6 6v5" />
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
  return <div className={'animate-pulse rounded-md bg-inset ' + className} />;
}

// ---------- Empty state ----------
export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: ReactNode }) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-line bg-surface-2 text-ink-3">
        {icon || <Icon name="inbox" size={22} />}
      </div>
      <p className="mt-3 text-base font-bold text-ink">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
    </div>
  );
}

// ---------- Modal frame (Sunbeam §17) ----------
// A bottom sheet on phones, a centred panel from 640px up. Scrim click and
// Escape are handled by the caller (onClose); body scroll is locked while open.
export function ModalFrame({ onClose, labelledBy, bar = 'gold', role = 'dialog', children }: {
  onClose: () => void;
  labelledBy: string;
  /** 6px brand bar across the top (§17.1). */
  bar?: 'gold' | 'none';
  role?: 'dialog' | 'alertdialog';
  children: ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 animate-fadeIn sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role={role} aria-modal="true" aria-labelledby={labelledBy}
        className="flex max-h-[92vh] max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line
                   bg-surface shadow-2xl animate-sheetUp sm:max-w-lg sm:rounded-2xl sm:animate-popIn"
      >
        {bar === 'gold' && <div className="h-1.5 shrink-0 bg-gold-fill" aria-hidden />}
        <div className="overflow-y-auto overscroll-contain p-5 sm:p-6"
             style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Close (×) button for a modal header — 44px hit area (§17.1, §22).
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close"
      className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl leading-none text-ink-3 hover:bg-line-2 hover:text-ink-2">
      ×
    </button>
  );
}

// ---------- Status pill (§10.5): soft fill + text + leading dot ----------
const STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  SENT:         { label: 'Sent',         cls: 'bg-inset text-ink-2',          dot: 'bg-ink-3' },
  DELIVERED:    { label: 'Delivered',    cls: 'bg-brand-soft text-brand',     dot: 'bg-gold' },
  SEEN:         { label: 'Seen',         cls: 'bg-brand-soft text-brand',     dot: 'bg-gold' },
  ACKNOWLEDGED: { label: 'Acknowledged', cls: 'bg-success-soft text-success', dot: 'bg-success' },
};
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] || { label: status, cls: 'bg-inset text-ink-2', dot: 'bg-ink-3' };
  return (
    <span className={'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ' + s.cls}>
      <span className={'h-1.5 w-1.5 rounded-full ' + s.dot} aria-hidden />{s.label}
    </span>
  );
}
// Urgent is a status, so it stays red (live), never gold. Text is the deeper
// rose: --live on --live-soft is only 3.9:1.
export function UrgentPill() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-live-soft px-2 py-0.5 text-xs font-bold text-rose-deep">
      <span className="h-1.5 w-1.5 rounded-full bg-live" aria-hidden />Urgent
    </span>
  );
}

// "×8" after a message that was sent several times in a row.
export function RepeatCount({ n }: { n: number }) {
  return (
    <span className="ml-1.5 inline-flex rounded-full bg-inset px-1.5 text-xs font-bold text-ink-2 tabular-nums"
          title={`Sent ${n} times in a row`}>
      ×{n}
    </span>
  );
}

// ---------- Segmented control (§15.4) ----------
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={'min-h-[36px] rounded-md px-3.5 text-sm font-semibold transition-colors duration-150 ' +
            (value === o.value ? 'bg-gold-soft text-brand shadow-sm' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

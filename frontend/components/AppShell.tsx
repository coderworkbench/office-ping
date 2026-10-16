'use client';

// Application shell — Sunbeam §18.
//   ≥1024px (lg): fixed 288px navigation rail on the left.
//   <1024px:      sticky top bar + fixed bottom tab bar; the last tab ("More")
//                 opens a bottom sheet with everything else.
// The shell owns navigation for every page; pages never add their own.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import { Avatar, Icon } from './ui';
import { Logo } from './Logo';
import { Tour } from './Tour';

type Role = 'ADMIN' | 'HR' | 'MEMBER';
type NavItem = { href: string; label: string; icon: any; roles?: Role[]; badge?: number };

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const r = await apiFetch<{ unread: number }>('/api/notifications/unread_count/');
        if (mounted) setUnread(r.unread);
      } catch {}
    }
    load();
    const h = () => load();
    window.addEventListener('op:ping', h);
    window.addEventListener('op:ping_handled', h);
    const t = setInterval(load, 30000);
    return () => {
      mounted = false;
      window.removeEventListener('op:ping', h);
      window.removeEventListener('op:ping_handled', h);
      clearInterval(t);
    };
  }, []);

  // Close the "More" sheet whenever the route changes.
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  if (!user) return null;

  const role = user.role as Role;
  const allowed = (i: NavItem) => !i.roles || i.roles.includes(role);
  const isActive = (href: string) =>
    href === '/dashboard' || href === '/admin' ? pathname === href : !!pathname?.startsWith(href);

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Workspace',
      items: [
        { href: '/dashboard',     label: 'Overview', icon: 'dashboard' },
        { href: '/people',        label: 'People',   icon: 'users' },
        { href: '/notifications', label: 'Inbox',    icon: 'inbox', badge: unread },
        { href: '/history',       label: 'History',  icon: 'clock' },
        { href: '/help',          label: 'Help',     icon: 'help' },
      ],
    },
    {
      label: 'Broadcast',
      items: [
        { href: '/groups',    label: 'Groups',    icon: 'group', roles: ['ADMIN', 'HR'] },
        { href: '/templates', label: 'Templates', icon: 'send',  roles: ['ADMIN', 'HR'] },
      ],
    },
    {
      label: 'Admin',
      items: [
        { href: '/admin',       label: 'Settings',  icon: 'shield', roles: ['ADMIN'] },
        { href: '/admin/users', label: 'Users',     icon: 'users',  roles: ['ADMIN'] },
        { href: '/admin/audit', label: 'Audit log', icon: 'clock',  roles: ['ADMIN'] },
      ],
    },
  ];

  // Bottom tab bar: the four daily destinations + More (§18.2: 3–5 tabs).
  const tabs: NavItem[] = [
    { href: '/dashboard',     label: 'Overview', icon: 'dashboard' },
    { href: '/people',        label: 'People',   icon: 'users' },
    { href: '/notifications', label: 'Inbox',    icon: 'inbox', badge: unread },
    { href: '/history',       label: 'History',  icon: 'clock' },
  ];
  const tabHrefs = new Set(tabs.map(t => t.href));
  const moreItems = groups.flatMap(g => g.items).filter(i => allowed(i) && !tabHrefs.has(i.href));
  const moreActive = moreItems.some(i => isActive(i.href)) || pathname === '/account';

  async function doSignOut() {
    setSheetOpen(false);
    await signOut();
    router.replace('/login');
  }

  const name = user.full_name || user.username;

  return (
    <div className="min-h-screen bg-page">
      {/* ── Desktop rail (≥1024px) ─────────────────────────────────────── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-72 flex-col bg-sidebar text-white px-6">
        <Link href="/dashboard" className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10">
          <Logo size={36} />
          <span className="leading-tight">
            <span className="block text-[15px] font-bold">Office Ping</span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">Internal · v1</span>
          </span>
        </Link>

        <nav aria-label="Main" className="-mx-2 flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-0 py-5">
          {groups.map(g => {
            const visible = g.items.filter(allowed);
            if (!visible.length) return null;
            return (
              <div key={g.label}>
                <div className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wide text-white/40">{g.label}</div>
                <ul className="space-y-0.5">
                  {visible.map(i => {
                    const active = isActive(i.href);
                    return (
                      <li key={i.href}>
                        <Link href={i.href} aria-current={active ? 'page' : undefined} data-tour={tourId(i.href)}
                          className={
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ' +
                            (active ? 'bg-white/10 text-gold-fill' : 'text-white/70 hover:bg-white/5 hover:text-white')
                          }>
                          <Icon name={i.icon} size={20} />
                          <span className="flex-1">{i.label}</span>
                          {!!i.badge && <CountBadge n={i.badge} />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="-mx-2 mb-4 flex items-center gap-1 border-t border-white/10 pt-4">
          <Link href="/account" title="Your account"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
            <Avatar name={name} size={36} tone="gold" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block text-[11px] uppercase tracking-wide text-white/50">{role}</span>
            </span>
          </Link>
          <Link href="/account" title="Change password" aria-label="Change password" data-tour="account"
                className={'grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10 hover:text-white ' +
                  (pathname === '/account' ? 'bg-white/10 text-gold-fill' : 'text-white/60')}>
            <Icon name="key" size={18} />
          </Link>
          <button title="Sign out" aria-label="Sign out" onClick={doSignOut}
                  className="grid h-11 w-11 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      {/* ── Mobile / tablet top bar (<1024px) ──────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-surface px-4 shadow-sm sm:px-6"
              style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-[15px] font-bold text-ink">Office Ping</span>
        </Link>
        <Link href="/account" aria-label="Your account" data-tour="account" className="ml-auto grid h-11 w-11 place-items-center rounded-full">
          <Avatar name={name} size={34} tone="gold" />
        </Link>
      </header>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <main className="lg:pl-72">
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </div>
      </main>

      {/* ── Bottom tab bar (<1024px) ──────────────────────────────────── */}
      <nav aria-label="Main"
           className="lg:hidden fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-line bg-surface shadow-up"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="mx-auto grid max-w-xl grid-cols-5 px-1 pt-1.5 pb-1">
          {tabs.map(t => (
            <li key={t.href}>
              <TabLink href={t.href} label={t.label} icon={t.icon} badge={t.badge} active={isActive(t.href)} />
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setSheetOpen(true)} data-tour="nav-more"
                    aria-haspopup="dialog" aria-expanded={sheetOpen}
                    className="flex w-full flex-col items-center gap-0.5 py-1 min-h-[52px]">
              <TabIcon icon="more" active={moreActive || sheetOpen} />
              <span className={'text-[11px] font-semibold ' + (moreActive ? 'text-ink' : 'text-ink-3')}>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        name={name}
        role={role}
        items={moreItems}
        isActive={isActive}
        onSignOut={doSignOut}
      />

      <Tour />
    </div>
  );
}

// Stable hooks for the guided tour: /admin/users → "nav-users", /notifications → "nav-inbox".
function tourId(href: string) {
  const last = href.split('/').filter(Boolean).pop() || 'home';
  const alias: Record<string, string> = { dashboard: 'overview', notifications: 'inbox', admin: 'settings' };
  return 'nav-' + (alias[last] || last);
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="inline-grid min-w-[18px] h-[18px] place-items-center rounded-full bg-gold-fill px-1 text-[11px] font-bold text-on-gold tabular-nums">
      {n > 99 ? '99+' : n}
    </span>
  );
}

function TabIcon({ icon, active, badge }: { icon: any; active: boolean; badge?: number }) {
  return (
    <span className={'relative grid h-7 place-items-center rounded-full px-3.5 transition-colors duration-150 ' +
      (active ? 'bg-gold-fill text-on-gold' : 'text-ink-3')}>
      <Icon name={icon} size={20} />
      {!!badge && (
        <span className="absolute -right-1 -top-1 inline-grid min-w-[17px] h-[17px] place-items-center rounded-full bg-live px-1 text-[10px] font-bold text-white tabular-nums ring-2 ring-surface">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </span>
  );
}

function TabLink({ href, label, icon, badge, active }:
  { href: string; label: string; icon: any; badge?: number; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} data-tour={tourId(href)}
          aria-label={badge ? `${label}, ${badge} unread` : undefined}
          className="flex flex-col items-center gap-0.5 py-1 min-h-[52px]">
      <TabIcon icon={icon} active={active} badge={badge} />
      <span className={'text-[11px] font-semibold ' + (active ? 'text-ink' : 'text-ink-3')}>{label}</span>
    </Link>
  );
}

// §17.2 bottom sheet: scrim + panel sliding up, grab handle, Esc / scrim to close,
// body scroll locked, focus moved in and returned to the trigger on close.
function MoreSheet({ open, onClose, name, role, items, isActive, onSignOut }: {
  open: boolean; onClose: () => void; name: string; role: Role;
  items: NavItem[]; isActive: (href: string) => boolean; onSignOut: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => panelRef.current?.querySelector<HTMLElement>('a,button')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {   // keep focus inside the sheet
        const f = panelRef.current.querySelectorAll<HTMLElement>('a,button');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-[95] flex items-end bg-black/50 animate-fadeIn"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="More"
           className="w-full max-h-[80vh] max-h-[80dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-line bg-surface px-4 pt-3 shadow-sheet animate-sheetUp"
           style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-3">
          <Avatar name={name} size={40} tone="gold" />
          <div className="min-w-0">
            <div className="truncate font-bold text-ink">{name}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">{role}</div>
          </div>
        </div>
        <ul className="divide-y divide-line-2">
          {items.map(i => (
            <li key={i.href}>
              <SheetRow href={i.href} icon={i.icon} label={i.label} active={isActive(i.href)} />
            </li>
          ))}
          <li><SheetRow href="/account" icon="key" label="Change password" active={false} /></li>
          <li>
            <button onClick={onSignOut}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-3 min-h-[48px] text-[15px] font-semibold text-rose active:bg-rose-soft">
              <Icon name="logout" size={20} /> Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

function SheetRow({ href, icon, label, active }: { href: string; icon: any; label: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
          className={'flex items-center gap-3 rounded-lg px-2 py-3 min-h-[48px] text-[15px] font-semibold active:bg-inset ' +
            (active ? 'text-brand' : 'text-ink')}>
      <span className={'grid h-8 w-8 place-items-center rounded-lg ' + (active ? 'bg-gold-fill text-on-gold' : 'bg-inset text-brand')}>
        <Icon name={icon} size={18} />
      </span>
      {label}
      <span className="ml-auto text-ink-3" aria-hidden>›</span>
    </Link>
  );
}

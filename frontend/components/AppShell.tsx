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
import { prefetch } from '../lib/useApi';
import { Avatar, Icon } from './ui';
import { Logo } from './Logo';
import { Tour } from './Tour';
import { QuickPing, QUICK_PING_EVENT, ShortcutHint } from './QuickPing';
import { ChatDock } from './chat/ChatDock';
import { StatusDialog } from './StatusDialog';
import { describeStatus } from '../lib/status';
import { useLiveStatus } from './NotificationsRuntime';
import { useChat } from '../lib/chat';

type Role = 'ADMIN' | 'HR' | 'MEMBER';
type NavItem = { href: string; label: string; icon: any; roles?: Role[]; badge?: number };

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState<boolean | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const chatUnread = useChat().unreadTotal;

  // The Manage section remembers whether it was left open.
  useEffect(() => {
    try { setManageOpen(localStorage.getItem('op_nav_manage') === 'open'); } catch { setManageOpen(false); }
  }, []);
  function toggleManage() {
    const next = !manageOpen;
    setManageOpen(next);
    try { localStorage.setItem('op_nav_manage', next ? 'open' : 'closed'); } catch {}
  }

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
    const events = ['op:ping', 'op:ping_handled', 'op:inbox_changed'];
    events.forEach(e => window.addEventListener(e, h));
    const t = setInterval(load, 30000);
    return () => {
      mounted = false;
      events.forEach(e => window.removeEventListener(e, h));
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

  const groups: { label: string; items: NavItem[]; collapsible?: boolean }[] = [
    {
      label: 'Workspace',
      items: [
        { href: '/dashboard',     label: 'Overview', icon: 'dashboard' },
        { href: '/people',        label: 'People',   icon: 'users' },
        { href: '/notifications', label: 'Inbox',    icon: 'inbox', badge: unread },
        { href: '/messages',      label: 'Messages', icon: 'chat',  badge: chatUnread },
        { href: '/history',       label: 'History',  icon: 'history' },
        { href: '/help',          label: 'Help',     icon: 'help' },
      ],
    },
    {
      // Collapsible so the rail fits a laptop screen without scrolling.
      label: 'Manage',
      collapsible: true,
      items: [
        { href: '/groups',      label: 'Groups',    icon: 'group',     roles: ['ADMIN', 'HR'] },
        { href: '/templates',   label: 'Templates', icon: 'send',      roles: ['ADMIN', 'HR'] },
        { href: '/admin/users', label: 'Users',     icon: 'userAdmin', roles: ['ADMIN'] },
        { href: '/admin/audit', label: 'Audit log', icon: 'audit',     roles: ['ADMIN'] },
        { href: '/admin',       label: 'Settings',  icon: 'settings',  roles: ['ADMIN'] },
      ],
    },
  ];

  // Bottom tab bar: the four daily destinations + More (§18.2: 3–5 tabs).
  // History lives under More.
  const tabs: NavItem[] = [
    { href: '/dashboard',     label: 'Overview', icon: 'dashboard' },
    { href: '/people',        label: 'People',   icon: 'users' },
    { href: '/notifications', label: 'Inbox',    icon: 'inbox', badge: unread },
    { href: '/messages',      label: 'Messages', icon: 'chat',  badge: chatUnread },
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
            <span className="block text-[10px] uppercase tracking-[0.14em] text-white/60">Internal · v1</span>
          </span>
        </Link>

        <button type="button" onClick={() => window.dispatchEvent(new Event(QUICK_PING_EVENT))} data-tour="quick-ping"
                className="mt-4 flex min-h-[40px] w-full items-center gap-2.5 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15">
          <Icon name="send" size={18} /> <span className="flex-1 text-left">Quick ping</span> <ShortcutHint />
        </button>

        <nav aria-label="Main" className="-mx-2 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-0 py-5">
          {groups.map(g => {
            const visible = g.items.filter(allowed);
            if (!visible.length) return null;
            // Open when the person left it open, or when they're on one of its pages.
            const open = !g.collapsible || !!manageOpen || visible.some(i => isActive(i.href));
            return (
              <div key={g.label}>
                {g.collapsible ? (
                  <button type="button" onClick={toggleManage} aria-expanded={open} aria-controls="nav-manage"
                          data-tour="nav-manage"
                          className="mb-1.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white/60 hover:text-white">
                    <span className={'transition-transform duration-150 ' + (open ? 'rotate-90' : '')}><Icon name="chevron" size={14} /></span>
                    {g.label}
                    {!open && <span className="ml-auto font-semibold normal-case tracking-normal text-white/60">{visible.length} pages</span>}
                  </button>
                ) : (
                  <div className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wide text-white/60">{g.label}</div>
                )}
                {open && <ul id={g.collapsible ? 'nav-manage' : undefined} className="space-y-0.5">
                  {visible.map(i => {
                    const active = isActive(i.href);
                    return (
                      <li key={i.href}>
                        <Link href={i.href} aria-current={active ? 'page' : undefined} data-tour={tourId(i.href)}
                          onMouseEnter={() => warm(i.href, role)} onFocus={() => warm(i.href, role)}
                          className={
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 ' +
                            (active ? 'bg-white/10 text-gold-fill' : 'text-white/75 hover:bg-white/5 hover:text-white')
                          }>
                          <Icon name={i.icon} size={20} />
                          <span className="flex-1">{i.label}</span>
                          {!!i.badge && <CountBadge n={i.badge} />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>}
              </div>
            );
          })}
        </nav>

        <button type="button" onClick={() => setStatusOpen(true)} data-tour="status"
                className="-mx-2 mb-2 flex min-h-[40px] items-center gap-2 truncate rounded-lg px-2 text-left text-[13px] font-semibold text-white/75 hover:bg-white/5 hover:text-white">
          <span className={'h-2 w-2 shrink-0 rounded-full ' + (user.status ? (user.status.quiet ? 'bg-live' : 'bg-gold-fill') : 'bg-success')} aria-hidden />
          <span className="truncate">{user.status ? describeStatus(user.status) : 'Available · set a status'}</span>
        </button>
        <div className="-mx-2 mb-4 flex items-center gap-1 border-t border-white/10 pt-4">
          <Link href="/account" title="Your account"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
            <Avatar name={name} size={36} tone="gold" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block text-xs uppercase tracking-wide text-white/65">{role}</span>
            </span>
          </Link>
          <Link href="/account" title="Change password" aria-label="Change password" data-tour="account"
                className={'grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10 hover:text-white ' +
                  (pathname === '/account' ? 'bg-white/10 text-gold-fill' : 'text-white/70')}>
            <Icon name="key" size={18} />
          </Link>
          <button title="Sign out" aria-label="Sign out" onClick={doSignOut}
                  className="grid h-11 w-11 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      {/* ── Mobile / tablet top bar (<1024px) ──────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-line bg-surface px-4 shadow-sm sm:px-6"
              style={{ paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo size={28} />
          <span className="text-[15px] font-bold text-ink">Office Ping</span>
          <LiveDot />
        </Link>
        <Link href="/account" aria-label="Your account" data-tour="account" className="ml-auto grid h-11 w-11 place-items-center rounded-full">
          <Avatar name={name} size={32} tone="gold" />
        </Link>
      </header>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <main className="lg:pl-72">
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-24 lg:pt-8">
          {children}
        </div>
      </main>

      {/* ── Bottom tab bar (<1024px) ──────────────────────────────────── */}
      <nav aria-label="Main"
           className="op-tabbar lg:hidden fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-line bg-surface shadow-up"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="mx-auto grid h-16 max-w-xl grid-cols-5 items-center px-1">
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
        statusLabel={user.status ? describeStatus(user.status, { emoji: true }) : 'Available'}
        onStatus={() => { setSheetOpen(false); setStatusOpen(true); }}
      />

      <StatusDialog open={statusOpen} onClose={() => setStatusOpen(false)} />
      <QuickPing />
      <ChatDock />
      <Tour />
    </div>
  );
}

// Connection state as a small dot next to the name in the phone top bar.
function LiveDot() {
  const live = useLiveStatus() === 'open';
  return (
    <span className={'h-2 w-2 rounded-full ' + (live ? 'bg-success' : 'bg-warn animate-pulse')}
          title={live ? 'Live' : 'Reconnecting…'} aria-label={live ? 'Live' : 'Reconnecting'} role="img" />
  );
}

// Load a page's data while the pointer is on its link, so it opens with
// content instead of a skeleton. Keys must match what the page asks for.
function warm(href: string, role?: Role) {
  const urls: Record<string, string[]> = {
    '/dashboard':     role && role !== 'MEMBER' ? ['/api/dashboard/'] : [],
    '/people':        ['/api/users/'],
    '/notifications': ['/api/notifications/'],
    '/history':       ['/api/pings/?scope=sent'],
  };
  (urls[href] || []).forEach(u => prefetch(u));
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
          onTouchStart={() => warm(href)}
          className="flex flex-col items-center gap-0.5 py-1 min-h-[52px]">
      <TabIcon icon={icon} active={active} badge={badge} />
      <span className={'text-[11px] font-semibold ' + (active ? 'text-ink' : 'text-ink-3')}>{label}</span>
    </Link>
  );
}

// §17.2 bottom sheet: scrim + panel sliding up, grab handle, Esc / scrim to close,
// body scroll locked, focus moved in and returned to the trigger on close.
function MoreSheet({ open, onClose, name, role, items, isActive, onSignOut, statusLabel, onStatus }: {
  open: boolean; onClose: () => void; name: string; role: Role;
  items: NavItem[]; isActive: (href: string) => boolean; onSignOut: () => void;
  statusLabel: string; onStatus: () => void;
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
        <button type="button" onClick={onStatus}
                className="mb-2 flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-line px-3 text-left text-[15px] font-semibold text-ink active:bg-inset">
          <span className="min-w-0 flex-1 truncate">{statusLabel}</span>
          <span className="text-sm font-semibold text-brand">Set status</span>
        </button>
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

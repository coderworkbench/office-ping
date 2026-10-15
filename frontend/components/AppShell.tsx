'use client';

// Ink-dark side navigation + paper content area.
// The whole app's chrome lives here (used from Guard).

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';
import { Avatar, Icon } from './ui';
import { Logo } from './Logo';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

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
    const t = setInterval(load, 30000);
    return () => { mounted = false; window.removeEventListener('op:ping', h); clearInterval(t); };
  }, []);

  if (!user) return null;

  const groups: { eyebrow: string; items: NavItem[] }[] = [
    {
      eyebrow: 'Workspace',
      items: [
        { href: '/dashboard',     label: 'Overview', icon: 'dashboard', show: true },
        { href: '/people',        label: 'People',   icon: 'users',     show: true },
        { href: '/notifications', label: 'Inbox',    icon: 'inbox',     show: true, badge: unread },
        { href: '/history',       label: 'History',  icon: 'clock',     show: true },
      ],
    },
    {
      eyebrow: 'Broadcast',
      items: [
        { href: '/groups',    label: 'Groups',    icon: 'group', show: user.role !== 'MEMBER' },
        { href: '/templates', label: 'Templates', icon: 'send',  show: user.role !== 'MEMBER' },
      ],
    },
    {
      eyebrow: 'Admin',
      items: [
        { href: '/admin',       label: 'Settings',   icon: 'shield',    show: user.role === 'ADMIN' },
        { href: '/admin/users', label: 'Users',      icon: 'users',     show: user.role === 'ADMIN' },
        { href: '/admin/audit', label: 'Audit log',  icon: 'clock',     show: user.role === 'ADMIN' },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex bg-paper">
      {/* Side nav */}
      <aside className="hidden md:flex md:w-60 lg:w-64 flex-col bg-slab-900 text-white sticky top-0 h-screen">
        <div className="px-5 pt-5 pb-4 flex items-center gap-2.5 border-b border-white/5">
          <Logo size={34} />
          <span>
            <span className="font-display text-lg leading-none">Office Ping</span>
            <span className="block text-[11px] text-white/50 mt-1 tracking-wide">INTERNAL · v1</span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map(g => {
            const visible = g.items.filter(i => i.show);
            if (!visible.length) return null;
            return (
              <div key={g.eyebrow}>
                <div className="eyebrow text-white/40 px-2 mb-1.5">{g.eyebrow}</div>
                <ul className="space-y-0.5">
                  {visible.map(i => {
                    const active = i.href === '/dashboard'
                      ? pathname === i.href
                      : pathname?.startsWith(i.href);
                    return (
                      <li key={i.href}>
                        <Link href={i.href}
                          className={
                            'group flex items-center gap-3 px-2.5 py-2 rounded-tool text-sm relative ' +
                            (active
                              ? 'bg-white/10 text-white'
                              : 'text-white/70 hover:text-white hover:bg-white/5')
                          }>
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] bg-ember rounded-r"></span>
                          )}
                          <Icon name={i.icon} size={16} />
                          <span className="flex-1">{i.label}</span>
                          {typeof i.badge === 'number' && i.badge > 0 && (
                            <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-ember text-white text-[11px] font-medium">
                              {i.badge > 99 ? '99+' : i.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-3 flex items-center gap-2.5">
          <Avatar name={user.full_name || user.username} size={30} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user.full_name}</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wider">{user.role}</div>
          </div>
          <button title="Sign out"
                  className="h-8 w-8 rounded-tool text-white/60 hover:text-white hover:bg-white/10 grid place-items-center"
                  onClick={async () => { await signOut(); router.replace('/login'); }}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-slab-900 text-white px-4 h-14">
        <Logo size={28} />
        <span className="font-display text-base">Office Ping</span>
        <Link href="/notifications" className="ml-auto h-9 w-9 rounded-tool grid place-items-center hover:bg-white/10 relative">
          <Icon name="inbox" size={16} />
          {unread > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-ember" />}
        </Link>
        <button className="h-9 w-9 rounded-tool grid place-items-center hover:bg-white/10"
          onClick={async () => { await signOut(); router.replace('/login'); }}>
          <Icon name="logout" size={16} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-5xl px-5 lg:px-10 py-8 lg:py-12">
          {children}
        </div>
      </main>
    </div>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: any;
  show: boolean;
  badge?: number;
};

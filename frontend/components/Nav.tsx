'use client';

import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Avatar, Icon } from './ui';

export function Nav() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const r = await apiFetch<{ unread: number }>('/api/notifications/unread_count/');
        if (mounted) setUnread(r.unread);
      } catch {}
    }
    load();
    const onPing = () => load();
    window.addEventListener('op:ping', onPing);
    const t = setInterval(load, 30000);
    return () => { mounted = false; window.removeEventListener('op:ping', onPing); clearInterval(t); };
  }, []);

  if (!user) return null;

  type Item = { href: string; label: string; icon: any; show: boolean; badge?: number };
  const items: Item[] = [
    { href: '/dashboard',     label: 'Dashboard',     icon: 'dashboard', show: true },
    { href: '/people',        label: 'People',        icon: 'users',     show: true },
    { href: '/notifications', label: 'Inbox',         icon: 'inbox',     show: true, badge: unread },
    { href: '/history',       label: 'History',       icon: 'clock',     show: true },
    { href: '/groups',        label: 'Groups',        icon: 'group',     show: user.role !== 'MEMBER' },
    { href: '/templates',     label: 'Templates',     icon: 'send',      show: user.role !== 'MEMBER' },
    { href: '/admin',         label: 'Admin',         icon: 'shield',    show: user.role === 'ADMIN' },
  ];

  return (
    <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-6xl flex items-center gap-4 px-4 h-14">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-brand">
          <span className="h-7 w-7 rounded-lg bg-brand text-white flex items-center justify-center">
            <Icon name="bell" size={16} />
          </span>
          <span className="hidden sm:inline">Office Ping</span>
        </Link>
        <ul className="flex items-center gap-1 text-sm overflow-x-auto">
          {items.filter(i => i.show).map(i => {
            const active = pathname?.startsWith(i.href);
            return (
              <li key={i.href}>
                <Link href={i.href}
                  className={
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg relative ' +
                    (active ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                  }>
                  <Icon name={i.icon} size={16} />
                  <span className="hidden md:inline">{i.label}</span>
                  {i.badge && i.badge > 0 ? (
                    <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[1.25rem] rounded-full bg-red-500 text-white text-[11px] px-1.5">
                      {i.badge > 99 ? '99+' : i.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2">
            <Avatar name={user.full_name || user.username} size={28} />
            <div className="text-xs leading-tight">
              <div className="font-medium text-slate-800">{user.full_name}</div>
              <div className="text-slate-500">{user.role}</div>
            </div>
          </div>
          <button
            title="Sign out"
            className="btn-ghost !px-2 !py-1.5 text-slate-500 hover:text-red-600"
            onClick={async () => { await signOut(); router.replace('/login'); }}
          >
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}

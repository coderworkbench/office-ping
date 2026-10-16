'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { AppShell } from './AppShell';
import { NotificationPermissionBanner } from './NotificationPermissionBanner';
import { StatusBanner } from './StatusBanner';

export function Guard({
  children, requireRole, phoneHome = false,
}: {
  children: React.ReactNode;
  requireRole?: Array<'ADMIN' | 'HR' | 'MEMBER'>;
  /** The page has its own phone layout that shows compact banners itself. */
  phoneHome?: boolean;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (requireRole && !requireRole.includes(user.role)) router.replace('/dashboard');
  }, [user, loading, requireRole, router]);

  if (loading || !user) return (
    <div className="grid min-h-screen place-items-center bg-page text-ink-3" role="status">Loading…</div>
  );
  if (requireRole && !requireRole.includes(user.role)) return null;

  return (
    <AppShell>
      <div className={phoneHome ? 'hidden sm:block' : ''}>
        <NotificationPermissionBanner />
        <StatusBanner />
      </div>
      {children}
    </AppShell>
  );
}

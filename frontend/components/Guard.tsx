'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { AppShell } from './AppShell';
import { NotificationPermissionBanner } from './NotificationPermissionBanner';

export function Guard({
  children, requireRole,
}: {
  children: React.ReactNode;
  requireRole?: Array<'ADMIN' | 'HR' | 'MEMBER'>;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (requireRole && !requireRole.includes(user.role)) router.replace('/dashboard');
  }, [user, loading, requireRole, router]);

  if (loading || !user) return (
    <div className="min-h-screen grid place-items-center text-inkmute bg-paper">Loading…</div>
  );
  if (requireRole && !requireRole.includes(user.role)) return null;

  return (
    <AppShell>
      <NotificationPermissionBanner />
      {children}
    </AppShell>
  );
}

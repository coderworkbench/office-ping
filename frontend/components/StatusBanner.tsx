'use client';

// Reminds you that a status is on, so "In a meeting" isn't left on all day.

import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate } from '../lib/useApi';
import { describeStatus } from '../lib/status';
import { StatusDialog } from './StatusDialog';

export function StatusBanner() {
  const { user, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = user?.status;
  if (!s) return null;

  async function back() {
    setBusy(true);
    try {
      await apiFetch('/api/me/status/', { method: 'PUT', body: JSON.stringify({ kind: '' }) });
      await refresh();
      invalidate('/api/users/');
    } finally { setBusy(false); }
  }

  return (
    <>
      <div role="status" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
        <p className="min-w-0 flex-1 basis-full text-sm text-ink sm:basis-0">
          <span className="font-semibold">{describeStatus(s, { emoji: true })}</span>
          <span className="text-ink-2">
            {s.quiet ? ' — normal pings wait quietly in your inbox; urgent ones still pop up.' : ' — people see this before they ping you.'}
          </span>
        </p>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setEditing(true)} className="btn-ghost btn-sm">Change</button>
          <button onClick={back} disabled={busy} className="btn-secondary btn-sm">I’m back</button>
        </div>
      </div>
      <StatusDialog open={editing} onClose={() => setEditing(false)} />
    </>
  );
}

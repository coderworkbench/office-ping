'use client';
import { useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch, apiErrorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Icon, PageHeader, Section } from '../../components/ui';

export default function AccountPage() {
  return <Guard><Inner /></Guard>;
}

function Inner() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDone(false);
    if (next !== confirm) { setError('The new passwords don’t match.'); return; }
    if (next === current) { setError('Pick a password different from your current one.'); return; }
    setBusy(true);
    try {
      await apiFetch('/api/me/password/', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setDone(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not change the password. Try again.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="animate-fadeIn">
      <PageHeader
        eyebrow="Your account"
        title={<>Change <em>password</em></>}
        lead={<>Signed in as <strong>@{user?.username}</strong>. Use at least 8 characters, and avoid
          common words or anything close to your name.</>}
      />

      <Section className="max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current password">
            <input className="input" type="password" autoComplete="current-password"
                   value={current} onChange={e => setCurrent(e.target.value)} required />
          </Field>
          <Field label="New password">
            <input className="input" type="password" autoComplete="new-password" minLength={8}
                   value={next} onChange={e => setNext(e.target.value)} required />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" autoComplete="new-password" minLength={8}
                   value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </Field>

          {error && <p role="alert" className="text-sm text-ember-600">{error}</p>}
          {done && (
            <p role="status" className="text-sm text-jade inline-flex items-center gap-1.5">
              <Icon name="check" size={14} /> Password changed. Use it next time you sign in.
            </p>
          )}

          <button disabled={busy} className="btn-primary">
            <Icon name="key" size={14} /> {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </Section>

      <p className="mt-4 text-sm text-inkmute max-w-lg">
        Forgot your current password? Ask an admin to reset it for you.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../lib/api';
import { generatePassword } from '../lib/password';
import { Avatar, Icon } from './ui';

// Admin-only: set a new password for someone who forgot theirs.
export function ResetPasswordDialog({
  user, onClose,
}: {
  user: { id: number; username: string; full_name: string } | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPassword(generatePassword());
    setBusy(false); setError(null); setDone(false); setCopied(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, onClose]);

  if (!user) return null;
  const name = user.full_name || user.username;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true); setError(null);
    try {
      await apiFetch(`/api/users/${user.id}/set-password/`, {
        method: 'POST', body: JSON.stringify({ new_password: password }),
      });
      setDone(true);
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not reset the password. Try again.'));
    } finally { setBusy(false); }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="reset-pw-title"
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-slab-900/40 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form onSubmit={submit} className="w-full max-w-md surface p-6 shadow-pop animate-slideIn">
        <div className="flex items-start gap-3">
          <Avatar name={name} size={44} />
          <div className="flex-1 min-w-0">
            <div className="eyebrow">Reset password</div>
            <h2 id="reset-pw-title" className="display text-2xl font-medium leading-tight">{name}</h2>
            <p className="text-xs text-inkmute mt-1">@{user.username}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="text-inkmute hover:text-ink p-1 rounded-md hover:bg-paper">✕</button>
        </div>

        <div className="mt-5">
          <label htmlFor="reset-pw" className="label mb-2 block">New password</label>
          <div className="flex gap-2">
            <input id="reset-pw" className="input font-mono" value={password} minLength={8}
                   readOnly={done} autoComplete="off" spellCheck={false}
                   onChange={e => setPassword(e.target.value)} required />
            {!done && (
              <button type="button" onClick={() => setPassword(generatePassword())}
                      className="btn-outline shrink-0" title="Generate a new one">Generate</button>
            )}
            <button type="button" onClick={copy} className="btn-outline shrink-0">
              {copied ? <><Icon name="check" size={14} /> Copied</> : 'Copy'}
            </button>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-ember-600">{error}</p>}

        {done ? (
          <>
            <p role="status" className="mt-4 text-sm text-jade inline-flex items-start gap-1.5">
              <Icon name="check" size={14} className="mt-0.5 shrink-0" />
              <span>Password reset. Share it with {name} privately and ask them to change it
                from the key icon after signing in.</span>
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className="btn-dark">Done</button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-xs text-inkmute">
              Their old password stops working immediately. This is recorded in the audit log.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
              <button disabled={busy} className="btn-primary">
                <Icon name="key" size={14} /> {busy ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

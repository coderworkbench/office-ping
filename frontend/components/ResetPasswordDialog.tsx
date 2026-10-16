'use client';

import { useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../lib/api';
import { generatePassword } from '../lib/password';
import { Avatar, CloseButton, Icon, ModalFrame } from './ui';

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
    <ModalFrame onClose={onClose} labelledBy="reset-pw-title">
      <form onSubmit={submit}>
        <div className="flex items-start gap-3">
          <Avatar name={name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Reset password</div>
            <h2 id="reset-pw-title" className="truncate text-xl font-bold text-ink">{name}</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">@{user.username}</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="mt-5">
          <label htmlFor="reset-pw" className="label mb-2">New password</label>
          <input id="reset-pw" className="input font-semibold tracking-wide tabular-nums" value={password} minLength={8}
                 readOnly={done} autoComplete="off" spellCheck={false}
                 onChange={e => setPassword(e.target.value)} required />
          <div className="mt-2 flex flex-wrap gap-2">
            {!done && (
              <button type="button" onClick={() => setPassword(generatePassword())}
                      className="btn-neutral btn-sm" title="Generate a new one">Generate</button>
            )}
            <button type="button" onClick={copy} className="btn-neutral btn-sm">
              {copied ? <><Icon name="check" size={14} /> Copied</> : 'Copy'}
            </button>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-rose">{error}</p>}

        {done ? (
          <>
            <p role="status" className="mt-4 inline-flex items-start gap-1.5 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
              <Icon name="check" size={16} className="mt-0.5 shrink-0" />
              <span>Password reset. Share it with {name} privately and ask them to change it
                under Change password after signing in.</span>
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className="btn-primary w-full sm:w-auto">Done</button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px] text-ink-2">
              Their old password stops working immediately. This is recorded in the audit log.
            </p>
            <div className="mt-5 flex w-full gap-2 sm:justify-end">
              <button type="button" onClick={onClose} className="btn-neutral flex-1 sm:flex-none">Cancel</button>
              <button disabled={busy} className="btn-primary flex-1 sm:flex-none">
                <Icon name="key" size={16} /> {busy ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </>
        )}
      </form>
    </ModalFrame>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { Icon } from '../../components/ui';
import { Logo } from '../../components/Logo';

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await signIn(username, password);
      router.replace('/dashboard');
    } catch { setErr('Those credentials didn\'t work.'); } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-page lg:grid-cols-2 lg:grid-rows-1">
      {/* Brand side — gold as light (§2.6). A compact band on phones, a full panel on desktop. */}
      <div className="hero-aura flex flex-col justify-between gap-6 border-b border-line px-5 py-6 sm:px-8 lg:min-h-screen lg:border-b-0 lg:border-r lg:p-12">
        <div className="flex items-center gap-2.5">
          <Logo size={36} />
          <span className="text-[17px] font-bold text-ink">Office Ping</span>
        </div>
        <div className="max-w-lg">
          <div className="eyebrow mb-3">On the office network</div>
          <p className="display text-[28px] text-ink sm:text-[36px] lg:text-[48px] lg:leading-[1.05]">
            A digital tap on the shoulder between desks.
          </p>
          <p className="mt-3 max-w-md text-ink-2 sm:text-lg lg:mt-5">
            One quick ping. One acknowledgement. No calls, no walks across the office.
          </p>
        </div>
        <div className="hidden text-xs text-ink-3 lg:block">
          v1 · built for internal networks
        </div>
      </div>

      {/* The form */}
      <div className="grid items-start justify-items-center px-4 py-6 sm:px-6 sm:py-10 lg:place-items-center lg:p-12">
        <form onSubmit={submit} className="surface w-full max-w-sm space-y-5 p-5 animate-slideIn sm:p-7">
          <div>
            <div className="eyebrow mb-1.5">Sign in</div>
            <h1 className="display text-[26px] text-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-ink-2">Use the username and password from your admin.</p>
          </div>

          <label className="block space-y-1.5">
            <span className="label">Username</span>
            <input className="input" value={username} onChange={e => setU(e.target.value)}
                   placeholder="Your username" autoComplete="username" autoCapitalize="none"
                   autoCorrect="off" spellCheck={false} autoFocus required />
          </label>

          <label className="block space-y-1.5">
            <span className="label">Password</span>
            <input type="password" className="input" value={password} autoComplete="current-password"
                   onChange={e => setP(e.target.value)} placeholder="••••••••" required />
          </label>

          {err && (
            <div role="alert"
              className="rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">
              {err}
            </div>
          )}

          <button disabled={busy} className="btn-primary w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-xs text-ink-3">
            Internal tool — accounts are created by your admin. Forgot your password? Ask an admin to reset it.
          </p>
        </form>
      </div>
    </div>
  );
}

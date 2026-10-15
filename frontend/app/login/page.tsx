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
    <div className="min-h-screen grid lg:grid-cols-2 bg-paper">
      {/* Left — the brand side */}
      <div className="hidden lg:flex flex-col justify-between p-10 bg-slab-900 text-white relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-2.5">
          <Logo size={34} />
          <span className="font-display text-lg">Office Ping</span>
        </div>
        <div className="relative z-10 max-w-lg">
          <div className="eyebrow text-white/50 mb-4">On the office LAN</div>
          <p className="display text-5xl font-medium leading-[1.05]">
            A digital
            <span className="italic font-normal"> tap on the shoulder</span>
            <br/> between desks.
          </p>
          <p className="mt-5 text-white/60 max-w-md">
            One quick ping. One acknowledgement. No calls, no walks across the office.
          </p>
        </div>
        <div className="relative z-10 text-xs text-white/40 font-mono">
          v1 · built for internal networks
        </div>
        {/* soft ember glow */}
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-ember/20 blur-3xl" />
        <div className="pointer-events-none absolute right-10 top-10 h-40 w-40 rounded-full bg-ember/5 blur-2xl" />
      </div>

      {/* Right — the form */}
      <div className="grid place-items-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5 animate-slideIn">
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <Logo size={32} />
            <span className="font-display text-lg">Office Ping</span>
          </div>

          <div>
            <div className="eyebrow mb-2">Sign in</div>
            <h1 className="display text-3xl font-medium">Welcome back.</h1>
            <p className="text-inkmute text-sm mt-1">Use your office credentials.</p>
          </div>

          <label className="block space-y-1.5">
            <span className="label">Username</span>
            <input className="input" value={username} onChange={e => setU(e.target.value)}
                   placeholder="e.g. mangesh" autoFocus required />
          </label>

          <label className="block space-y-1.5">
            <span className="label">Password</span>
            <input type="password" className="input" value={password}
                   onChange={e => setP(e.target.value)} placeholder="••••••••" required />
          </label>

          {err && (
            <div role="alert"
              className="text-sm text-ember border border-ember/30 bg-ember/5 rounded-tool px-3 py-2">
              {err}
            </div>
          )}

          <button disabled={busy} className="btn-dark w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-xs text-inkmute">
            Internal tool — accounts are provisioned by your admin.
          </p>
        </form>
      </div>
    </div>
  );
}

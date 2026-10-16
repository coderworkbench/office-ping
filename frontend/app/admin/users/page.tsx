'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Guard } from '../../../components/Guard';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { ResetPasswordDialog } from '../../../components/ResetPasswordDialog';
import { Avatar, Empty, Icon, PageHeader, Section, Skeleton } from '../../../components/ui';

type User = {
  id: number; username: string; email: string; full_name: string;
  role: 'ADMIN' | 'HR' | 'MEMBER'; department: string; is_active: boolean;
};

export default function AdminUsersPage() {
  return <Guard requireRole={['ADMIN']}><Inner /></Guard>;
}

function Inner() {
  const { user: me } = useAuth();
  const [resetFor, setResetFor] = useState<User | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: '', email: '', first_name: '', last_name: '',
    password: '', role: 'MEMBER', department: '',
  });

  async function load() {
    const d = await apiFetch<any>('/api/users/');
    setUsers(d.results || d);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setFeedback(null);
    try {
      await apiFetch('/api/users/', { method: 'POST', body: JSON.stringify(form) });
      setFeedback(`✓ Created ${form.username}`);
      setForm({ username: '', email: '', first_name: '', last_name: '',
                password: '', role: 'MEMBER', department: '' });
      load();
    } catch (e: any) { setFeedback('Create failed: ' + e.message); }
    finally { setBusy(false); setTimeout(() => setFeedback(null), 4000); }
  }
  async function toggle(u: User) {
    await apiFetch(`/api/users/${u.id}/`, { method: 'PATCH',
      body: JSON.stringify({ is_active: !u.is_active }) });
    load();
  }
  async function changeRole(u: User, role: User['role']) {
    await apiFetch(`/api/users/${u.id}/`, { method: 'PATCH',
      body: JSON.stringify({ role }) });
    load();
  }

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (users || []).filter(u => !needle ||
      u.full_name?.toLowerCase().includes(needle) ||
      u.username.toLowerCase().includes(needle) ||
      u.email.toLowerCase().includes(needle) ||
      (u.department || '').toLowerCase().includes(needle)
    );
  }, [users, q]);

  const RoleSelect = ({ u }: { u: User }) => (
    <select value={u.role} onChange={e => changeRole(u, e.target.value as any)}
            aria-label={`Role for ${u.full_name || u.username}`}
            className="input !min-h-[40px] w-32 !py-1.5 !text-sm">
      <option value="MEMBER">Member</option>
      <option value="HR">HR</option>
      <option value="ADMIN">Admin</option>
    </select>
  );
  const ActiveBadge = ({ u }: { u: User }) => (
    <span className={'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ' +
      (u.is_active ? 'bg-success-soft text-success' : 'bg-inset text-ink-2')}>
      <span className={'h-1.5 w-1.5 rounded-full ' + (u.is_active ? 'bg-success' : 'bg-ink-3')} aria-hidden />
      {u.is_active ? 'Active' : 'Deactivated'}
    </span>
  );
  const Actions = ({ u }: { u: User }) => u.id === me?.id ? (
    <Link href="/account" className="btn-ghost btn-sm">Change my password</Link>
  ) : (
    <div className="flex flex-wrap gap-1">
      <button onClick={() => setResetFor(u)} className="btn-neutral btn-sm">
        <Icon name="key" size={14} /> Reset password
      </button>
      <button onClick={() => toggle(u)} className={u.is_active ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}>
        {u.is_active ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        lead={<>{users ? `${users.length} total` : 'Loading…'} · Only admins can create users or change roles.</>}
      />

      <Section title="Create a new user">
        <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Username">
            <input className="input" placeholder="jsmith" value={form.username} autoCapitalize="none"
                   onChange={e => setForm({ ...form, username: e.target.value })} required />
          </Field>
          <Field label="Email">
            <input className="input" type="email" placeholder="jsmith@example.com"
                   value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Starting password">
            <input className="input" type="password" placeholder="At least 8 characters" autoComplete="new-password"
                   value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <Field label="First name">
            <input className="input" value={form.first_name}
                   onChange={e => setForm({ ...form, first_name: e.target.value })} />
          </Field>
          <Field label="Last name">
            <input className="input" value={form.last_name}
                   onChange={e => setForm({ ...form, last_name: e.target.value })} />
          </Field>
          <Field label="Department">
            <input className="input" value={form.department}
                   onChange={e => setForm({ ...form, department: e.target.value })} />
          </Field>
          <Field label="Role">
            <select className="input" value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="MEMBER">Member</option>
              <option value="HR">HR</option>
              <option value="ADMIN">Admin</option>
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-3">
            <button disabled={busy} className="btn-primary w-full sm:w-auto">
              <Icon name="users" size={16} /> Create user
            </button>
            {feedback && (
              <span aria-live="polite" className={'text-sm font-semibold ' +
                (feedback.startsWith('✓') ? 'text-success' : 'text-rose')}>
                {feedback}
              </span>
            )}
          </div>
        </form>
      </Section>

      <Section
        title="All users"
        actions={
          <div className="relative w-full sm:w-64">
            <Icon name="search" size={18}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={e => setQ(e.target.value)} aria-label="Search users"
                   placeholder="Search…" className="input pl-10" />
          </div>
        }
      >
        {!users && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        )}
        {users && list.length === 0 && (
          <Empty icon={<Icon name="users" size={22} />} title="No matches" hint="Try a different name or email." />
        )}
        {users && list.length > 0 && (<>
          {/* Below 1280px: one card per person (§20) */}
          <ul className="divide-y divide-line-2 xl:hidden">
            {list.map(u => (
              <li key={u.id} className="py-4 first:pt-1">
                <div className="flex items-start gap-3">
                  <Avatar name={u.full_name || u.username} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-bold text-ink">{u.full_name || u.username}</span>
                      <ActiveBadge u={u} />
                    </div>
                    <div className="truncate text-[13px] text-ink-2">@{u.username} · {u.email}</div>
                    <div className="text-[13px] text-ink-3">{u.department || 'No department'}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
                  <RoleSelect u={u} />
                  <Actions u={u} />
                </div>
              </li>
            ))}
          </ul>

          {/* 1280px and up: a table */}
          <div className="-mx-6 hidden xl:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr className="text-left">
                  <th className="th px-6 py-3">Name</th>
                  <th className="th px-3 py-3">Department</th>
                  <th className="th px-3 py-3">Role</th>
                  <th className="th px-3 py-3">Status</th>
                  <th className="th px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {list.map(u => (
                  <tr key={u.id} className="hover:bg-surface-2">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.full_name || u.username} size={32} />
                        <div className="min-w-0">
                          <div className="font-bold text-ink">{u.full_name || u.username}</div>
                          <div className="text-[13px] text-ink-2">@{u.username} · {u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{u.department || '—'}</td>
                    <td className="px-3 py-3"><RoleSelect u={u} /></td>
                    <td className="px-3 py-3"><ActiveBadge u={u} /></td>
                    <td className="px-6 py-3"><div className="flex justify-end [&>div]:flex-nowrap"><Actions u={u} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </Section>

      <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

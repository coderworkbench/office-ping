'use client';
import { useEffect, useMemo, useState } from 'react';
import { Guard } from '../../../components/Guard';
import { apiFetch } from '../../../lib/api';
import { Avatar, Empty, Icon, Section, Skeleton } from '../../../components/ui';

type User = {
  id: number; username: string; email: string; full_name: string;
  role: 'ADMIN' | 'HR' | 'MEMBER'; department: string; is_active: boolean;
};

export default function AdminUsersPage() {
  return <Guard requireRole={['ADMIN']}><Inner /></Guard>;
}

function Inner() {
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

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-slate-500">
          {users ? `${users.length} total` : 'Loading…'} · Only admins can create users or change roles.
        </p>
      </div>

      <Section title="Create a new user">
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Field label="Username">
            <input className="input" placeholder="jsmith" value={form.username}
                   onChange={e => setForm({ ...form, username: e.target.value })} required />
          </Field>
          <Field label="Email">
            <input className="input" type="email" placeholder="jsmith@example.com"
                   value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Password">
            <input className="input" type="password" placeholder="min 8 chars"
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
          <div className="md:col-span-3 flex items-center gap-3">
            <button disabled={busy} className="btn-primary">
              <Icon name="users" size={14} /> Create user
            </button>
            {feedback && (
              <span className={'text-sm ' +
                (feedback.startsWith('✓') ? 'text-green-700' : 'text-red-700')}>
                {feedback}
              </span>
            )}
          </div>
        </form>
      </Section>

      <Section
        title="All users"
        actions={
          <div className="relative w-56">
            <Icon name="search" size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search…" className="input pl-8 !py-1.5 text-sm" />
          </div>
        }
      >
        {!users && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        )}
        {users && list.length === 0 && (
          <Empty icon={<Icon name="users" size={20} />} title="No matches" />
        )}
        {users && list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Dept</th>
                  <th className="py-2 px-3">Role</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map(u => (
                  <tr key={u.id} className="border-b border-slate-50">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={u.full_name || u.username} size={26} />
                        <div>
                          <div className="font-medium">{u.full_name || u.username}</div>
                          <div className="text-xs text-slate-500">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{u.email}</td>
                    <td className="py-2 px-3 text-slate-600">{u.department || '—'}</td>
                    <td className="py-2 px-3">
                      <select value={u.role} onChange={e => changeRole(u, e.target.value as any)}
                              className="input !py-1 text-xs w-28">
                        <option value="MEMBER">MEMBER</option>
                        <option value="HR">HR</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <span className={'chip ' + (u.is_active
                        ? 'text-green-700 border-green-200 bg-green-50'
                        : 'text-slate-500')}>
                        <span className={'h-1.5 w-1.5 rounded-full ' + (u.is_active ? 'bg-green-500' : 'bg-slate-400')} />
                        {u.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button onClick={() => toggle(u)}
                              className="text-sm text-red-600 hover:underline">
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="label text-xs">{label}</span>
      {children}
    </label>
  );
}

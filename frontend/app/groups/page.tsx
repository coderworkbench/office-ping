'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { Avatar, Empty, Icon, Section, Skeleton } from '../../components/ui';

type Group = { id: number; name: string; description: string; member_count: number;
  members: { id: number; user: number; user_name: string }[] };
type User = { id: number; full_name: string };

export default function GroupsPage() {
  return <Guard requireRole={['ADMIN', 'HR']}><Inner /></Guard>;
}

function Inner() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const g = await apiFetch<any>('/api/groups/');
    setGroups(g.results || g);
  }
  useEffect(() => {
    load();
    apiFetch<any>('/api/users/').then(d => setUsers(d.results || d));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiFetch('/api/groups/', { method: 'POST',
        body: JSON.stringify({ name, description: desc }) });
      setName(''); setDesc(''); await load();
    } finally { setBusy(false); }
  }
  async function addMember(gid: number, uid: number) {
    await apiFetch(`/api/groups/${gid}/members/`, {
      method: 'POST', body: JSON.stringify({ user_id: uid }),
    });
    load();
  }
  async function removeMember(gid: number, uid: number) {
    await apiFetch(`/api/groups/${gid}/members/${uid}/`, { method: 'DELETE' });
    load();
  }
  async function del(gid: number) {
    if (!confirm('Delete this group?')) return;
    await apiFetch(`/api/groups/${gid}/`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
        <p className="text-sm text-slate-500">
          {groups ? `${groups.length} groups` : 'Loading…'} · Broadcast pings to teams at once.
        </p>
      </div>

      <Section title="Create a new group">
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
                 placeholder="e.g. Backend Team" className="input" required />
          <input value={desc} onChange={e => setDesc(e.target.value)}
                 placeholder="Short description (optional)" className="input" />
          <button disabled={busy} className="btn-primary">
            <Icon name="group" size={14} /> Create
          </button>
        </form>
      </Section>

      {!groups && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      )}

      {groups && groups.length === 0 && (
        <Section>
          <Empty icon={<Icon name="group" size={20} />}
                 title="No groups yet"
                 hint="Create one above to start broadcasting." />
        </Section>
      )}

      {groups && groups.length > 0 && (
        <ul className="space-y-3">
          {groups.map(g => (
            <li key={g.id} className="card p-4 animate-fadeIn">
              <header className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-lg bg-brand/10 text-brand grid place-items-center">
                  <Icon name="group" size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-slate-500">
                    {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                    {g.description ? ` · ${g.description}` : ''}
                  </div>
                </div>
                <button onClick={() => del(g.id)}
                        className="text-sm text-red-600 hover:underline">Delete</button>
              </header>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.members.map(m => (
                  <span key={m.id} className="chip pr-1">
                    <Avatar name={m.user_name} size={18} />
                    <span>{m.user_name}</span>
                    <button onClick={() => removeMember(g.id, m.user)}
                            className="ml-0.5 h-5 w-5 rounded-full hover:bg-red-100 text-red-500 grid place-items-center"
                            aria-label={`Remove ${m.user_name}`}>×</button>
                  </span>
                ))}
                {g.members.length === 0 && (
                  <span className="text-xs text-slate-400">No members yet.</span>
                )}
              </div>

              <div className="mt-3">
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) { addMember(g.id, Number(e.target.value)); e.target.value = ''; } }}
                  className="input md:w-72">
                  <option value="">+ Add member…</option>
                  {users.filter(u => !g.members.some(m => m.user === u.id))
                    .map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

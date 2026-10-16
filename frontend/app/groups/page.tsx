'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { Avatar, Empty, Icon, PageHeader, Section, Skeleton } from '../../components/ui';

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
      <PageHeader
        eyebrow="Broadcast"
        title="Groups"
        lead={<>{groups ? `${groups.length} groups` : 'Loading…'} · Ping a whole team at once.</>}
      />

      <Section title="Create a new group">
        <form onSubmit={create} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
          <input value={name} onChange={e => setName(e.target.value)} aria-label="Group name"
                 placeholder="e.g. Backend Team" className="input" required />
          <input value={desc} onChange={e => setDesc(e.target.value)} aria-label="Description"
                 placeholder="Short description (optional)" className="input" />
          <button disabled={busy} className="btn-primary min-h-[44px]">
            <Icon name="group" size={16} /> Create
          </button>
        </form>
      </Section>

      {!groups && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      )}

      {groups && groups.length === 0 && (
        <Section>
          <Empty icon={<Icon name="group" size={22} />}
                 title="No groups yet"
                 hint="Create one above to start broadcasting." />
        </Section>
      )}

      {groups && groups.length > 0 && (
        <ul className="space-y-3">
          {groups.map(g => (
            <li key={g.id} className="surface p-4 sm:p-5 animate-fadeIn">
              <header className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-inset text-brand">
                  <Icon name="group" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-ink">{g.name}</h2>
                  <div className="text-[13px] text-ink-2">
                    {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                    {g.description ? ` · ${g.description}` : ''}
                  </div>
                </div>
                <button onClick={() => del(g.id)} className="btn-danger btn-sm -mr-2">Delete</button>
              </header>

              <div className="mt-3 flex flex-wrap gap-2">
                {g.members.map(m => (
                  <span key={m.id} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-inset py-0.5 pl-1 pr-0.5 text-[13px] font-semibold text-ink-2">
                    <Avatar name={m.user_name} size={22} />
                    <span className="truncate">{m.user_name}</span>
                    <button onClick={() => removeMember(g.id, m.user)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-base text-ink-3 hover:bg-rose-soft hover:text-rose [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                            aria-label={`Remove ${m.user_name} from ${g.name}`}>×</button>
                  </span>
                ))}
                {g.members.length === 0 && (
                  <span className="text-[13px] text-ink-3">No members yet.</span>
                )}
              </div>

              <div className="mt-3">
                <select
                  defaultValue=""
                  aria-label={`Add a member to ${g.name}`}
                  onChange={e => { if (e.target.value) { addMember(g.id, Number(e.target.value)); e.target.value = ''; } }}
                  className="input sm:w-72">
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

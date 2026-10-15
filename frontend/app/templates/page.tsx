'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { Empty, Icon, Section, Skeleton } from '../../components/ui';

type T = { id: number; title: string; message: string };

export default function TemplatesPage() {
  return <Guard requireRole={['ADMIN', 'HR']}><Inner /></Guard>;
}

function Inner() {
  const [items, setItems] = useState<T[] | null>(null);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await apiFetch<any>('/api/templates/');
    setItems(d.results || d);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/templates/', { method: 'POST',
        body: JSON.stringify({ title, message: msg }) });
      setTitle(''); setMsg(''); await load();
    } finally { setBusy(false); }
  }
  async function del(id: number) {
    if (!confirm('Delete this template?')) return;
    await apiFetch(`/api/templates/${id}/`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="text-sm text-slate-500">
          {items ? `${items.length} templates` : 'Loading…'} ·
          {' '}Reusable messages your team can send with one click.
        </p>
      </div>

      <Section title="Add a template">
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
          <input value={title} onChange={e => setTitle(e.target.value)}
                 placeholder="Short title" className="input" required />
          <input value={msg} onChange={e => setMsg(e.target.value)}
                 placeholder="Message body (what the recipient will see)"
                 className="input" required />
          <button disabled={busy} className="btn-primary">
            <Icon name="send" size={14} /> Add
          </button>
        </form>
      </Section>

      {!items && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) =>
            <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <Section>
          <Empty title="No templates yet"
                 hint="Add common messages so pings go out faster." />
        </Section>
      )}

      {items && items.length > 0 && (
        <Section title={`${items.length} templates`}>
          <ul className="divide-y divide-slate-100">
            {items.map(t => (
              <li key={t.id} className="py-3 flex items-start gap-3">
                <span className="h-9 w-9 rounded-lg bg-brand/10 text-brand grid place-items-center shrink-0">
                  <Icon name="send" size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-sm text-slate-600 break-words">{t.message}</div>
                </div>
                <button onClick={() => del(t.id)}
                        className="text-sm text-red-600 hover:underline">Delete</button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

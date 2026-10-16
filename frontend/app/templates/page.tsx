'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { Empty, Icon, PageHeader, Section, Skeleton } from '../../components/ui';

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
      <PageHeader
        eyebrow="Broadcast"
        title="Templates"
        lead={<>{items ? `${items.length} templates` : 'Loading…'} · Ready-made messages everyone can send with one click.</>}
      />

      <Section title="Add a template">
        <form onSubmit={create} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
          <input value={title} onChange={e => setTitle(e.target.value)} aria-label="Short title"
                 placeholder="Short title" className="input" required />
          <input value={msg} onChange={e => setMsg(e.target.value)} aria-label="Message"
                 placeholder="Message body (what the recipient will see)"
                 className="input" required />
          <button disabled={busy} className="btn-primary min-h-[44px]">
            <Icon name="send" size={16} /> Add
          </button>
        </form>
      </Section>

      {!items && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) =>
            <Skeleton key={i} className="h-14 rounded-2xl" />)}
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
          <ul className="divide-y divide-line-2">
            {items.map(t => (
              <li key={t.id} className="flex items-start gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-inset text-brand">
                  <Icon name="send" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-ink">{t.title}</div>
                  <div className="break-words text-[13px] text-ink-2">{t.message}</div>
                </div>
                <button onClick={() => del(t.id)} className="btn-danger btn-sm -mr-2">Delete</button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

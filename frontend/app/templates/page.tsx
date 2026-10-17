'use client';
import { useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch, apiErrorMessage } from '../../lib/api';
import { invalidate } from '../../lib/useApi';
import { HOME_TEMPLATES_MAX, Template as T } from '../../lib/templates';
import { Empty, Icon, PageHeader, Section, Skeleton } from '../../components/ui';

export default function TemplatesPage() {
  return <Guard requireRole={['ADMIN', 'HR']}><Inner /></Guard>;
}

function Inner() {
  const [items, setItems] = useState<T[] | null>(null);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const d = await apiFetch<any>('/api/templates/');
    setItems(d.results || d);
    invalidate('/api/templates/');   // the composers pick up the change
  }
  async function toggleHome(t: T) {
    setError(null);
    try {
      await apiFetch(`/api/templates/${t.id}/`, { method: 'PATCH',
        body: JSON.stringify({ show_on_home: !t.show_on_home }) });
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not change it. Try again.'));
    }
  }
  const onHome = (items || []).filter(t => t.show_on_home).length;
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
          <p className="mb-2 text-sm text-ink-2">
            Turn on <b className="text-ink">Home screen</b> for up to {HOME_TEMPLATES_MAX} templates to show them as
            quick buttons on everyone’s Overview ({onHome} of {HOME_TEMPLATES_MAX} chosen
            {onHome === 0 ? '; until you choose, the first three are shown' : ''}). All templates stay available
            in Quick ping (Ctrl + K) and when pinging from People.
          </p>
          {error && <p role="alert" className="mb-2 rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose-deep">{error}</p>}
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
                <HomeToggle on={!!t.show_on_home} full={onHome >= HOME_TEMPLATES_MAX}
                            onClick={() => toggleHome(t)} />
                <button onClick={() => del(t.id)} className="btn-danger btn-sm -mr-2">Delete</button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// A labelled switch. When three are already on, the others explain why they can't turn on.
function HomeToggle({ on, full, onClick }: { on: boolean; full: boolean; onClick: () => void }) {
  const blocked = full && !on;
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} disabled={blocked}
            title={blocked ? `Already ${HOME_TEMPLATES_MAX} on the home screen. Turn one off first.` : on ? 'Shown on the home screen' : 'Show on the home screen'}
            className="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] font-semibold text-ink-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] sm:min-h-0">
      <span className={'relative h-5 w-9 rounded-full transition-colors ' + (on ? 'bg-gold-fill' : 'bg-line')} aria-hidden>
        <span className={'absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all ' + (on ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span className="hidden sm:inline">Home screen</span>
      <span className="sm:hidden">Home</span>
    </button>
  );
}

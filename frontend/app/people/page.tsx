'use client';
import { useEffect, useMemo, useState } from 'react';
import { Guard } from '../../components/Guard';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Avatar, Empty, Icon, PageHeader, Section, Skeleton } from '../../components/ui';
import { PingDialog } from '../../components/PingDialog';

type Person = {
  id: number; full_name: string; department: string; designation: string;
  is_online: boolean;
};

const NUDGE_MESSAGE = '👋 Nudge';

export default function PeoplePage() { return <Guard><Inner /></Guard>; }

function Inner() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dialogTarget, setDialogTarget] = useState<Person | null>(null);

  useEffect(() => {
    apiFetch<any>('/api/users/').then(d => setPeople(d.results || d));
  }, []);

  const list = useMemo(() => {
    if (!people) return [];
    const needle = q.toLowerCase();
    return people
      .filter(p => p.id !== user?.id)
      .filter(p =>
        p.full_name.toLowerCase().includes(needle)
        || (p.department || '').toLowerCase().includes(needle)
      )
      .sort((a, b) => Number(b.is_online) - Number(a.is_online));
  }, [people, q, user?.id]);

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  }

  async function nudge(p: Person) {
    setBusyId(p.id);
    try {
      await apiFetch('/api/pings/', {
        method: 'POST',
        body: JSON.stringify({ recipient: p.id, message: NUDGE_MESSAGE }),
      });
      flash(`Nudged ${p.full_name} ·`);
    } catch (e: any) {
      flash(String(e.message).toLowerCase().includes('throttl')
        ? 'Easy — rate limited.'
        : `Couldn't reach ${p.full_name}`);
    } finally { setBusyId(null); }
  }

  const online = list.filter(p => p.is_online).length;

  return (
    <div className="animate-slideIn">
      <PageHeader
        eyebrow="The office"
        title="Who's here?"
        lead={people ? (
          <>{list.length} teammates on your floor · <span className="font-semibold text-success">{online} online</span></>
        ) : 'Loading…'}
        actions={
          <div className="relative w-full sm:w-72">
            <Icon name="search" size={20}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search by name or team…" aria-label="Search people"
                   className="input pl-11" />
          </div>
        }
      />

      {feedback && (
        <div aria-live="polite" className="mb-4 inline-flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success animate-slideIn">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
          {feedback}
        </div>
      )}

      <Section surface>
        {!people && (
          <ul className="divide-y divide-line-2">
            {Array.from({ length: 4 }).map((_, i) =>
              <li key={i} className="py-3 flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-8 w-20 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </li>
            )}
          </ul>
        )}
        {people && list.length === 0 && (
          <Empty icon={<Icon name="users" size={20} />} title="Nobody matched"
                 hint="Try a different name or clear the search." />
        )}
        {people && list.length > 0 && (
          <ul className="divide-y divide-line-2">
            {list.map(p => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <Avatar name={p.full_name} size={40} online={p.is_online} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-ink">{p.full_name}</div>
                  <div className="truncate text-[13px] text-ink-2">
                    {/* status lives here on phones; its own column from sm up */}
                    <span className={'sm:hidden ' + (p.is_online ? 'font-semibold text-success' : 'text-ink-3')}>
                      {p.is_online ? 'Online' : 'Offline'} ·{' '}
                    </span>
                    {p.department || '—'}
                    {p.designation ? ` · ${p.designation}` : ''}
                  </div>
                </div>
                <span className={'hidden w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide sm:block ' +
                  (p.is_online ? 'text-success' : 'text-ink-3')}>
                  {p.is_online ? 'Online' : 'Offline'}
                </span>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    disabled={busyId === p.id}
                    onClick={() => nudge(p)}
                    title="Send a quick nudge — no message"
                    aria-label={`Nudge ${p.full_name}`}
                    className="btn-ghost btn-sm !px-2.5 sm:!px-3.5"
                  >
                    Nudge
                  </button>
                  <button
                    onClick={() => setDialogTarget(p)}
                    title="Write a message"
                    aria-label={`Ping ${p.full_name}`}
                    className="btn-secondary btn-sm"
                  >
                    <span className="hidden sm:inline-flex"><Icon name="send" size={14} /></span> Ping
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <PingDialog
        open={!!dialogTarget}
        recipientId={dialogTarget?.id || 0}
        recipientName={dialogTarget?.full_name || ''}
        recipientIsOnline={dialogTarget?.is_online}
        defaultMessage="Please come here"
        onClose={() => setDialogTarget(null)}
        onSent={() => flash(`Sent to ${dialogTarget?.full_name}`)}
      />
    </div>
  );
}

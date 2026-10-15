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
        title={<>Who's <span className="italic font-normal">here</span>?</>}
        lead={people ? (
          <>{list.length} teammates on your floor · <span className="text-jade-500 font-medium">{online} online</span></>
        ) : 'Loading…'}
        actions={
          <div className="relative w-64 max-w-full">
            <Icon name="search" size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-inkmute" />
            <input value={q} onChange={e => setQ(e.target.value)}
                   placeholder="Search by name or team…"
                   className="input pl-9" />
          </div>
        }
      />

      {feedback && (
        <div className="mb-4 text-sm text-ink inline-flex items-center gap-2 bg-ember/5 border border-ember/20 rounded-tool px-3 py-1.5 animate-slideIn">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          {feedback}
        </div>
      )}

      <Section surface>
        {!people && (
          <ul className="divide-y divide-hairline">
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
          <ul className="divide-y divide-hairline">
            {list.map(p => (
              <li key={p.id} className="py-3 flex items-center gap-3">
                <Avatar name={p.full_name} size={40} online={p.is_online} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.full_name}</div>
                  <div className="text-xs text-inkmute truncate">
                    {p.department || '—'}
                    {p.designation ? ` · ${p.designation}` : ''}
                  </div>
                </div>
                <span className={'text-[11px] uppercase tracking-wider mr-3 ' +
                  (p.is_online ? 'text-jade-500' : 'text-inkmute')}>
                  {p.is_online ? 'Online' : 'Offline'}
                </span>

                <button
                  disabled={busyId === p.id}
                  onClick={() => nudge(p)}
                  title="Send a quick nudge — no message"
                  className="btn-outline !py-2"
                >
                  Nudge
                </button>

                <button
                  onClick={() => setDialogTarget(p)}
                  title="Write a message"
                  className="btn-ember !py-2"
                >
                  <Icon name="send" size={14} /> Ping
                </button>
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

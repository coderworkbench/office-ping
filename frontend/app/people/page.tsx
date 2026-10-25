'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Guard } from '../../components/Guard';
import { apiErrorMessage, apiFetch, pingErrorMessage } from '../../lib/api';
import { startChat } from '../../lib/chat';
import { useAuth } from '../../lib/auth';
import { listOf, useApi } from '../../lib/useApi';
import { NudgeHint } from '../../components/NudgeHint';
import { describeStatus, Status } from '../../lib/status';
import { Avatar, Empty, Icon, PageHeader, Section, Skeleton } from '../../components/ui';
import { PingDialog } from '../../components/PingDialog';

type Person = {
  id: number; full_name: string; department: string; designation: string;
  is_online: boolean;
  status: Status | null;
};

const NUDGE_MESSAGE = '👋 Nudge';

export default function PeoplePage() { return <Guard><Inner /></Guard>; }

function Inner() {
  const { user } = useAuth();
  const { data } = useApi('/api/users/', { intervalMs: 30000 });
  const people: Person[] | null = data ? listOf<Person>(data) : null;
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [dialogTarget, setDialogTarget] = useState<Person | null>(null);
  const router = useRouter();

  async function message(p: Person) {
    try { await startChat(p.id, url => router.push(url)); }
    catch (e) { flash(apiErrorMessage(e, `Couldn't open a chat with ${p.full_name}`), false); }
  }

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

  function flash(text: string, ok = true) {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(null), ok ? 3500 : 6000);
  }

  async function nudge(p: Person) {
    setBusyId(p.id);
    try {
      await apiFetch('/api/pings/', {
        method: 'POST',
        body: JSON.stringify({ recipient: p.id, message: NUDGE_MESSAGE }),
      });
      flash(`Nudged ${p.full_name}`);
      window.dispatchEvent(new Event('op:sent'));
    } catch (e: any) {
      flash(pingErrorMessage(e, `Couldn't reach ${p.full_name}`), false);
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
        <div aria-live="polite" className={'mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold animate-slideIn ' +
          (feedback.ok ? 'bg-success-soft text-success' : 'bg-rose-soft text-rose-deep')}>
          <span className={'h-1.5 w-1.5 rounded-full ' + (feedback.ok ? 'bg-success' : 'bg-rose')} aria-hidden />
          {feedback.text}
        </div>
      )}

      <Section surface>
        <NudgeHint className="mb-2" />
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
                    <span className={'sm:hidden font-semibold ' + (p.is_online ? 'text-success' : 'text-ink-2')}>
                      {p.is_online ? 'Online' : 'Offline'} ·{' '}
                    </span>
                    {p.department || '—'}
                    {p.designation ? ` · ${p.designation}` : ''}
                  </div>
                  {p.status && (
                    <div className={'mt-0.5 truncate text-[13px] font-semibold ' + (p.status.quiet ? 'text-rose-deep' : 'text-warn')}>
                      {describeStatus(p.status, { emoji: true })}
                    </div>
                  )}
                </div>
                <span className={'hidden w-16 shrink-0 text-[13px] font-semibold sm:block ' +
                  (p.is_online ? 'text-success' : 'text-ink-2')}>
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
                    onClick={() => message(p)}
                    title="Chat quietly: no pop-up"
                    aria-label={`Message ${p.full_name}`}
                    className="btn-ghost btn-sm !px-2.5 sm:!px-3.5"
                  >
                    <Icon name="chat" size={16} /><span className="hidden sm:inline">Message</span>
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

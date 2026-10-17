'use client';

// The Overview on a phone (<640px): the whole "send a ping" flow on one
// screen, no scrolling. It fills the space between the top bar and the tab
// bar, and its Send bar stays above the on-screen keyboard.
//
//   search (with Person / Group inside) · recent avatars · the three quick
//   messages chosen for the home screen · a small message box · Urgent + Send,
//   kept together at the top. While you type a message the avatar row steps
//   aside to make room for the keyboard.
//
// Tap an avatar to choose it; long-press it to send a 👋 Nudge straight away.
// Sending with an empty message to a person also sends a Nudge.

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, pingErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { listOf, useApi } from '../lib/useApi';
import { describeStatus, Status, statusEmoji } from '../lib/status';
import { Avatar, Icon } from './ui';
import { NotificationPermissionBanner } from './NotificationPermissionBanner';
import { homeTemplates, Template } from '../lib/templates';

type Person = {
  id: number; full_name: string; department?: string; email?: string;
  is_online: boolean; status: Status | null;
};
type Group = { id: number; name: string; member_count: number };
type Mode = 'user' | 'group';

const NUDGE = '👋 Nudge';
const LONG_PRESS_MS = 550;
const MAX_RECENT = 8;

export function MobileHome() {
  const { user } = useAuth();
  const canGroup = !!user && user.role !== 'MEMBER';
  const people = listOf<Person>(useApi('/api/users/', { intervalMs: 60000 }).data)
    .filter(p => p.id !== user?.id);
  const sent = listOf<any>(useApi('/api/pings/?scope=sent',
    { refreshOn: ['op:sent', 'op:ping_status'], intervalMs: 30000 }).data);
  const templates = homeTemplates(listOf<Template>(useApi('/api/templates/').data));
  const groups = listOf<Group>(useApi(canGroup ? '/api/groups/' : null).data);

  const [mode, setMode] = useState<Mode>('user');
  const [target, setTarget] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const keyboard = useKeyboardInset();

  // People you pinged lately, then teammates (online first), so there's
  // always someone to tap.
  const recent = useMemo(() => {
    const byId = new Map(people.map(p => [p.id, p]));
    const out: Person[] = [];
    const add = (u?: Person) => { if (u && !out.includes(u) && out.length < MAX_RECENT) out.push(u); };
    for (const p of sent) add(p.recipient && byId.get(p.recipient));
    people.filter(p => p.is_online).forEach(add);
    people.forEach(add);
    // Someone picked through search goes first, without reshuffling the others.
    const picked = mode === 'user' && target ? byId.get(target) : undefined;
    if (picked && !out.includes(picked)) out.splice(MAX_RECENT - 1, 1), out.unshift(picked);
    return out;
  }, [people, sent, mode, target]);

  const person = mode === 'user' ? people.find(p => p.id === target) : undefined;
  const group = mode === 'group' ? groups.find(g => g.id === target) : undefined;
  const targetName = person?.full_name || group?.name || '';

  const needle = query.trim().toLowerCase();
  const results = mode === 'user'
    ? people.filter(p => !needle || [p.full_name, p.department, p.email].some(v => (v || '').toLowerCase().includes(needle)))
    : groups.filter(g => !needle || g.name.toLowerCase().includes(needle));

  function flash(text: string, ok: boolean) {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(f => (f?.text === text ? null : f)), ok ? 3500 : 6000);
  }

  function choose(id: number) {
    setTarget(id);
    setQuery('');
    setSearching(false);
    searchRef.current?.blur();
  }

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m); setTarget(null); setQuery('');
  }

  async function send(opts: { to?: number; nudge?: boolean } = {}) {
    if (busy) return;
    const to = opts.to ?? target;
    const text = opts.nudge ? '' : message.trim();
    if (!to) { flash(mode === 'group' ? 'Pick a group first.' : 'Pick someone first.', false); searchRef.current?.focus(); return; }
    if (!text && mode === 'group') { flash('Write a message for the group.', false); return; }
    if (!text && urgent && !opts.nudge) { flash('Write what’s urgent, or turn Urgent off to nudge.', false); return; }
    const name = (mode === 'user' ? people.find(p => p.id === to)?.full_name : group?.name) || 'them';
    setBusy(true);
    try {
      await apiFetch('/api/pings/', {
        method: 'POST',
        body: JSON.stringify({
          message: text || NUDGE,
          priority: urgent && !opts.nudge ? 'URGENT' : 'NORMAL',
          template: text ? templateId : null,
          ...(mode === 'user' ? { recipient: to } : { group: to }),
        }),
      });
      flash(text ? `Sent to ${name} ✓` : `Nudged ${name} 👋`, true);
      if (text) { setMessage(''); setTemplateId(null); setUrgent(false); }
      navigator.vibrate?.(30);
      window.dispatchEvent(new Event('op:sent'));
    } catch (e) {
      flash(pingErrorMessage(e, 'Could not send. Try again.'), false);
    } finally { setBusy(false); }
  }

  const empty = !message.trim();
  const sendLabel = busy ? 'Sending…' : empty && mode === 'user' && !urgent ? 'Nudge' : 'Send';

  return (
    <div className="op-mobile-home flex flex-col gap-2.5 bg-page px-4 pb-2 pt-3"
         style={keyboard ? { bottom: keyboard } : undefined}>
      <NotificationPermissionBanner compact />
      {user?.status && (
        <p className="truncate rounded-xl bg-surface px-3 py-2 text-[13px] text-ink-2 ring-1 ring-line">
          You: <span className="font-semibold text-ink">{describeStatus(user.status, { emoji: true })}</span>
        </p>
      )}

      {/* WHO: search with Person / Group inside */}
      <div className="relative" data-tour="composer-search">
        <div className="flex h-11 items-center rounded-xl border border-line bg-surface shadow-sm focus-within:border-gold-fill focus-within:ring-2 focus-within:ring-gold-fill/40">
          <Icon name="search" size={18} className="ml-3 shrink-0 text-ink-3" />
          <input
            ref={searchRef}
            value={searching ? query : targetName}
            onChange={e => { setQuery(e.target.value); setSearching(true); }}
            onFocus={() => { setSearching(true); setQuery(''); }}
            onBlur={() => setTimeout(() => setSearching(false), 150)}
            placeholder="Search"
            aria-label={mode === 'user' ? 'Who should get this?' : 'Which group?'}
            className={'h-full min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-ink-3 focus-visible:!shadow-none ' +
              (!searching && targetName ? 'font-semibold text-ink' : 'text-ink')}
          />
          {!searching && target && (
            <button type="button" onClick={() => setTarget(null)} aria-label="Clear"
                    className="grid h-11 w-9 shrink-0 place-items-center text-lg text-ink-3">×</button>
          )}
          {canGroup && (
            <div role="group" aria-label="Send to" data-tour="composer-mode"
                 className="mr-1 flex shrink-0 gap-0.5 rounded-lg bg-inset p-0.5">
              {(['user', 'group'] as const).map(m => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => switchMode(m)}
                        className={'h-8 rounded-md px-2 text-[13px] font-semibold ' +
                          (mode === m ? 'bg-surface text-brand shadow-sm' : 'text-ink-2')}>
                  {m === 'user' ? 'Person' : 'Group'}
                </button>
              ))}
            </div>
          )}
        </div>

        {searching && (
          <ul role="listbox" aria-label="Matches"
              className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-[50dvh] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
            {results.length === 0 && <li className="px-3 py-3 text-sm text-ink-2">No matches</li>}
            {results.map((r: any) => (
              <li key={r.id}>
                <button type="button" role="option" aria-selected={target === r.id}
                        onMouseDown={e => e.preventDefault()} onClick={() => choose(r.id)}
                        className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2.5 text-left active:bg-inset">
                  {mode === 'user'
                    ? <Avatar name={r.full_name} size={32} online={r.is_online} />
                    : <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-brand"><Icon name="group" size={16} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{r.full_name || r.name}</span>
                    <span className="block truncate text-xs text-ink-2">
                      {mode === 'group' ? `${r.member_count} people`
                        : r.status ? describeStatus(r.status, { emoji: true }) : (r.department || (r.is_online ? 'Online' : 'Offline'))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent people (or groups): tap to choose, long-press to nudge */}
      <ul className="op-recent no-scrollbar -mx-4 flex shrink-0 gap-3 overflow-x-auto px-4" data-tour="composer-recent"
          aria-label={mode === 'user' ? 'Recent people' : 'Groups'}>
        {mode === 'user' ? recent.map(p => (
          <li key={p.id}>
            <AvatarButton
              name={p.full_name} online={p.is_online} status={p.status}
              selected={target === p.id}
              onTap={() => setTarget(target === p.id ? null : p.id)}
              onLongPress={() => send({ to: p.id, nudge: true })}
            />
          </li>
        )) : groups.map(g => (
          <li key={g.id}>
            <AvatarButton name={g.name} group selected={target === g.id}
                          onTap={() => setTarget(target === g.id ? null : g.id)} />
          </li>
        ))}
        <li>
          <button type="button" onClick={() => searchRef.current?.focus()} aria-label="Find someone else"
                  className="flex w-14 flex-col items-center gap-1">
            <span className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-ink-3/60 text-xl text-ink-2">+</span>
            <span className="text-xs text-ink-2">More</span>
          </button>
        </li>
      </ul>

      {person?.status && (
        <p className="shrink-0 rounded-lg bg-warn-soft px-3 py-1.5 text-[13px] leading-snug text-ink">
          {person.full_name.split(' ')[0]} is {describeStatus(person.status).replace(/^./, c => c.toLowerCase())}
          {person.status.quiet ? '. Normal pings wait quietly.' : '.'}
        </p>
      )}

      {/* The (up to) three quick messages chosen for the home screen, in small type. */}
      {templates.length > 0 && (
        <div role="group" aria-label="Quick messages" data-tour="composer-templates"
             className="flex shrink-0 flex-wrap gap-1.5">
          {templates.map(t => (
            <button key={t.id} type="button" aria-pressed={templateId === t.id}
                    onClick={() => { setTemplateId(t.id); setMessage(t.message); }}
                    className={'chip-btn !min-h-[32px] max-w-full !px-2.5 !py-1 !text-xs ' + (templateId === t.id ? 'is-active' : '')}>
              <span className="truncate">{t.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Message: two or three lines; gives way when the keyboard needs room. */}
      <div className="relative min-h-[56px] shrink basis-[84px]">
        <textarea value={message} maxLength={500}
                  onChange={e => { setMessage(e.target.value); setTemplateId(null); }}
                  placeholder={mode === 'user' ? 'Message… (leave empty to send a 👋 Nudge)' : 'Message for the group…'}
                  aria-label="Message"
                  className="input h-full resize-none !py-2 pb-5" />
        <span className="pointer-events-none absolute bottom-1.5 right-3 text-[11px] tabular-nums text-ink-3">{message.length}/500</span>
      </div>

      {feedback && (
        <p aria-live="polite" className={'shrink-0 truncate text-sm font-semibold ' + (feedback.ok ? 'text-success' : 'text-rose-deep')}>
          {feedback.text}
        </p>
      )}

      {/* Urgent + Send */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <label data-tour="composer-urgent"
               className={'inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold ' +
                 (urgent ? 'text-rose-deep' : 'text-ink-2')}>
          <input type="checkbox" className="peer sr-only" checked={urgent}
                 onChange={e => setUrgent(e.target.checked)} />
          <span aria-hidden className={'relative h-5 w-9 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-gold-fill ' + (urgent ? 'bg-live' : 'bg-line')}>
            <span className={'absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all ' + (urgent ? 'left-[18px]' : 'left-0.5')} />
          </span>
          ⚡ Urgent
        </label>
        <button type="button" onClick={() => send()} disabled={busy} data-tour="composer-send"
                className="btn-primary !min-h-[40px] h-10 rounded-full px-5 text-[15px]">
          {sendLabel} <Icon name="send" size={15} />
        </button>
      </div>
    </div>
  );
}

// A round avatar with the first name below. Long-press support is optional.
function AvatarButton({ name, online, status, selected, group, onTap, onLongPress }: {
  name: string; online?: boolean; status?: Status | null; selected: boolean; group?: boolean;
  onTap: () => void; onLongPress?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = () => {
    if (!onLongPress) return;
    fired.current = false;
    timer.current = setTimeout(() => { fired.current = true; navigator.vibrate?.(40); onLongPress(); }, LONG_PRESS_MS);
  };
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const first = group ? name : name.split(' ')[0];
  return (
    <button type="button" aria-pressed={selected}
            aria-label={`${name}${status ? ', ' + describeStatus(status) : ''}${onLongPress ? '. Long-press to nudge' : ''}`}
            onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
            onContextMenu={e => e.preventDefault()}
            onClick={() => { if (fired.current) { fired.current = false; return; } onTap(); }}
            className="flex w-14 select-none flex-col items-center gap-1 [-webkit-touch-callout:none]">
      <span className={'relative rounded-full transition-shadow ' + (selected ? 'ring-[3px] ring-gold-fill ring-offset-2 ring-offset-page' : '')}>
        {group
          ? <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-brand"><Icon name="group" size={20} /></span>
          : <Avatar name={name} size={44} online={online} />}
        {status && <span className="absolute -right-1 -top-1 text-sm" aria-hidden>{statusEmoji(status)}</span>}
      </span>
      <span className={'w-full truncate text-center text-xs ' + (selected ? 'font-bold text-ink' : 'text-ink-2')}>{first}</span>
    </button>
  );
}

// Height of the on-screen keyboard where the browser overlays it (iOS), so
// the Send bar can sit above it. 0 where the page is resized instead.
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);
  return inset;
}

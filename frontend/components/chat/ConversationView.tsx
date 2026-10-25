'use client';

// One conversation: header, messages and composer. Used by the desktop dock's
// small windows (variant "window") and the /messages page (variant "page").

import { Fragment, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  EMPTY_THREAD, discardMessage, loadOlder, loadThread, markRead, retryMessage,
  sendMessage, sendTyping, setFocused, setMuted, useChat, windowActive,
} from '../../lib/chat';
import { PingDialog } from '../PingDialog';
import { Avatar, Icon } from '../ui';
import { clockTime, dayLabel, linkify, presenceLine } from './format';

type IconName = Parameters<typeof Icon>[0]['name'];

export function ConversationView({ id, variant, onBack, onMinimize, onClose }: {
  id: number; variant: 'window' | 'page';
  onBack?: () => void; onMinimize?: () => void; onClose?: () => void;
}) {
  const { conversations, threads, typing, me } = useChat();
  const conv = conversations?.find(c => c.id === id);
  const t = threads[id] || EMPTY_THREAD;
  const isTyping = (typing[id] || 0) > Date.now();
  const [pingOpen, setPingOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const olderFrom = useRef<number | null>(null);   // scrollHeight before older messages were added

  useEffect(() => { if (!t.loaded) loadThread(id).catch(() => {}); }, [id, t.loaded]);
  useEffect(() => { setFocused(id, true); return () => setFocused(id, false); }, [id]);

  // On screen and unread: mark the newest message read (again when the tab or window comes back).
  const newest = t.messages[t.messages.length - 1];
  const unread = conv?.unread || 0;
  useEffect(() => {
    if (!unread || !newest) return;
    const read = () => { if (windowActive()) markRead(id, newest.id); };
    read();
    document.addEventListener('visibilitychange', read);
    window.addEventListener('focus', read);
    return () => {
      document.removeEventListener('visibilitychange', read);
      window.removeEventListener('focus', read);
    };
  }, [id, unread, newest]);

  // Stay on the newest message unless they scrolled up; keep the view still
  // when older messages are added above.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (olderFrom.current !== null) {
      el.scrollTop += el.scrollHeight - olderFrom.current;
      olderFrom.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [t.messages, t.pending, isTyping]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (el.scrollTop < 40 && t.hasMore && !t.loadingOlder) {
      olderFrom.current = el.scrollHeight;
      loadOlder(id).then(ok => { if (!ok) olderFrom.current = null; });
    }
  }

  if (!conv) return <div className="grid flex-1 place-items-center p-6 text-sm text-ink-3">Loading…</div>;

  const other = conv.other;
  const firstName = other.full_name.split(' ')[0];
  const lastMine = [...t.messages].reverse().find(m => m.sender_id === me);
  const seen = !!lastMine && (conv.other_last_read_id || 0) >= lastMine.id && !t.pending.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line px-2">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to chats"
                  className={'grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-inset ' +
                    (variant === 'page' ? 'lg:hidden' : '')}>
            <Icon name="back" size={20} />
          </button>
        )}
        <Avatar name={other.full_name} size={34} online={other.is_online} />
        <div className="min-w-0 flex-1 pl-1">
          <div className="truncate text-[15px] font-bold text-ink">{other.full_name}</div>
          <div className={'truncate text-xs ' + (other.status?.quiet ? 'font-semibold text-rose-deep' : 'text-ink-2')}>
            {presenceLine(other)}
          </div>
        </div>
        {other.is_active && (
          <button type="button" onClick={() => setPingOpen(true)}
                  title="Send a ping: a pop-up they have to acknowledge"
                  className="btn-secondary btn-sm shrink-0 !px-2.5">
            <Icon name="bell" size={14} /> Ping
          </button>
        )}
        <IconButton label={conv.muted ? 'Turn notifications on for this chat' : 'Mute this chat'}
                    icon={conv.muted ? 'bellOff' : 'bell'} onClick={() => setMuted(id, !conv.muted)} />
        {onMinimize && <IconButton label="Minimise" icon="minus" onClick={onMinimize} />}
        {onClose && <IconButton label="Close chat" icon="x" onClick={onClose} />}
      </header>

      <div ref={scroller} onScroll={onScroll} role="log" aria-label={`Conversation with ${other.full_name}`}
           className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        {t.loadingOlder && <p className="py-2 text-center text-xs text-ink-3">Loading earlier messages…</p>}
        {t.loaded && !t.messages.length && !t.pending.length && (
          <p className="py-8 text-center text-sm text-ink-3">No messages yet. Say hello 👋</p>
        )}
        {t.messages.map((m, i) => {
          const prev = t.messages[i - 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          return (
            <Fragment key={m.id}>
              {newDay && <DayDivider label={dayLabel(m.created_at)} />}
              <Bubble mine={m.sender_id === me} time={clockTime(m.created_at)}>{linkify(m.body)}</Bubble>
              {m === lastMine && seen && <p className="mb-1 text-right text-[11px] font-semibold text-ink-3">Seen</p>}
            </Fragment>
          );
        })}
        {t.pending.map(p => (
          <Fragment key={p.client_id}>
            <Bubble mine faded time={p.error ? '' : 'Sending…'}>{linkify(p.body)}</Bubble>
            {p.error && (
              <p className="mb-1 text-right text-[12px] font-semibold text-rose-deep">
                {p.error} · <button type="button" onClick={() => retryMessage(id, p.client_id)} className="underline">Retry</button>
                {' · '}<button type="button" onClick={() => discardMessage(id, p.client_id)} className="underline">Discard</button>
              </p>
            )}
          </Fragment>
        ))}
        {isTyping && <p className="py-1 text-xs italic text-ink-3">{firstName} is typing…</p>}
      </div>

      {other.is_active
        ? <Composer id={id} name={firstName} />
        : <p className="border-t border-line px-4 py-3 text-sm text-ink-3">This person&apos;s account is deactivated.</p>}

      <PingDialog open={pingOpen} recipientId={other.id} recipientName={other.full_name}
                  recipientIsOnline={other.is_online} onClose={() => setPingOpen(false)} onSent={() => {}} />
    </div>
  );
}

function Composer({ id, name }: { id: number; name: string }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  // With a mouse, Enter sends and the box takes focus on open. On touch
  // screens Enter is a new line (Send is the button) and the keyboard
  // doesn't pop up uninvited.
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => { setFinePointer(window.matchMedia('(pointer: fine)').matches); }, []);
  useEffect(() => { if (finePointer) box.current?.focus({ preventScroll: true }); }, [id, finePointer]);

  // Grow with the text up to five lines, then scroll.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 5 * 22 + 18) + 'px';
  }, [text]);

  function submit() {
    if (!text.trim()) return;
    sendMessage(id, text);
    setText('');
  }

  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }}
          className="flex shrink-0 items-end gap-2 border-t border-line p-2">
      <textarea ref={box} rows={1} value={text} maxLength={4000}
                onChange={e => { setText(e.target.value); if (e.target.value.trim()) sendTyping(id); }}
                onKeyDown={e => {
                  if (finePointer && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={`Message ${name}…`} aria-label={`Message ${name}`}
                className="input min-h-[40px] flex-1 resize-none py-2 text-[15px] leading-[22px]" />
      <button type="submit" disabled={!text.trim()} aria-label="Send"
              className="btn-primary grid h-10 w-10 shrink-0 place-items-center !p-0">
        <Icon name="send" size={18} />
      </button>
    </form>
  );
}

function Bubble({ mine, time, faded, children }: { mine: boolean; time: string; faded?: boolean; children: ReactNode }) {
  return (
    <div className={'my-1 flex ' + (mine ? 'justify-end' : 'justify-start')}>
      <div className={'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[14px] leading-snug ' +
        (mine ? 'rounded-br-md bg-gold-fill text-on-gold' : 'rounded-bl-md border border-line bg-surface-2 text-ink') +
        (faded ? ' opacity-60' : '')}>
        {children}
        {time && <span className={'ml-2 inline-block text-[10px] ' + (mine ? 'text-on-gold/70' : 'text-ink-3')}>{time}</span>}
      </div>
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
      <span className="h-px flex-1 bg-line" />{label}<span className="h-px flex-1 bg-line" />
    </div>
  );
}

function IconButton({ label, icon, onClick }: { label: string; icon: IconName; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-inset">
      <Icon name={icon} size={16} />
    </button>
  );
}

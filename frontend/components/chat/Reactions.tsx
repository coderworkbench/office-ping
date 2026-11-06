'use client';

// WhatsApp-style reactions: a react button beside a bubble (mouse), a long
// press on it (touch), a quick bar of six plus ＋, and a pill under the bubble.

import { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Reaction } from '../../lib/chat';
import { QUICK_REACTIONS } from '../../lib/emoji';
import { Icon } from '../ui';
import { useDismiss } from './EmojiPicker';

/** Shown beside a bubble on hover or keyboard focus; touch uses a long press instead. */
export function ReactButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="React" title="React"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 opacity-0 transition-opacity hover:bg-inset hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:hidden">
      <Icon name="smile" size={16} />
    </button>
  );
}

export function ReactionBar({ mine, current, text, onPick, onMore, onClose }: {
  mine: boolean; current: string | null; text: string;
  onPick: (emoji: string) => void; onMore: () => void; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);
  useDismiss(box, onClose);
  // No room above the bubble at the top of the list: open below it instead.
  useLayoutEffect(() => {
    const el = box.current;
    const list = el?.closest('[role="log"]');
    if (el && list && el.getBoundingClientRect().top < list.getBoundingClientRect().top) setBelow(true);
  }, []);
  return (
    <div ref={box} role="toolbar" aria-label="React"
         className={'absolute z-20 flex items-center gap-0.5 rounded-full border border-line bg-surface p-1 shadow-lg ' +
           (below ? 'top-full mt-1 ' : 'bottom-full mb-1 ') + (mine ? 'right-0' : 'left-0')}>
      {QUICK_REACTIONS.map(e => (
        <button key={e} type="button" aria-label={e} aria-pressed={current === e} onClick={() => onPick(e)}
                className={'grid h-9 w-9 place-items-center rounded-full text-xl transition-transform hover:scale-125 ' +
                  (current === e ? 'bg-brand-soft' : '')}>
          {e}
        </button>
      ))}
      <button type="button" aria-label="More emoji" title="More emoji" onClick={onMore}
              className="grid h-9 w-9 place-items-center rounded-full text-lg font-bold text-ink-2 hover:bg-inset">
        ＋
      </button>
      {/* Long press disables text selection on touch, so copying lives here. */}
      <button type="button" aria-label="Copy" title="Copy"
              onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); onClose(); }}
              className="hidden h-9 place-items-center rounded-full px-2.5 text-[13px] font-semibold text-ink-2 hover:bg-inset [@media(pointer:coarse)]:grid">
        Copy
      </button>
    </div>
  );
}

/** Each emoji once, then a count when there's more than one reaction. */
export function ReactionPill({ reactions, me, otherName, mine, interactive, onClick }: {
  reactions: Reaction[]; me: number | null; otherName: string; mine: boolean; interactive: boolean; onClick: () => void;
}) {
  const emojis = Array.from(new Set(reactions.map(r => r.emoji)));
  const includesMine = reactions.some(r => r.user_id === me);
  const who = reactions.map(r => `${r.user_id === me ? 'You' : otherName} reacted ${r.emoji}`).join(' · ');
  const cls = 'absolute bottom-0 flex h-6 translate-y-1/2 items-center gap-0.5 rounded-full border bg-surface px-1.5 text-[13px] leading-none text-ink shadow-sm ' +
    (mine ? 'right-2 ' : 'left-2 ') + (includesMine ? 'border-brand ring-1 ring-brand/30' : 'border-line');
  const content = (
    <>
      {emojis.map(e => <span key={e}>{e}</span>)}
      {reactions.length > 1 && <span className="ml-0.5 text-[11px] font-semibold text-ink-2">{reactions.length}</span>}
    </>
  );
  // Without a way to react (they're deactivated) a press would only fail.
  if (!interactive) return <span title={who} aria-label={who} role="img" className={cls}>{content}</span>;
  return (
    <button type="button" onClick={onClick} onPointerDown={e => e.stopPropagation()} title={who}
            aria-label={who + (includesMine ? '. Remove your reaction.' : '')} className={cls}>
      {content}
    </button>
  );
}

/** Half a second on a touch screen without moving: `onLongPress(key)`. */
export function useLongPress(onLongPress: (key: number) => void) {
  const timer = useRef<number | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    from.current = null;
  };
  useEffect(() => cancel, []);
  const lastType = useRef('mouse');
  const fire = (key: number) => {
    fired.current = true;
    navigator.vibrate?.(10);
    onLongPress(key);
  };
  return (key: number) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      cancel();
      lastType.current = e.pointerType;
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      from.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => fire(key), 500);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const f = from.current;
      if (f && Math.hypot(e.clientX - f.x, e.clientY - f.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // The long press opens our bar: no browser menu on top of it. Android fires
    // this (~400 ms) before our timer, and cancels the pointer, so act on it here.
    onContextMenu: (e: ReactMouseEvent) => {
      if (lastType.current === 'mouse') return;
      e.preventDefault();
      cancel();
      if (!fired.current) fire(key);
    },
  });
}

'use client';

// WhatsApp-style reactions: a react button beside a bubble (mouse), a long
// press on it (touch), a quick bar of six plus ＋, and a pill under the bubble.

import { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, useLayoutEffect, useRef, useState } from 'react';
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

export function ReactionBar({ mine, current, onPick, onMore, onClose }: {
  mine: boolean; current: string | null;
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
    </div>
  );
}

/** Each emoji once, then a count when there's more than one reaction. */
export function ReactionPill({ reactions, me, otherName, mine, onClick }: {
  reactions: Reaction[]; me: number | null; otherName: string; mine: boolean; onClick: () => void;
}) {
  const emojis = Array.from(new Set(reactions.map(r => r.emoji)));
  const includesMine = reactions.some(r => r.user_id === me);
  const who = reactions.map(r => `${r.user_id === me ? 'You' : otherName} reacted ${r.emoji}`).join(' · ');
  return (
    <button type="button" onClick={onClick} title={who}
            aria-label={who + (includesMine ? '. Remove your reaction.' : '')}
            className={'absolute -bottom-3.5 flex h-6 items-center gap-0.5 rounded-full border bg-surface px-1.5 text-[13px] leading-none text-ink shadow-sm ' +
              (mine ? 'right-2 ' : 'left-2 ') + (includesMine ? 'border-brand ring-1 ring-brand/30' : 'border-line')}>
      {emojis.map(e => <span key={e}>{e}</span>)}
      {reactions.length > 1 && <span className="ml-0.5 text-[11px] font-semibold text-ink-2">{reactions.length}</span>}
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
  return (key: number) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      from.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress(key);
      }, 500);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const f = from.current;
      if (f && Math.hypot(e.clientX - f.x, e.clientY - f.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // The long press opened our bar: no browser menu on top of it.
    onContextMenu: (e: ReactMouseEvent) => { if (fired.current) e.preventDefault(); },
  });
}

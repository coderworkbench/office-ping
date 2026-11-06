'use client';

// The built-in emoji set in tabs, as a panel above the message box. The
// composer keeps it open for several picks; a reaction closes it after one.

import { RefObject, useEffect, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../../lib/emoji';

export function EmojiPicker({ label, onPick, onClose, boundary }: {
  label: string; onPick: (emoji: string) => void; onClose: () => void;
  /** A press outside this element closes the picker (default: the picker itself). */
  boundary?: RefObject<HTMLElement | null>;
}) {
  const [tab, setTab] = useState(EMOJI_GROUPS[0].id);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(boundary || box, onClose);
  const group = EMOJI_GROUPS.find(g => g.id === tab) || EMOJI_GROUPS[0];
  return (
    <div ref={box} role="dialog" aria-label={label}
         className="absolute inset-x-2 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg sm:right-auto sm:w-[320px]">
      <div role="tablist" aria-label="Emoji groups" className="flex border-b border-line">
        {EMOJI_GROUPS.map(g => (
          <button key={g.id} type="button" role="tab" aria-selected={g.id === tab}
                  aria-label={g.label} title={g.label} onClick={() => setTab(g.id)}
                  className={'grid h-10 flex-1 place-items-center text-lg ' +
                    (g.id === tab ? 'border-b-2 border-brand bg-inset' : 'opacity-70 hover:opacity-100')}>
            {g.icon}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={group.label}
           className="grid max-h-[200px] grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain p-2">
        {group.emojis.map(e => (
          <button key={e} type="button" aria-label={e} onClick={() => onPick(e)}
                  className="grid h-9 place-items-center rounded-lg text-xl hover:bg-inset">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Close on Escape or on a press outside `ref`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.isComposing) close.current(); };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [ref]);
}

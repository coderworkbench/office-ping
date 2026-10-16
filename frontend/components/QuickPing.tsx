'use client';

// Ping anyone from any page: press Ctrl+K (⌘K on a Mac) or "/" outside a
// text field, or use the "Quick ping" button in the sidebar.

import { useEffect, useState } from 'react';
import { PingComposer } from './PingComposer';
import { CloseButton, ModalFrame } from './ui';

export const QUICK_PING_EVENT = 'op:quick_ping';

export function QuickPing() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      const typing = e.target instanceof HTMLElement &&
        (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));
      const combo = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
      // Not while another dialog (ping pop-up, status…) is open.
      if ((combo || slash) && !document.querySelector('[aria-modal="true"]')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(QUICK_PING_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(QUICK_PING_EVENT, onOpen);
    };
  }, []);

  if (!open) return null;
  return (
    <ModalFrame onClose={() => setOpen(false)} labelledBy="quick-ping-title">
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Quick ping</div>
          <h2 id="quick-ping-title" className="display mt-1 text-[22px] text-ink">Who do you need?</h2>
        </div>
        <CloseButton onClick={() => setOpen(false)} />
      </div>
      <PingComposer autoFocus onSent={() => setTimeout(() => setOpen(false), 900)} />
    </ModalFrame>
  );
}

export function ShortcutHint() {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return <kbd className="rounded border border-white/20 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white/70">{mac ? '⌘K' : 'Ctrl K'}</kbd>;
}

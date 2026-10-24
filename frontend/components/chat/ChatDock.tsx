'use client';

// Desktop messaging dock (≥1024px), LinkedIn-style: a bar in the bottom-right
// corner that opens into the chat list, with small conversation windows to
// its left. Hidden on /messages, which shows the same things full size.

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { OPEN_CHAT_EVENT, useChat } from '../../lib/chat';
import { useLiveStatus } from '../NotificationsRuntime';
import { Avatar, Icon } from '../ui';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { NewChat } from './NewChat';

type Layout = { expanded: boolean; windows: number[]; minimized: number[] };
const CLOSED: Layout = { expanded: false, windows: [], minimized: [] };
const storageKey = (uid: number) => `op_chat_dock_${uid}`;

function loadLayout(uid: number): Layout {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey(uid)) || 'null');
    if (s && Array.isArray(s.windows) && Array.isArray(s.minimized)) {
      return { expanded: !!s.expanded, windows: s.windows, minimized: s.minimized };
    }
  } catch {}
  return CLOSED;
}

// True from 1024px up. False until mounted, so the server renders nothing and
// no chat window is ever mounted (and so marked read) on a narrow screen.
function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

export function ChatDock() {
  const { user } = useAuth();
  const uid = user?.id;
  const pathname = usePathname();
  const desktop = useIsDesktop();
  const live = useLiveStatus() === 'open';
  const { conversations, unreadTotal } = useChat();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // Remembered per person, so it survives reloads.
  useEffect(() => { if (uid) setLayout(loadLayout(uid)); }, [uid]);
  useEffect(() => {
    if (!uid || !layout) return;
    try { localStorage.setItem(storageKey(uid), JSON.stringify(layout)); } catch {}
  }, [uid, layout]);

  const openWindow = useCallback((id: number) => {
    setNewOpen(false);
    setLayout(l => {
      const cur = l || CLOSED;
      const max = window.innerWidth >= 1280 ? 2 : 1;
      return {
        ...cur,
        windows: [...cur.windows.filter(w => w !== id), id].slice(-max),
        minimized: cur.minimized.filter(w => w !== id),
      };
    });
  }, []);

  // "Message" buttons elsewhere in the app ask for a window.
  useEffect(() => {
    const h = (e: Event) => openWindow((e as CustomEvent<number>).detail);
    window.addEventListener(OPEN_CHAT_EVENT, h);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, h);
  }, [openWindow]);

  if (!desktop || !user || !layout || pathname?.startsWith('/messages')) return null;

  const closeWindow = (id: number) => setLayout({
    ...layout, windows: layout.windows.filter(w => w !== id), minimized: layout.minimized.filter(w => w !== id),
  });
  const toggleMinimized = (id: number) => setLayout({
    ...layout, minimized: layout.minimized.includes(id) ? layout.minimized.filter(w => w !== id) : [...layout.minimized, id],
  });
  const setExpanded = (expanded: boolean) => setLayout({ ...layout, expanded });
  const windows = (conversations || []).filter(c => layout.windows.includes(c.id))
    .sort((a, b) => layout.windows.indexOf(a.id) - layout.windows.indexOf(b.id));

  return (
    <div className="pointer-events-none fixed bottom-0 right-6 z-[60] flex items-end gap-3">
      {windows.map(c => layout.minimized.includes(c.id) ? (
        <section key={c.id} aria-label={`Chat with ${c.other.full_name}`}
                 className="pointer-events-auto flex h-12 w-[336px] items-center gap-2 rounded-t-xl border border-b-0 border-line bg-surface px-3 shadow-lg">
          <button type="button" onClick={() => toggleMinimized(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Avatar name={c.other.full_name} size={28} online={c.other.is_online} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{c.other.full_name}</span>
            {c.unread > 0 && <Badge n={c.unread} />}
          </button>
          <button type="button" onClick={() => closeWindow(c.id)} aria-label="Close chat" title="Close chat"
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-inset">
            <Icon name="x" size={16} />
          </button>
        </section>
      ) : (
        <section key={c.id} aria-label={`Chat with ${c.other.full_name}`}
                 className="pointer-events-auto flex h-[460px] w-[336px] flex-col overflow-hidden rounded-t-xl border border-b-0 border-line bg-surface shadow-lg">
          <ConversationView id={c.id} variant="window"
                            onMinimize={() => toggleMinimized(c.id)} onClose={() => closeWindow(c.id)} />
        </section>
      ))}

      <section aria-label="Messages"
               className="pointer-events-auto flex w-80 flex-col overflow-hidden rounded-t-xl border border-b-0 border-line bg-surface shadow-lg">
        <div className="flex h-12 shrink-0 items-center gap-1 px-3">
          <button type="button" onClick={() => setExpanded(!layout.expanded)} aria-expanded={layout.expanded}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Avatar name={user.full_name || user.username} size={30} tone="gold" online={live} />
            <span className="text-[15px] font-bold text-ink">Messages</span>
            {unreadTotal > 0 && <Badge n={unreadTotal} />}
          </button>
          <button type="button" title="New message" aria-label="New message"
                  onClick={() => { setNewOpen(true); setExpanded(true); }}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-inset">
            <Icon name="compose" size={16} />
          </button>
          <button type="button" aria-label={layout.expanded ? 'Collapse messages' : 'Expand messages'}
                  onClick={() => setExpanded(!layout.expanded)}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-inset">
            <Icon name="chevron" size={16} className={layout.expanded ? 'rotate-90' : '-rotate-90'} />
          </button>
        </div>
        {layout.expanded && (
          <div className="flex h-[min(70vh,560px)] flex-col border-t border-line">
            {newOpen && <NewChat onOpened={openWindow} onCancel={() => setNewOpen(false)} />}
            <ConversationList onOpen={openWindow} />
          </div>
        )}
      </section>
    </div>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-live px-1 text-[11px] font-bold text-white tabular-nums"
          aria-label={`${n} unread`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

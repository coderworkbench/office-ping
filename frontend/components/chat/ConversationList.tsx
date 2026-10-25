'use client';

// Search box plus the caller's chats, newest first. Shared by the desktop
// dock and the /messages page.

import { useState } from 'react';
import { useChat } from '../../lib/chat';
import { Avatar, Empty, Icon, Skeleton } from '../ui';
import { listTime } from './format';

export function ConversationList({ activeId, onOpen }: {
  activeId?: number | null; onOpen: (id: number) => void;
}) {
  const { conversations, me } = useChat();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = (conversations || []).filter(c => c.other.full_name.toLowerCase().includes(needle));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 py-2">
        <Icon name="search" size={16}
              className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats…"
               aria-label="Search chats" className="input h-10 pl-9 text-sm" />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!conversations && Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-40" /></div>
          </li>
        ))}
        {conversations && !list.length && (
          <li className="px-3 py-6">
            <Empty icon={<Icon name="chat" size={20} />}
                   title={needle ? 'Nobody matched' : 'No chats yet'}
                   hint={needle ? 'Try a different name.' : 'Start one with the pencil button, or Message on the People page.'} />
          </li>
        )}
        {list.map(c => {
          const unread = c.unread > 0;
          const last = c.last_message;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} aria-current={activeId === c.id ? 'true' : undefined}
                      className={'flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 ' +
                        (activeId === c.id ? 'bg-gold-soft/60' : '')}>
                <Avatar name={c.other.full_name} size={40} online={c.other.is_online} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={'truncate text-[15px] text-ink ' + (unread ? 'font-bold' : 'font-semibold')}>
                      {c.other.full_name}
                    </span>
                    {c.muted && <Icon name="bellOff" size={14} className="shrink-0 text-ink-3" />}
                    {c.last_message_at && <span className="ml-auto shrink-0 text-xs text-ink-3">{listTime(c.last_message_at)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={'truncate text-[13px] ' + (unread ? 'font-semibold text-ink' : 'text-ink-2')}>
                      {last ? (last.sender_id === me ? 'You: ' : '') + last.body : (c.other.department || 'Say hello 👋')}
                    </span>
                    {unread && (
                      <span className="ml-auto inline-grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-live px-1 text-[11px] font-bold text-white tabular-nums"
                            aria-label={`${c.unread} unread`}>
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

'use client';

// Messages: the chat list and one conversation. Two panes from 1024px; on
// phones the list, then the conversation full-screen with a back button.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Guard } from '../../components/Guard';
import { ConversationList } from '../../components/chat/ConversationList';
import { ConversationView } from '../../components/chat/ConversationView';
import { NewChat } from '../../components/chat/NewChat';
import { Icon, PageHeader } from '../../components/ui';
import { fetchConversation, useChat } from '../../lib/chat';
import { useKeyboardInset } from '../../lib/useKeyboardInset';

export default function MessagesPage() {
  return <Guard><Suspense><Inner /></Suspense></Guard>;
}

function Inner() {
  const router = useRouter();
  const wanted = Number(useSearchParams().get('c')) || null;
  const { conversations } = useChat();
  const [newOpen, setNewOpen] = useState(false);
  const inset = useKeyboardInset();
  const known = !!wanted && !!conversations?.some(c => c.id === wanted);
  const active = known ? wanted : null;

  // A link to a chat that isn't in the list yet (just started by the other
  // person) is fetched; one that isn't theirs falls back to the list.
  useEffect(() => {
    if (!wanted || !conversations || known) return;
    fetchConversation(wanted).then(ok => { if (!ok) router.replace('/messages'); });
  }, [wanted, conversations, known, router]);

  const open = (id: number) => { setNewOpen(false); router.push(`/messages?c=${id}`); };

  return (
    <div className="animate-slideIn">
      <div className={active ? 'hidden lg:block' : ''}>
        <PageHeader
          eyebrow="Chat"
          title="Messages"
          lead="Quiet one-to-one chat. When something needs attention now, send a ping instead."
          actions={
            <button type="button" onClick={() => setNewOpen(o => !o)} className="btn-primary btn-sm">
              <Icon name="compose" size={16} /> New message
            </button>
          }
        />
      </div>
      <div className="surface overflow-hidden lg:grid lg:h-[calc(100dvh-15rem)] lg:min-h-[420px] lg:grid-cols-[320px_1fr]">
        <div className={'flex min-h-[60vh] flex-col lg:min-h-0 lg:border-r lg:border-line ' + (active ? 'hidden lg:flex' : '')}>
          {newOpen && <NewChat onOpened={open} onCancel={() => setNewOpen(false)} />}
          <ConversationList activeId={active} onOpen={open} />
        </div>
        {active ? (
          // Phones: full screen over the tab bar, composer above the keyboard.
          <div className="fixed inset-x-0 top-0 z-[70] flex flex-col bg-surface lg:static lg:z-auto lg:min-h-0"
               style={{ bottom: inset, paddingTop: 'env(safe-area-inset-top)',
                        paddingBottom: inset ? 0 : 'env(safe-area-inset-bottom)' }}>
            <ConversationView key={active} id={active} variant="page" onBack={() => router.replace('/messages')} />
          </div>
        ) : (
          <div className="hidden place-items-center p-8 text-center text-sm text-ink-3 lg:grid">
            Pick a chat on the left, or start a new one.
          </div>
        )}
      </div>
    </div>
  );
}

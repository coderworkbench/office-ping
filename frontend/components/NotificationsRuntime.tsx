'use client';

// Owns the global notifications WebSocket. Subscribes once per authenticated
// session, surfaces OS notifications via the service worker, and dispatches a
// 'op:ping' custom event that pages can listen to for in-page updates.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAuth } from '../lib/auth';
import { ReconnectingWS } from '../lib/ws';
import { closeNotification, registerServiceWorker, showNotification } from '../lib/notify';
import { apiFetch } from '../lib/api';
import { useRouter } from 'next/navigation';
import { onRead, onTyping, receiveMessage, resetChat, resyncChat, setChatSocket, shouldNotify } from '../lib/chat';

// Connection state of the live socket, for the "Live" badge.
type LiveStatus = 'connecting' | 'open' | 'closed';
let liveStatus: LiveStatus = 'closed';
const liveListeners = new Set<() => void>();
function setLiveStatus(s: LiveStatus) { liveStatus = s; liveListeners.forEach(l => l()); }
export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    l => { liveListeners.add(l); return () => { liveListeners.delete(l); }; },
    () => liveStatus, () => 'closed' as LiveStatus);
}

export function NotificationsRuntime() {
  const { user } = useAuth();
  const uid = user?.id;
  const router = useRouter();
  const notifWs = useRef<ReconnectingWS | null>(null);
  const presenceWs = useRef<ReconnectingWS | null>(null);

  useEffect(() => {
    if (!uid) return;
    registerServiceWorker();

    const n = new ReconnectingWS('/ws/notifications/');
    const p = new ReconnectingWS('/ws/presence/', 25000);
    notifWs.current = n; presenceWs.current = p;
    resetChat(uid);
    setChatSocket(msg => n.send(msg));

    // A ping can reach this tab twice (e.g. it was created while the socket
    // was connecting, so it comes both live and as "pending"). Show it once.
    const seen = new Set<string>();

    // Every (re)connect: refetch chats, since messages may have arrived while offline.
    const offStatus = n.onStatus(s => { setLiveStatus(s); if (s === 'open') resyncChat(); });
    const offMsg = n.onMessage(async (msg) => {
      if (msg.type === 'notification') {
        const payload = msg.payload;
        // ACK delivered
        n.send({ type: 'ack_delivered', delivery_id: payload.delivery_id });
        // A reminder for an unanswered urgent ping is shown again, once.
        const key = payload.reminder ? `${payload.ping_id}:reminder` : String(payload.ping_id);
        if (seen.has(key)) return;
        seen.add(key);
        // In a meeting / do not disturb: file it in the inbox, no pop-up or sound.
        if (payload.quiet) {
          window.dispatchEvent(new CustomEvent('op:inbox_changed', { detail: payload }));
          return;
        }
        const title = payload.reminder ? `⏰ Still waiting: ${payload.sender_name}`
          : payload.priority === 'URGENT' ? `🚨 ${payload.sender_name}`
          : `🔔 ${payload.sender_name}`;
        await showNotification(title, payload.message, {
          tag: `ping-${payload.ping_id}`,
          url: '/notifications',
          priority: payload.priority,
          pingId: payload.ping_id,
          renotify: !!payload.reminder,
        });
        window.dispatchEvent(new CustomEvent('op:ping', { detail: payload }));
      } else if (msg.type === 'ping_handled') {
        // Acknowledged in another tab or on another device.
        closeNotification(`ping-${msg.payload.ping_id}`);
        window.dispatchEvent(new CustomEvent('op:ping_handled', { detail: msg.payload }));
      } else if (msg.type === 'ping_status') {
        window.dispatchEvent(new CustomEvent('op:ping_status', { detail: msg.payload }));
      } else if (msg.type === 'chat_message') {
        const p = msg.payload;
        receiveMessage(p.message, p.client_id);
        // Quiet by design: no pop-up, no sound, not sticky, one notification per chat.
        if (p.message.sender_id !== uid && !p.quiet && shouldNotify(p.conversation_id)) {
          const body = p.message.body.length > 140 ? p.message.body.slice(0, 139) + '…' : p.message.body;
          await showNotification(p.sender_name, body, {
            tag: `chat-${p.conversation_id}`, url: `/messages?c=${p.conversation_id}`, sticky: false, silent: true,
          });
        }
      } else if (msg.type === 'chat_read') {
        onRead(msg.payload);
        if (msg.payload.user_id === uid) closeNotification(`chat-${msg.payload.conversation_id}`);
      } else if (msg.type === 'chat_typing') {
        onTyping(msg.payload);
      }
    });

    const onSwMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'open-url' && typeof ev.data.url === 'string') router.push(ev.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    n.connect();
    p.connect();

    return () => {
      offStatus(); offMsg(); n.close(); p.close(); setLiveStatus('closed');
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      setChatSocket(null); resetChat(null);
    };
  }, [uid, router]);

  return null;
}

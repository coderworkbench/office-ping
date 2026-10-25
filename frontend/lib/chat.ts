'use client';

// Chat state shared by the desktop dock and the /messages page.
// NotificationsRuntime feeds socket events in (receiveMessage, onRead,
// onTyping) and resyncs after every (re)connect; components read the state
// with useChat() and change it only through the functions below.

import { useSyncExternalStore } from 'react';
import { ApiError, apiErrorMessage, apiFetch } from './api';
import type { Status } from './status';

export type ChatPerson = {
  id: number; full_name: string; department: string; designation: string;
  is_online: boolean; is_active: boolean; last_seen_at: string | null; status: Status | null;
};
export type ChatMessage = {
  id: number; conversation_id: number; sender_id: number; body: string; created_at: string;
};
export type Conversation = {
  id: number; other: ChatPerson;
  last_message: ChatMessage | null; last_message_at: string | null;
  unread: number; muted: boolean; other_last_read_id: number | null;
};
/** A message on its way to the server (error null) or one that failed. */
export type Pending = { client_id: string; body: string; error: string | null };
export type Thread = {
  messages: ChatMessage[]; pending: Pending[];
  hasMore: boolean; loaded: boolean; loadingOlder: boolean;
};

type State = {
  me: number | null;
  conversations: Conversation[] | null;   // null until the first load
  threads: Record<number, Thread>;
  typing: Record<number, number>;         // conversation id → when "typing…" ends (ms)
  unreadTotal: number;
  focused: number[];                      // conversations on screen right now
};

const INITIAL: State = { me: null, conversations: null, threads: {}, typing: {}, unreadTotal: 0, focused: [] };
export const EMPTY_THREAD: Thread = { messages: [], pending: [], hasMore: false, loaded: false, loadingOlder: false };
const TYPING_SHOWN_MS = 5000;
const TYPING_EVERY_MS = 3000;

let state: State = INITIAL;
const listeners = new Set<() => void>();
let socketSend: ((msg: object) => void) | null = null;
const readUpTo = new Map<number, number>();
const typingSentAt = new Map<number, number>();
// Bumped by resetChat: a reply that arrives after sign-out/sign-in belongs to the old session and is dropped.
let session = 0;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

export function useChat(): State {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state, () => INITIAL);
}

const thread = (id: number) => state.threads[id] || EMPTY_THREAD;
function setThread(id: number, patch: Partial<Thread>) {
  set({ threads: { ...state.threads, [id]: { ...thread(id), ...patch } } });
}
const findConversation = (id: number) => state.conversations?.find(c => c.id === id);

function setConversations(list: Conversation[]) {
  const sorted = [...list].sort((a, b) =>
    (b.last_message_at || '').localeCompare(a.last_message_at || '') || b.id - a.id);
  set({ conversations: sorted, unreadTotal: sorted.reduce((n, c) => n + c.unread, 0) });
}
function patchConversation(id: number, patch: Partial<Conversation>) {
  if (state.conversations) setConversations(state.conversations.map(c => c.id === id ? { ...c, ...patch } : c));
}
function withoutKey<T>(o: Record<number, T>, key: number) {
  const copy = { ...o };
  delete copy[key];
  return copy;
}
function mergeMessages(a: ChatMessage[], b: ChatMessage[]) {
  const byId = new Map<number, ChatMessage>();
  [...a, ...b].forEach(m => byId.set(m.id, m));
  return Array.from(byId.values()).sort((x, y) => x.id - y.id);
}

// ---------- Session (called by NotificationsRuntime) ----------

/** Start over for a signed-in user, or clear everything on sign-out. */
export function resetChat(me: number | null) {
  session++;
  readUpTo.clear();
  typingSentAt.clear();
  state = { ...INITIAL, me };
  listeners.forEach(l => l());
}

/** How to send on the live socket (null while there is none). */
export function setChatSocket(send: ((msg: object) => void) | null) { socketSend = send; }

/** Fetch the chat list and every open thread again (first connect, reconnect). */
export async function resyncChat() {
  await loadConversations().catch(() => {});
  await Promise.all(Object.keys(state.threads).map(id => loadThread(Number(id)).catch(() => {})));
}

// ---------- Loading ----------

export async function loadConversations() {
  const s = session;
  const list = await apiFetch<Conversation[]>('/api/chat/conversations/');
  if (s === session) setConversations(list);
}

/** Open (or create) the chat with a person; returns its id. */
export async function openChatWith(userId: number): Promise<number> {
  const s = session;
  const c = await apiFetch<Conversation>('/api/chat/conversations/', {
    method: 'POST', body: JSON.stringify({ user_id: userId }),
  });
  if (s !== session) return c.id;
  if (state.conversations) setConversations([c, ...state.conversations.filter(x => x.id !== c.id)]);
  else await loadConversations();
  return c.id;
}

/** Add one conversation to the list (e.g. a link to a chat started elsewhere). False if it isn't theirs. */
export async function fetchConversation(id: number): Promise<boolean> {
  const s = session;
  try {
    const c = await apiFetch<Conversation>(`/api/chat/conversations/${id}/`);
    if (s !== session) return false;
    setConversations([c, ...(state.conversations || []).filter(x => x.id !== id)]);
    return true;
  } catch { return false; }
}

type Page = { results: ChatMessage[]; has_more: boolean };

/** The newest page of a conversation, merged into what is already loaded. */
export async function loadThread(id: number) {
  const s = session;
  const d = await apiFetch<Page>(`/api/chat/conversations/${id}/messages/`);
  if (s !== session) return;
  const t = thread(id);
  const newest = t.messages[t.messages.length - 1];
  // More than a page arrived while away: start from the new page rather than leave a gap.
  const gap = d.has_more && !!newest && !!d.results.length && d.results[0].id > newest.id;
  setThread(id, {
    messages: gap ? d.results : mergeMessages(t.messages, d.results),
    hasMore: gap || !t.loaded ? d.has_more : t.hasMore,
    loaded: true,
  });
}

/** Older messages; false if none were added (nothing to load, or it failed and they can scroll again). */
export async function loadOlder(id: number): Promise<boolean> {
  const t = thread(id);
  if (!t.hasMore || t.loadingOlder || !t.messages.length) return false;
  const s = session;
  setThread(id, { loadingOlder: true });
  try {
    const d = await apiFetch<Page>(`/api/chat/conversations/${id}/messages/?before=${t.messages[0].id}`);
    if (s !== session) return false;
    setThread(id, { messages: mergeMessages(thread(id).messages, d.results), hasMore: d.has_more, loadingOlder: false });
    return true;
  } catch {
    if (s === session) setThread(id, { loadingOlder: false });
    return false;
  }
}

// ---------- Sending ----------

export async function sendMessage(id: number, body: string) {
  const text = body.trim();
  if (!text) return;
  const p: Pending = { client_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), body: text, error: null };
  setThread(id, { pending: [...thread(id).pending, p] });
  await deliver(id, p);
}

async function deliver(id: number, p: Pending) {
  const s = session;
  try {
    const m = await apiFetch<ChatMessage>(`/api/chat/conversations/${id}/messages/`, {
      method: 'POST', body: JSON.stringify({ body: p.body, client_id: p.client_id }),
    });
    if (s === session) receiveMessage(m, p.client_id);
  } catch (e) {
    if (s !== session) return;
    // Rate limit, deactivated account, invalid text: say why. Anything else: just "Not sent".
    const error = e instanceof ApiError && [400, 403, 429].includes(e.status) ? apiErrorMessage(e, 'Not sent') : 'Not sent';
    setThread(id, { pending: thread(id).pending.map(x => x.client_id === p.client_id ? { ...x, error } : x) });
  }
}

export function retryMessage(id: number, clientId: string) {
  const p = thread(id).pending.find(x => x.client_id === clientId);
  if (!p) return;
  const again = { ...p, error: null };
  setThread(id, { pending: thread(id).pending.map(x => x.client_id === clientId ? again : x) });
  deliver(id, again);
}

export function discardMessage(id: number, clientId: string) {
  setThread(id, { pending: thread(id).pending.filter(x => x.client_id !== clientId) });
}

// ---------- Live updates ----------

/** A message from the server: the REST reply to our own send, or a socket push. */
export function receiveMessage(m: ChatMessage, clientId?: string) {
  const id = m.conversation_id;
  const t = state.threads[id];
  if (t) {
    setThread(id, {
      messages: t.loaded ? mergeMessages(t.messages, [m]) : t.messages,
      pending: clientId ? t.pending.filter(p => p.client_id !== clientId) : t.pending,
    });
  }
  const fromOther = m.sender_id !== state.me;
  if (fromOther && state.typing[id]) set({ typing: withoutKey(state.typing, id) });

  const c = findConversation(id);
  if (!c) {
    // A chat someone just started with us: fetch the list to get it.
    if (state.conversations) loadConversations().catch(() => {});
    return;
  }
  if (c.last_message && c.last_message.id >= m.id) return;   // already counted
  const onScreen = state.focused.includes(id) && windowActive();
  patchConversation(id, {
    last_message: m, last_message_at: m.created_at,
    unread: fromOther && !onScreen ? c.unread + 1 : c.unread,
  });
  if (fromOther && onScreen) markRead(id, m.id);
}

export function onRead(p: { conversation_id: number; user_id: number; message_id: number }) {
  const c = findConversation(p.conversation_id);
  if (!c) return;
  if (p.user_id === state.me) {
    // Read in another tab or on another device.
    if (!c.last_message || p.message_id >= c.last_message.id) patchConversation(c.id, { unread: 0 });
  } else if ((c.other_last_read_id || 0) < p.message_id) {
    patchConversation(c.id, { other_last_read_id: p.message_id });
  }
}

export function onTyping(p: { conversation_id: number; user_id: number }) {
  if (p.user_id === state.me) return;
  const until = Date.now() + TYPING_SHOWN_MS;
  set({ typing: { ...state.typing, [p.conversation_id]: until } });
  setTimeout(() => {
    if (state.typing[p.conversation_id] === until) set({ typing: withoutKey(state.typing, p.conversation_id) });
  }, TYPING_SHOWN_MS);
}

/** The tab is visible and the window has focus: the person is looking at it. */
export function windowActive() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

/** Desktop notification for a new message? Not for muted chats or one already in front of them. */
export function shouldNotify(id: number) {
  if (findConversation(id)?.muted) return false;
  return !windowActive() || !state.focused.includes(id);
}

// ---------- Reading, muting, typing, focus ----------

export function markRead(id: number, messageId: number) {
  if ((readUpTo.get(id) || 0) >= messageId) return;
  readUpTo.set(id, messageId);
  patchConversation(id, { unread: 0 });
  const s = session;
  apiFetch<{ unread_total: number }>(`/api/chat/conversations/${id}/read/`, {
    method: 'POST', body: JSON.stringify({ message_id: messageId }),
  }).then(r => { if (s === session) set({ unreadTotal: r.unread_total }); },
          () => { if (s === session) readUpTo.delete(id); });
}

export async function setMuted(id: number, muted: boolean) {
  patchConversation(id, { muted });
  try {
    await apiFetch(`/api/chat/conversations/${id}/mute/`, { method: 'POST', body: JSON.stringify({ muted }) });
  } catch {
    patchConversation(id, { muted: !muted });
  }
}

export function sendTyping(id: number) {
  const now = Date.now();
  if (now - (typingSentAt.get(id) || 0) < TYPING_EVERY_MS) return;
  typingSentAt.set(id, now);
  socketSend?.({ type: 'chat_typing', conversation_id: id });
}

/** A conversation is on screen (an open dock window, or the /messages pane). */
export function setFocused(id: number, on: boolean) {
  const rest = state.focused.filter(x => x !== id);
  set({ focused: on ? [...rest, id] : rest });
}

// ---------- Opening a chat from elsewhere ----------

/** Window event the desktop dock listens for; detail is a conversation id. */
export const OPEN_CHAT_EVENT = 'op:open_chat';

/** Open the chat with a person: a dock window on a computer, /messages on smaller screens. */
export async function startChat(userId: number, navigate: (url: string) => void) {
  const id = await openChatWith(userId);
  if (window.matchMedia('(min-width: 1024px)').matches && !window.location.pathname.startsWith('/messages')) {
    window.dispatchEvent(new CustomEvent<number>(OPEN_CHAT_EVENT, { detail: id }));
  } else {
    navigate(`/messages?c=${id}`);
  }
}

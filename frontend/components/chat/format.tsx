import { ReactNode } from 'react';
import { describeStatus } from '../../lib/status';
import type { ChatPerson } from '../../lib/chat';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Chat list time: "10:42" today, "Mon" within the week, "Oct 21" before that. */
export function listTime(iso: string) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return clockTime(iso);
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Divider between days in a conversation. */
export function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

/** The line under a name: their status, else online, else when they were last around. */
export function presenceLine(p: ChatPerson) {
  if (!p.is_active) return 'Account deactivated';
  if (p.status) return describeStatus(p.status, { emoji: true });
  if (p.is_online) return 'Online';
  if (!p.last_seen_at) return 'Offline';
  const mins = Math.round((Date.now() - new Date(p.last_seen_at).getTime()) / 60000);
  if (mins < 60) return `Active ${Math.max(mins, 1)} min ago`;
  if (mins < 24 * 60) return `Active ${Math.round(mins / 60)} h ago`;
  return `Active ${listTime(p.last_seen_at)}`;
}

const LINK = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;

/** Message text with http(s) links made clickable; everything else stays plain text. */
export function linkify(text: string): ReactNode[] {
  return text.split(LINK).map((part, i) => i % 2 === 1
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline">{part}</a>
    : part);
}

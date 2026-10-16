// A person's status ("In a meeting until 3:00 PM"), as sent by the API.

export type Status = {
  kind: 'MEETING' | 'LUNCH' | 'AWAY' | 'DND';
  label: string;
  text: string;
  until: string | null;
  /** Non-urgent pings arrive quietly (inbox only, no pop-up or sound). */
  quiet: boolean;
};

export const STATUS_KINDS: { kind: Status['kind']; label: string; emoji: string; hint: string }[] = [
  { kind: 'MEETING', label: 'In a meeting',   emoji: '🗓️', hint: 'Pings wait quietly in your inbox; urgent ones still pop up.' },
  { kind: 'DND',     label: 'Do not disturb', emoji: '⛔', hint: 'Pings wait quietly in your inbox; urgent ones still pop up.' },
  { kind: 'LUNCH',   label: 'Out for lunch',  emoji: '🍽️', hint: 'People see you’re away before they ping.' },
  { kind: 'AWAY',    label: 'Away from desk', emoji: '🚶', hint: 'People see you’re away before they ping.' },
];

export function statusEmoji(s: Status) {
  return STATUS_KINDS.find(k => k.kind === s.kind)?.emoji || '•';
}

/** "In a meeting · Board review · until 3:00 PM" */
export function describeStatus(s: Status, opts: { emoji?: boolean } = {}) {
  const parts = [s.label];
  if (s.text) parts.push(s.text);
  if (s.until) parts.push(`until ${untilText(s.until)}`);
  return (opts.emoji ? statusEmoji(s) + ' ' : '') + parts.join(' · ');
}

function untilText(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return time;
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${time}`;
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + time;
}

/** What a sender should know before pinging someone with this status. */
export function senderNotice(name: string, s: Status) {
  return s.quiet
    ? `${name} is ${describeStatus(s).replace(/^./, c => c.toLowerCase())}. A normal ping goes quietly to their inbox; mark it urgent only if it can’t wait.`
    : `${name} is ${describeStatus(s).replace(/^./, c => c.toLowerCase())}. They’ll see your ping when they’re back.`;
}

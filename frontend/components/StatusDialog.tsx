'use client';

// "Set your status": In a meeting / Do not disturb / Out for lunch / Away,
// an optional note, and when it ends. Meeting and Do-not-disturb make normal
// pings arrive quietly; urgent pings still pop up.

import { useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { invalidate } from '../lib/useApi';
import { describeStatus, Status, STATUS_KINDS } from '../lib/status';
import { CloseButton, ModalFrame } from './ui';

type Ends = '30m' | '1h' | '2h' | 'eod' | 'custom' | 'none';
const ENDS: { value: Ends; label: string }[] = [
  { value: '30m', label: '30 min' }, { value: '1h', label: '1 hour' }, { value: '2h', label: '2 hours' },
  { value: 'eod', label: 'End of day' }, { value: 'custom', label: 'Pick a time' }, { value: 'none', label: 'Until I clear it' },
];

export function StatusDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useAuth();
  const current = user?.status || null;
  const [kind, setKind] = useState<Status['kind']>('MEETING');
  const [text, setText] = useState('');
  const [ends, setEnds] = useState<Ends>('1h');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(current?.kind || 'MEETING');
    setText(current?.text || '');
    setEnds('1h');
    setCustom(toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
    setError(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function save(clear = false) {
    setBusy(true); setError(null);
    try {
      const until = clear ? null : endTime(ends, custom);
      await apiFetch('/api/me/status/', {
        method: 'PUT',
        body: JSON.stringify(clear ? { kind: '' } : { kind, text: text.trim(), until: until?.toISOString() ?? null }),
      });
      await refresh();
      invalidate('/api/users/');
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not save your status. Try again.'));
    } finally { setBusy(false); }
  }

  const chosen = STATUS_KINDS.find(k => k.kind === kind)!;

  return (
    <ModalFrame onClose={onClose} labelledBy="status-title">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Your status</div>
          <h2 id="status-title" className="display mt-1 text-[22px] text-ink">What are you up to?</h2>
          {current && <p className="mt-1 text-sm text-ink-2">Now: {describeStatus(current, { emoji: true })}</p>}
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <div role="radiogroup" aria-label="Status" className="mt-4 grid grid-cols-2 gap-2">
        {STATUS_KINDS.map(k => (
          <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind}
                  onClick={() => setKind(k.kind)}
                  className={'flex min-h-[48px] items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-colors duration-150 ' +
                    (kind === k.kind ? 'border-gold-fill bg-gold-soft text-brand' : 'border-line bg-surface text-ink hover:border-gold-fill/60')}>
            <span aria-hidden className="text-lg">{k.emoji}</span>{k.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-2">{chosen.hint}</p>

      <label className="mt-4 block">
        <span className="label">Note <span className="font-normal text-ink-3">(optional)</span></span>
        <input value={text} onChange={e => setText(e.target.value)} maxLength={80}
               placeholder="e.g. Board review, back at 3" className="input" />
      </label>

      <fieldset className="mt-4">
        <legend className="label">Clear it after</legend>
        <div className="flex flex-wrap gap-2">
          {ENDS.map(o => (
            <button key={o.value} type="button" aria-pressed={ends === o.value} onClick={() => setEnds(o.value)}
                    className={'chip-btn ' + (ends === o.value ? 'is-active' : '')}>{o.label}</button>
          ))}
        </div>
        {ends === 'custom' && (
          <input type="datetime-local" value={custom} onChange={e => setCustom(e.target.value)}
                 min={toLocalInput(new Date())} className="input mt-2" aria-label="Clear status at" />
        )}
      </fieldset>

      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose-deep">{error}</p>}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {current && (
          <button type="button" disabled={busy} onClick={() => save(true)} className="btn-ghost sm:mr-auto">
            Clear status (I’m available)
          </button>
        )}
        <button type="button" onClick={onClose} className="btn-neutral sm:ml-auto">Cancel</button>
        <button type="button" disabled={busy} onClick={() => save()} className="btn-primary">
          {busy ? 'Saving…' : 'Set status'}
        </button>
      </div>
    </ModalFrame>
  );
}

function endTime(ends: Ends, custom: string): Date | null {
  const now = Date.now();
  switch (ends) {
    case '30m': return new Date(now + 30 * 60 * 1000);
    case '1h':  return new Date(now + 60 * 60 * 1000);
    case '2h':  return new Date(now + 2 * 60 * 60 * 1000);
    case 'eod': {
      // 6 PM today, or midnight if it's already past 6.
      const d = new Date(); d.setHours(18, 0, 0, 0);
      if (d.getTime() <= now) { d.setHours(23, 59, 0, 0); }
      return d;
    }
    case 'custom': return custom ? new Date(custom) : null;
    case 'none': return null;
  }
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

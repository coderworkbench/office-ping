'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Avatar, CloseButton, Icon, ModalFrame } from './ui';

type Template = { id: number; title: string; message: string };

export function PingDialog({
  open, recipientId, recipientName, recipientIsOnline,
  defaultMessage = 'Please come here',
  onClose, onSent,
}: {
  open: boolean;
  recipientId: number;
  recipientName: string;
  recipientIsOnline?: boolean;
  defaultMessage?: string;
  onClose: () => void;
  onSent: (pingId: number) => void;
}) {
  const [message, setMessage] = useState(defaultMessage);
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setMessage(defaultMessage);
    setPriority('NORMAL');
    setTemplateId('');
    setError(null);
    setBusy(false);
    apiFetch<any>('/api/templates/').then(d => setTemplates(d.results || d)).catch(() => {});
    setTimeout(() => textAreaRef.current?.focus(), 20);
  }, [open, defaultMessage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, message, priority]);

  if (!open) return null;

  function applyTemplate(id: number) {
    setTemplateId(id);
    const t = templates.find(t => t.id === id);
    if (t) setMessage(t.message);
  }

  async function submit() {
    if (busy) return;
    const text = message.trim();
    if (!text) { setError('Write something first.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await apiFetch<any>('/api/pings/', {
        method: 'POST',
        body: JSON.stringify({
          recipient: recipientId, message: text, priority,
          template: templateId || null,
        }),
      });
      onSent(r.id); onClose();
    } catch (e: any) {
      setError(String(e.message).toLowerCase().includes('throttl')
        ? 'Rate limit — give it a moment.' : 'Could not send. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <ModalFrame onClose={onClose} labelledBy="ping-dialog-title">
        <div className="flex items-start gap-3">
          <Avatar name={recipientName} size={44} online={recipientIsOnline} />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Ping</div>
            <h2 id="ping-dialog-title" className="truncate text-xl font-bold text-ink">
              {recipientName}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-2">
              They'll see a pop-up, a desktop notification and an inbox entry.
              {recipientIsOnline === false && <span className="text-warn"> Currently offline — they'll see it when they return.</span>}
            </p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {templates.length > 0 && (
          <div className="mt-5">
            <div className="label mb-2">Quick templates</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick templates">
              {templates.map(t => (
                <button key={t.id} type="button" onClick={() => applyTemplate(t.id)}
                  aria-pressed={templateId === t.id}
                  className={'chip-btn ' + (templateId === t.id ? 'is-active' : '')}>
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <label htmlFor="ping-msg" className="label mb-2">Message</label>
          <textarea
            ref={textAreaRef} id="ping-msg" rows={3}
            value={message} onChange={e => setMessage(e.target.value)}
            maxLength={500}
            className="input resize-none"
            placeholder="A short message. “Please come here.”"
          />
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <label className="-ml-1 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-1 text-sm sm:min-h-0">
              <input type="checkbox" checked={priority === 'URGENT'}
                     onChange={e => setPriority(e.target.checked ? 'URGENT' : 'NORMAL')}
                     className="h-4 w-4 accent-[rgb(var(--live))]" />
              <span className={priority === 'URGENT' ? 'font-semibold text-live' : 'text-ink-2'}>
                Mark urgent
              </span>
            </label>
            <span className="tabular-nums text-ink-3">{message.length}/500</span>
          </div>
        </div>

        {error && (
          <div role="alert"
            className="mt-4 rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <span className="hidden text-xs text-ink-3 sm:inline">
            Ctrl + Enter to send
          </span>
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <button type="button" onClick={onClose} className="btn-neutral flex-1 sm:flex-none">Cancel</button>
            <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1 sm:flex-none">
              <Icon name="send" size={16} />
              {busy ? 'Sending…' : 'Send ping'}
            </button>
          </div>
        </div>
    </ModalFrame>
  );
}

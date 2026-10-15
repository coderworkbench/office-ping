'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Avatar, Icon } from './ui';

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
    <div
      role="dialog" aria-modal="true" aria-labelledby="ping-dialog-title"
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-slab-900/40 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg surface p-6 shadow-pop animate-slideIn">
        <div className="flex items-start gap-3">
          <Avatar name={recipientName} size={44} online={recipientIsOnline} />
          <div className="flex-1 min-w-0">
            <div className="eyebrow">Ping</div>
            <h2 id="ping-dialog-title" className="display text-2xl font-medium leading-tight">
              {recipientName}
            </h2>
            <p className="text-xs text-inkmute mt-1">
              They'll see a desktop notification and an inbox entry.
              {recipientIsOnline === false && ' Currently offline — they\'ll see it when they return.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="text-inkmute hover:text-ink p-1 rounded-md hover:bg-paper">✕</button>
        </div>

        {templates.length > 0 && (
          <div className="mt-5">
            <div className="label mb-2">Quick templates</div>
            <div className="flex flex-wrap gap-1.5">
              {templates.map(t => (
                <button key={t.id} type="button" onClick={() => applyTemplate(t.id)}
                  className={'chip cursor-pointer hover:border-ink/30 ' +
                    (templateId === t.id ? 'border-ink bg-ink text-white' : '')}>
                  {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <label htmlFor="ping-msg" className="label mb-2 block">Message</label>
          <textarea
            ref={textAreaRef} id="ping-msg" rows={3}
            value={message} onChange={e => setMessage(e.target.value)}
            maxLength={500}
            className="input resize-none text-base"
            placeholder="A short message. “Please come here.”"
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <label className="inline-flex items-center gap-2 text-inkmute">
              <input type="checkbox" checked={priority === 'URGENT'}
                     onChange={e => setPriority(e.target.checked ? 'URGENT' : 'NORMAL')}
                     className="h-4 w-4 rounded border-hairline text-ember focus:ring-ember/30" />
              <span className={priority === 'URGENT' ? 'text-ember font-medium' : ''}>
                Mark urgent
              </span>
            </label>
            <span className="font-mono text-inkmute">{message.length}/500</span>
          </div>
        </div>

        {error && (
          <div role="alert"
            className="mt-4 text-sm text-ember border border-ember/30 bg-ember/5 rounded-tool px-3 py-2">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="hidden sm:inline text-xs text-inkmute font-mono">
            ⌘/Ctrl + Enter to send
          </span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button type="button" onClick={submit} disabled={busy} className="btn-ember">
              <Icon name="send" size={14} />
              {busy ? 'Sending…' : 'Send ping'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

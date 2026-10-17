'use client';

import { useState } from 'react';
import { apiFetch, pingErrorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { listOf, useApi } from '../lib/useApi';
import { senderNotice } from '../lib/status';
import { homeTemplates } from '../lib/templates';
import { Icon } from './ui';
import { PersonSelect, Person } from './PersonSelect';
type Group = { id: number; name: string; member_count: number };
type Template = { id: number; title: string; message: string };

export function PingComposer({ onSent, autoFocus, homeOnly = false }: {
  onSent?: () => void; autoFocus?: boolean;
  /** Overview: only the (up to) three templates chosen for the home screen. */
  homeOnly?: boolean;
} = {}) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'user' | 'group'>('user');
  const [recipient, setRecipient] = useState<number | ''>('');
  const [group, setGroup] = useState<number | ''>('');
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canGroup = user && user.role !== 'MEMBER';
  const people = listOf<Person>(useApi('/api/users/', { intervalMs: 60000 }).data);
  const allTemplates = listOf<Template>(useApi('/api/templates/').data);
  const templates = homeOnly ? homeTemplates(allTemplates) : allTemplates;
  const groups = listOf<Group>(useApi(canGroup ? '/api/groups/' : null).data);

  const selectedPerson = people.find(p => p.id === recipient);
  const selectedGroup = groups.find(g => g.id === group);

  function applyTemplate(id: number) {
    setTemplateId(id);
    const t = templates.find(t => t.id === id);
    if (t) setMessage(t.message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!message.trim()) { setFeedback('Say something first.'); return; }
    if (mode === 'user' && !recipient) { setFeedback('Pick someone.'); return; }
    if (mode === 'group' && !group) { setFeedback('Pick a group.'); return; }

    setBusy(true);
    try {
      const body: any = { message, priority, template: templateId || null };
      if (mode === 'user') body.recipient = recipient;
      else body.group = group;
      const r = await apiFetch<any>('/api/pings/', {
        method: 'POST', body: JSON.stringify(body),
      });
      const to = mode === 'user' ? selectedPerson?.full_name : selectedGroup?.name;
      setFeedback(`Sent to ${to || 'them'} · ping #${r.id}`);
      setMessage(''); setTemplateId('');
      window.dispatchEvent(new Event('op:sent'));
      onSent?.();
    } catch (e: any) {
      setFeedback(pingErrorMessage(e, 'Could not send. Try again.'));
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Mode toggle — Sunbeam segmented control (§15.4) */}
      {canGroup && (
        <div role="group" aria-label="Send to" data-tour="composer-mode" className="inline-flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {(['user', 'group'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
              className={'min-h-[36px] rounded-md px-3.5 text-sm font-semibold transition-colors duration-150 ' +
                (mode === m ? 'bg-gold-soft text-brand shadow-sm' : 'text-ink-2 hover:text-ink')}>
              {m === 'user' ? 'A person' : 'A group'}
            </button>
          ))}
        </div>
      )}

      {/* WHO */}
      {mode === 'user' ? (
        <div className="space-y-2" data-tour="composer-search">
          <PersonSelect
            people={people as Person[]}
            value={recipient}
            onChange={(id) => setRecipient(id)}
            excludeId={user?.id}
            autoFocus={autoFocus}
            placeholder="Type a name, team, or email…"
          />
          {selectedPerson?.status ? (
            <div className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-ink">
              {senderNotice(selectedPerson.full_name, selectedPerson.status)}
            </div>
          ) : selectedPerson && !selectedPerson.is_online && (
            <div className="text-sm text-warn">
              {selectedPerson.full_name} is offline — they'll see it when they return.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <select value={group} onChange={e => setGroup(Number(e.target.value) || '')}
                  className="input">
            <option value="">Which group?</option>
            {groups.map(g =>
              <option key={g.id} value={g.id}>{g.name} · {g.member_count} people</option>
            )}
          </select>
          {selectedGroup && (
            <div className="text-sm text-ink-2">
              Broadcasting to <span className="font-semibold text-ink">{selectedGroup.member_count} people</span> in “{selectedGroup.name}”.
            </div>
          )}
        </div>
      )}

      {/* QUICK TEMPLATES */}
      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick templates" data-tour="composer-templates">
          {templates.map(t => (
            <button key={t.id} type="button" onClick={() => applyTemplate(t.id)}
              aria-pressed={templateId === t.id}
              className={'chip-btn ' + (templateId === t.id ? 'is-active' : '')}>
              {t.title}
            </button>
          ))}
        </div>
      )}

      {/* MESSAGE */}
      <div>
        <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)}
          placeholder="A short message. “Please come here.”"
          className="input resize-none" />
        <div className="mt-1.5 flex items-center justify-between text-xs text-ink-3">
          <label data-tour="composer-urgent" className="-ml-1 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg px-1 text-sm sm:min-h-0">
            <input type="checkbox" checked={priority === 'URGENT'}
                   onChange={e => setPriority(e.target.checked ? 'URGENT' : 'NORMAL')}
                   className="h-4 w-4 accent-[rgb(var(--live))]" />
            <span className={priority === 'URGENT' ? 'font-semibold text-live' : 'text-ink-2'}>
              Mark urgent
            </span>
          </label>
          <span className="tabular-nums">{message.length}/500</span>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm" aria-live="polite">
          {feedback && (
            <span className={feedback.startsWith('Sent') ? 'text-success' : 'text-rose'}>
              {feedback}
            </span>
          )}
        </div>
        <button disabled={busy} data-tour="composer-send" className="btn-primary w-full sm:w-auto">
          <Icon name="send" size={16} />
          {busy ? 'Sending…' : 'Send ping'}
        </button>
      </div>
    </form>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from './ui';
import { PersonSelect, Person } from './PersonSelect';
type Group = { id: number; name: string; member_count: number };
type Template = { id: number; title: string; message: string };

export function PingComposer() {
  const { user } = useAuth();
  const [mode, setMode] = useState<'user' | 'group'>('user');
  const [people, setPeople] = useState<Person[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recipient, setRecipient] = useState<number | ''>('');
  const [group, setGroup] = useState<number | ''>('');
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canGroup = user && user.role !== 'MEMBER';

  useEffect(() => {
    apiFetch<{ results: Person[] }>('/api/users/').then(d => setPeople(d.results || (d as any))).catch(() => {});
    apiFetch<{ results: Template[] }>('/api/templates/').then(d => setTemplates(d.results || (d as any))).catch(() => {});
    if (canGroup) {
      apiFetch<{ results: Group[] }>('/api/groups/').then(d => setGroups(d.results || (d as any))).catch(() => {});
    }
  }, [canGroup]);

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
      setFeedback(`Sent · ping #${r.id}`);
      setMessage(''); setTemplateId('');
    } catch (e: any) {
      setFeedback(String(e.message).toLowerCase().includes('throttl')
        ? 'Rate limit — give it a second.'
        : 'Could not send. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Mode toggle — segmented, understated */}
      <div className="inline-flex rounded-tool border border-hairline overflow-hidden text-sm">
        <button type="button" onClick={() => setMode('user')}
          className={'px-3 py-1.5 ' + (mode === 'user' ? 'bg-ink text-white' : 'bg-card text-ink hover:bg-paper')}>
          A person
        </button>
        {canGroup && (
          <button type="button" onClick={() => setMode('group')}
            className={'px-3 py-1.5 border-l border-hairline ' + (mode === 'group' ? 'bg-ink text-white' : 'bg-card text-ink hover:bg-paper')}>
            A group
          </button>
        )}
      </div>

      {/* WHO */}
      {mode === 'user' ? (
        <div className="space-y-2">
          <PersonSelect
            people={people as Person[]}
            value={recipient}
            onChange={(id) => setRecipient(id)}
            excludeId={user?.id}
            placeholder="Type a name, team, or email…"
          />
          {selectedPerson && !selectedPerson.is_online && (
            <div className="text-sm text-ember">
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
            <div className="text-sm text-inkmute">
              Broadcasting to <span className="font-medium text-ink">{selectedGroup.member_count} people</span> in “{selectedGroup.name}”.
            </div>
          )}
        </div>
      )}

      {/* QUICK TEMPLATES */}
      {templates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {templates.map(t => (
            <button key={t.id} type="button" onClick={() => applyTemplate(t.id)}
              className={'chip cursor-pointer hover:border-ink/30 ' +
                (templateId === t.id ? 'border-ink bg-ink text-white' : '')}>
              {t.title}
            </button>
          ))}
        </div>
      )}

      {/* MESSAGE */}
      <div>
        <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)}
          placeholder="A short message. “Please come here.”"
          className="input resize-none text-base" />
        <div className="mt-1 flex items-center justify-between text-xs text-inkmute">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={priority === 'URGENT'}
                   onChange={e => setPriority(e.target.checked ? 'URGENT' : 'NORMAL')}
                   className="h-4 w-4 rounded border-hairline text-ember focus:ring-ember/30" />
            <span className={priority === 'URGENT' ? 'text-ember font-medium' : ''}>
              Mark urgent
            </span>
          </label>
          <span className="font-mono">{message.length}/500</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-5">
        <div className="text-xs text-inkmute">
          {feedback && (
            <span className={feedback.startsWith('Sent') ? 'text-jade-500' : 'text-ember'}>
              {feedback}
            </span>
          )}
        </div>
        <button disabled={busy} className="btn-ember">
          <Icon name="send" size={15} />
          {busy ? 'Sending…' : 'Send ping'}
        </button>
      </div>
    </form>
  );
}

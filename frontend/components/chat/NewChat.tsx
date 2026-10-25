'use client';

// "New message": pick a person, then open (or create) the chat with them.

import { useState } from 'react';
import { apiErrorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { openChatWith } from '../../lib/chat';
import { listOf, useApi } from '../../lib/useApi';
import { Person, PersonSelect } from '../PersonSelect';

export function NewChat({ onOpened, onCancel }: { onOpened: (id: number) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const people = listOf<Person>(useApi('/api/users/').data);
  const [error, setError] = useState('');

  async function pick(id: number | '') {
    if (!id) return;
    try { onOpened(await openChatWith(id)); }
    catch (e) { setError(apiErrorMessage(e, "Couldn't open that chat.")); }
  }

  return (
    <div className="border-b border-line px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-bold text-ink">New message</span>
        <button type="button" onClick={onCancel} className="text-sm font-semibold text-brand">Cancel</button>
      </div>
      <PersonSelect people={people} value="" onChange={pick} excludeId={user?.id} autoFocus
                    placeholder="Who do you want to message?" />
      {error && <p role="alert" className="mt-1.5 text-[13px] font-semibold text-rose-deep">{error}</p>}
    </div>
  );
}

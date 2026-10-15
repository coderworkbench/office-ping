'use client';

// A typeahead combobox for picking a person.
// Replaces the confusing "search input + native select" pair in the composer.
//
// Behaviour:
//   - Click/focus → opens a results panel below
//   - Typing filters by name + department + email + employee_code
//   - ↑/↓ to move highlight, Enter to pick, Esc or blur to close
//   - When a person is picked, the input shows their name; a × clears it
//   - "No matches" shown when the filter returns nothing

import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Icon } from './ui';

export type Person = {
  id: number;
  full_name: string;
  department?: string;
  email?: string;
  employee_code?: string | null;
  is_online: boolean;
};

export function PersonSelect({
  people, value, onChange, placeholder = 'Search people…', excludeId,
}: {
  people: Person[];
  value: number | '';
  onChange: (id: number | '') => void;
  placeholder?: string;
  excludeId?: number;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = people.find(p => p.id === value) || null;

  const filtered = useMemo(() => {
    const base = people.filter(p => p.id !== excludeId);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(p =>
      p.full_name.toLowerCase().includes(q)
      || (p.department || '').toLowerCase().includes(q)
      || (p.email || '').toLowerCase().includes(q)
      || (p.employee_code || '').toLowerCase().includes(q)
    );
  }, [people, query, excludeId]);

  // Reset highlight whenever the filtered list changes
  useEffect(() => { setHighlight(0); }, [query, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If no explicit selection, drop any typed-but-unresolved query
        if (!selected) setQuery('');
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, selected]);

  function pick(p: Person) {
    onChange(p.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange('');
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = filtered[highlight];
      if (p) pick(p);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'Backspace' && selected && !query) {
      clear();
    }
  }

  const inputValue = selected ? selected.full_name : query;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {selected ? (
          <span className="absolute left-2 top-1/2 -translate-y-1/2">
            <Avatar name={selected.full_name} size={22} online={selected.is_online} />
          </span>
        ) : (
          <Icon name="search" size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-inkmute" />
        )}
        <input
          ref={inputRef}
          className={'input ' + (selected ? 'pl-9' : 'pl-9')}
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => setOpen(true)}
          onChange={e => {
            if (selected) onChange('');
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKey}
          role="combobox" aria-expanded={open}
          aria-controls="person-select-listbox"
          aria-autocomplete="list"
        />
        {(selected || query) && (
          <button type="button" aria-label="Clear" onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-full text-inkmute hover:text-ink hover:bg-paper">
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          ref={panelRef}
          id="person-select-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-20 surface p-1 max-h-72 overflow-y-auto animate-fadeIn"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-inkmute">
              Nobody matches “<span className="font-medium">{query}</span>”.
            </div>
          ) : (
            filtered.map((p, i) => {
              const active = i === highlight;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(p)}
                  className={
                    'w-full flex items-center gap-3 text-left px-2 py-2 rounded-tool ' +
                    (active ? 'bg-paper' : 'hover:bg-paper')
                  }
                >
                  <Avatar name={p.full_name} size={28} online={p.is_online} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.full_name}</div>
                    <div className="text-xs text-inkmute truncate">
                      {p.department || '—'}
                      {p.email ? ` · ${p.email}` : ''}
                    </div>
                  </div>
                  <span className={'text-[11px] uppercase tracking-wider ' +
                    (p.is_online ? 'text-jade-500' : 'text-inkmute/70')}>
                    {p.is_online ? 'Online' : 'Offline'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

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
import { describeStatus, Status } from '../lib/status';

export type Person = {
  id: number;
  full_name: string;
  department?: string;
  email?: string;
  employee_code?: string | null;
  is_online: boolean;
  status?: Status | null;
};

export function PersonSelect({
  people, value, onChange, placeholder = 'Search people…', excludeId, autoFocus,
}: {
  people: Person[];
  value: number | '';
  onChange: (id: number | '') => void;
  placeholder?: string;
  excludeId?: number;
  autoFocus?: boolean;
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
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Avatar name={selected.full_name} size={24} online={selected.is_online} />
          </span>
        ) : (
          <Icon name="search" size={20}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
        )}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          aria-label="Who should get this?"
          className="input pl-11 pr-11"
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
            className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-lg text-ink-3 hover:bg-inset hover:text-ink">
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          ref={panelRef}
          id="person-select-listbox"
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1.5 shadow-lg animate-fadeIn"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-ink-2">
              Nobody matches “<span className="font-semibold text-ink">{query}</span>”.
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
                    'flex w-full min-h-[44px] items-center gap-3 rounded-lg px-2.5 py-2 text-left ' +
                    (active ? 'bg-gold-soft' : 'hover:bg-inset')
                  }
                >
                  <Avatar name={p.full_name} size={28} online={p.is_online} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{p.full_name}</div>
                    <div className="truncate text-xs text-ink-2">
                      {p.status ? describeStatus(p.status, { emoji: true })
                        : <>{p.department || '—'}{p.email ? ` · ${p.email}` : ''}</>}
                    </div>
                  </div>
                  <span className={'shrink-0 text-xs font-semibold ' +
                    (p.is_online ? 'text-success' : 'text-ink-2')}>
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

'use client';

// Small stale-while-revalidate cache for GET requests. A page that was
// visited before (or prefetched on hover) renders its last data straight
// away and refreshes in the background, instead of showing a skeleton on
// every visit. Several components asking for the same URL share one request.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { apiFetch } from './api';

type Entry = { data: any; at: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<any>>();
const listeners = new Set<() => void>();
let version = 0;

function notify() { version++; listeners.forEach(l => l()); }

export function fetchCached<T = any>(url: string): Promise<T> {
  const running = inflight.get(url);
  if (running) return running;
  const p = apiFetch<T>(url)
    .then(data => { cache.set(url, { data, at: Date.now() }); notify(); return data; })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Warm the cache (e.g. on hover over a link) unless the data is fresh. */
export function prefetch(url: string, maxAgeMs = 15000) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return;
  fetchCached(url).catch(() => {});
}

/** Drop cached entries whose URL starts with any of the prefixes ('' = all). */
export function invalidate(...prefixes: string[]) {
  for (const k of Array.from(cache.keys())) {
    if (prefixes.some(p => k.startsWith(p))) cache.delete(k);
  }
  notify();
}

/**
 * `data` is the cached value (possibly stale) or undefined on a first visit.
 * Refetches on mount, on any of the window events in `refreshOn`, and every
 * `intervalMs` if given. Pass null as the url to skip.
 */
export function useApi<T = any>(url: string | null, opts: { refreshOn?: string[]; intervalMs?: number } = {}) {
  useSyncExternalStore(subscribe, () => version, () => version);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(() => {
    if (!url) return Promise.resolve();
    return fetchCached<T>(url).then(() => setError(null), e => setError(e));
  }, [url]);

  const events = (opts.refreshOn || []).join(',');
  useEffect(() => {
    if (!url) return;
    reload();
    const h = () => { reload(); };
    const names = events ? events.split(',') : [];
    names.forEach(n => window.addEventListener(n, h));
    const t = opts.intervalMs ? setInterval(h, opts.intervalMs) : null;
    return () => {
      names.forEach(n => window.removeEventListener(n, h));
      if (t) clearInterval(t);
    };
  }, [url, reload, events, opts.intervalMs]);

  return { data: url ? (cache.get(url)?.data as T | undefined) : undefined, error, reload };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** DRF list responses are either an array or {count, results}. */
export function listOf<T>(d: any): T[] {
  return d ? (Array.isArray(d) ? d : d.results || []) : [];
}

/**
 * A paginated DRF list: the first page comes from the cache (useApi), "Show
 * more" appends the next pages. Rows are de-duplicated by id because new
 * items arriving on page 1 push older ones onto later pages.
 */
export function usePagedApi<T extends { id: number }>(url: string | null,
  opts: { refreshOn?: string[]; intervalMs?: number } = {}) {
  const first = useApi<any>(url, opts);
  const [more, setMore] = useState<{ url: string | null; pages: T[][]; next: string | null }>(
    { url: null, pages: [], next: null });
  const [loadingMore, setLoadingMore] = useState(false);

  // Start over whenever the list itself changes (another filter or tab).
  const extra = more.url === url ? more.pages : [];
  const next = more.url === url && more.pages.length ? more.next : first.data?.next ?? null;

  const seen = new Set<number>();
  const items: T[] | undefined = first.data === undefined ? undefined
    : [...listOf<T>(first.data), ...extra.flat()].filter(r => !seen.has(r.id) && !!seen.add(r.id));

  async function loadMore() {
    if (!url || !next || loadingMore) return;
    setLoadingMore(true);
    try {
      // DRF gives an absolute "next" URL; keep only its path and query.
      const u = new URL(next, window.location.origin);
      const d = await apiFetch<any>(u.pathname + u.search);
      setMore(m => ({ url, pages: [...(m.url === url ? m.pages : []), listOf<T>(d)], next: d.next }));
    } finally { setLoadingMore(false); }
  }

  return { items, count: first.data?.count as number | undefined, hasMore: !!next,
           loadMore, loadingMore, error: first.error, reload: first.reload };
}

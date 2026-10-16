// Collapse runs of the same ping ("👋 Nudge" tapped 8 times) into one row.
// The list is newest first; an item joins the run above it when it has the
// same key (sender, recipient and message) and came within `windowMs`.

export type Run<T> = { items: T[]; latest: T; count: number };

export function collapseRepeats<T>(
  list: T[], key: (t: T) => string, time: (t: T) => string, windowMs = 10 * 60 * 1000,
): Run<T>[] {
  const runs: Run<T>[] = [];
  for (const it of list) {
    const prev = runs[runs.length - 1];
    const last = prev?.items[prev.items.length - 1];
    if (prev && key(last!) === key(it)
        && Math.abs(Date.parse(time(last!)) - Date.parse(time(it))) <= windowMs) {
      prev.items.push(it);
      prev.count++;
    } else {
      runs.push({ items: [it], latest: it, count: 1 });
    }
  }
  return runs;
}

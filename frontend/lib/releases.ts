// Office Ping's versions, from content/releases.json (newest first).
// To ship a release, add an entry at the top and run `make manual`.
import history from '../content/releases.json';

export type ChangeKind = 'new' | 'improved' | 'fixed' | 'security';
export type Release = {
  version: string;
  /** YYYY-MM-DD, the day it went live. */
  date: string;
  title: string;
  changes: { kind: ChangeKind; text: string }[];
};

export const RELEASES = history.releases as Release[];
export const LATEST = RELEASES[0];

// "6 November 2026". Parsed as UTC so the day never shifts with the time zone.
export function formatReleaseDate(date: string) {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

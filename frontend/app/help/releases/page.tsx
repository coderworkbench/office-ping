'use client';
import Link from 'next/link';
import { Guard } from '../../../components/Guard';
import { Icon, PageHeader } from '../../../components/ui';
import { Inline } from '../../../components/help/Inline';
import { formatReleaseDate, LATEST, RELEASES, type ChangeKind } from '../../../lib/releases';
import history from '../../../content/releases.json';

// Release history: content/releases.json, newest first (also exported to
// CHANGELOG.md by scripts/export-manual.mjs).

const KIND: Record<ChangeKind, { label: string; className: string }> = {
  new:      { label: 'New',      className: 'bg-success-soft text-success' },
  improved: { label: 'Improved', className: 'bg-brand-soft text-brand' },
  fixed:    { label: 'Fixed',    className: 'bg-warn-soft text-warn' },
  security: { label: 'Security', className: 'bg-rose-soft text-rose-deep' },
};

export default function ReleasesPage() {
  return <Guard><Inner /></Guard>;
}

function Inner() {
  return (
    <div className="animate-fadeIn">
      <PageHeader
        eyebrow="Help"
        title="Release history"
        lead={<Inline text={history.intro} />}
        actions={
          <Link href="/help" className="btn-secondary">
            <Icon name="help" size={16} /> Back to Help
          </Link>
        }
      />

      <ol className="space-y-4 lg:space-y-6">
        {RELEASES.map(r => (
          <li key={r.version} id={`v${r.version}`} className="surface scroll-mt-20 p-4 sm:p-6 lg:scroll-mt-6 lg:p-7">
            <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="chip bg-gold-soft font-bold text-ink">v{r.version}</span>
              <h2 className="text-xl font-bold text-ink">{r.title}</h2>
              {r.version === LATEST.version && <span className="chip bg-success-soft text-success">Latest</span>}
              <time dateTime={r.date} className="text-sm text-ink-2 sm:ml-auto">{formatReleaseDate(r.date)}</time>
            </header>
            <ul className="max-w-3xl space-y-2.5 text-[15px] leading-relaxed text-ink-2">
              {r.changes.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:flex-nowrap">
                  <span className={'chip w-[5.5rem] shrink-0 justify-center ' + KIND[c.kind].className}>{KIND[c.kind].label}</span>
                  <span className="min-w-0"><Inline text={c.text} /></span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

'use client';
import { Fragment, ReactNode, useEffect, useState } from 'react';
import { Guard } from '../../components/Guard';
import { Icon, PageHeader } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import manual from '../../content/manual.json';
import { DemoPlayer } from '../../components/help/DemoPlayer';
import { DEMOS } from '../../components/help/demos';

// The manual's text lives in content/manual.json (also exported to
// docs/user-manual.md by scripts/export-manual.mjs). Sections are shown only
// to the roles that can use them.

type Audience = 'all' | 'hr' | 'admin';
type Block =
  | { p: string }
  | { steps: string[] }
  | { list: string[] }
  | { tip: string }
  | { h3: string }
  /** A command to copy; {origin} becomes this site's address. */
  | { code: string }
  | { download: { label: string; href: string; file: string } }
  | { table: { head: string[]; rows: string[][] } };
type Section = { id: string; title: string; audience: Audience; demos?: string[]; blocks: Block[] };

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'For everyone',
  hr: 'For HR & admins',
  admin: 'For admins',
};

export default function HelpPage() {
  return <Guard><Inner /></Guard>;
}

function Inner() {
  const { user } = useAuth();
  const role = user?.role;
  const canSee = (a: Audience) =>
    a === 'all' || (a === 'hr' && (role === 'HR' || role === 'ADMIN')) || (a === 'admin' && role === 'ADMIN');
  const sections = (manual.sections as Section[]).filter(s => canSee(s.audience));
  const groups = (['all', 'hr', 'admin'] as Audience[])
    .map(a => ({ audience: a, items: sections.filter(s => s.audience === a) }))
    .filter(g => g.items.length);

  return (
    <div className="animate-fadeIn">
      <PageHeader
        eyebrow="Help"
        title="How Office Ping works"
        lead={<Inline text={manual.intro} />}
        actions={
          <button className="btn-primary" onClick={() => window.dispatchEvent(new Event('op:tour'))}>
            <span aria-hidden>🧭</span> Show me around
          </button>
        }
      />

      <nav aria-label="Contents" className="surface mb-6 p-4 sm:p-5 lg:mb-8">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map(g => (
            <div key={g.audience}>
              <div className="eyebrow mb-1.5">{AUDIENCE_LABEL[g.audience]}</div>
              <ol className="text-sm">
                {g.items.map(s => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="inline-block py-1.5 font-semibold text-ink underline-offset-2 hover:text-brand hover:underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </nav>

      <div className="space-y-4 lg:space-y-6">
        {sections.map(s => (
          <section key={s.id} id={s.id} className="surface scroll-mt-20 p-4 sm:p-6 lg:scroll-mt-6 lg:p-7">
            <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-xl font-bold text-ink">{s.title}</h2>
              {s.audience !== 'all' && (
                <span className="chip bg-brand-soft text-brand">
                  {s.audience === 'hr' ? 'HR & admins' : 'Admins'}
                </span>
              )}
            </header>
            {!!s.demos?.length && (
              <div className={'mb-5 grid gap-4 ' + (s.demos.length > 1 ? 'xl:grid-cols-2' : 'max-w-2xl')}>
                {s.demos.filter(id => DEMOS[id]).map(id => <DemoPlayer key={id} demo={DEMOS[id]} />)}
              </div>
            )}
            <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-ink-2">
              {s.blocks.map((b, i) => <BlockView key={i} block={b} />)}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-sm text-ink-2">
        Still stuck? Ask your Office Ping admin.
      </p>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if ('p' in block) return <p><Inline text={block.p} /></p>;
  if ('steps' in block) return (
    <ol className="space-y-2">
      {block.steps.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-fill text-xs font-bold text-on-gold">
            {i + 1}
          </span>
          <span><Inline text={t} /></span>
        </li>
      ))}
    </ol>
  );
  if ('list' in block) return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-gold">
      {block.list.map((t, i) => <li key={i}><Inline text={t} /></li>)}
    </ul>
  );
  if ('h3' in block) return <h3 className="!mt-6 text-base font-bold text-ink">{block.h3}</h3>;
  if ('code' in block) return <CopyCommand command={block.code} />;
  if ('download' in block) return (
    <a href={block.download.href} download={block.download.file} className="btn-primary inline-flex">
      <Icon name="download" size={16} /> {block.download.label}
    </a>
  );
  if ('tip' in block) return (
    <div className="flex gap-3 rounded-xl border border-gold-fill/40 bg-gold-soft px-4 py-3 text-sm text-ink">
      <span aria-hidden>💡</span>
      <p><Inline text={block.tip} /></p>
    </div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left">
            {block.table.head.map(h => (
              <th key={h} className="th border-b border-line py-2 pr-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className={'border-b border-line-2 py-2.5 pr-4 ' + (j === 0 ? 'font-semibold text-ink sm:whitespace-nowrap' : '')}>
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A one-line command with a Copy button. {origin} is this site's address, so
// the commands work wherever Office Ping is hosted.
function CopyCommand({ command }: { command: string }) {
  const [origin, setOrigin] = useState('https://ping.tejgyan.org');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const text = command.replaceAll('{origin}', origin);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-surface-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-ink">{text}</code>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy command'}
              className="shrink-0 border-l border-line px-3 text-sm font-semibold text-brand hover:bg-inset">
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  );
}

// Minimal inline formatting: **bold** and *italic*.
function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold text-ink">{part.slice(2, -2)}</strong>;
        // Sunbeam ships no italic face (§3.1), so *emphasis* is semibold brand ink.
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <span key={i} className="font-semibold text-brand">{part.slice(1, -1)}</span>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

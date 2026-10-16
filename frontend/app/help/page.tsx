'use client';
import { Fragment, ReactNode } from 'react';
import { Guard } from '../../components/Guard';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import manual from '../../content/manual.json';

// The manual's text lives in content/manual.json (also exported to
// docs/user-manual.md by scripts/export-manual.mjs). Sections are shown only
// to the roles that can use them.

type Audience = 'all' | 'hr' | 'admin';
type Block =
  | { p: string }
  | { steps: string[] }
  | { list: string[] }
  | { tip: string }
  | { table: { head: string[]; rows: string[][] } };
type Section = { id: string; title: string; audience: Audience; blocks: Block[] };

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
        title={<>How Office Ping <em>works</em></>}
        lead={<Inline text={manual.intro} />}
      />

      <nav aria-label="Contents" className="surface p-5 mb-8">
        <div className="grid gap-5 sm:grid-cols-3">
          {groups.map(g => (
            <div key={g.audience}>
              <div className="label mb-2">{AUDIENCE_LABEL[g.audience]}</div>
              <ol className="space-y-1 text-sm">
                {g.items.map(s => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-ink hover:text-ember hover:underline underline-offset-2">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </nav>

      <div className="space-y-6">
        {sections.map(s => (
          <section key={s.id} id={s.id} className="surface p-5 lg:p-7 scroll-mt-6">
            <header className="mb-4 flex items-baseline gap-3 flex-wrap">
              <h2 className="display text-2xl font-medium">{s.title}</h2>
              {s.audience !== 'all' && (
                <span className="chip border-indigo/20 bg-indigo/5 text-indigo">
                  {s.audience === 'hr' ? 'HR & admins' : 'Admins'}
                </span>
              )}
            </header>
            <div className="space-y-4 text-[15px] leading-relaxed text-ink max-w-3xl">
              {s.blocks.map((b, i) => <BlockView key={i} block={b} />)}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-sm text-inkmute">
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
          <span className="shrink-0 h-6 w-6 rounded-full bg-ink text-white text-xs font-medium grid place-items-center mt-0.5">
            {i + 1}
          </span>
          <span><Inline text={t} /></span>
        </li>
      ))}
    </ol>
  );
  if ('list' in block) return (
    <ul className="space-y-1.5 list-disc pl-5 marker:text-inkmute">
      {block.list.map((t, i) => <li key={i}><Inline text={t} /></li>)}
    </ul>
  );
  if ('tip' in block) return (
    <div className="rounded-tool border border-hairline bg-paper px-4 py-3 text-sm flex gap-3">
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
              <th key={h} className="label py-2 pr-4 border-b border-hairline">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className={'py-2.5 pr-4 border-b border-hairline/70 ' + (j === 0 ? 'whitespace-nowrap' : '')}>
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

// Minimal inline formatting: **bold** and *italic*.
function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

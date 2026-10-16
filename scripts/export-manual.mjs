#!/usr/bin/env node
// Writes docs/user-manual.md from frontend/content/manual.json, the same
// source the in-app Help page (/help) renders. Run after editing the manual:
//   node scripts/export-manual.mjs      (or: make manual)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manual = JSON.parse(readFileSync(join(root, 'frontend/content/manual.json'), 'utf8'));

const AUDIENCE = { all: 'For everyone', hr: 'For HR and admins', admin: 'For admins' };
const slug = (s) => s.id;
const cell = (s) => s.replace(/\|/g, '\\|');

function block(b) {
  if ('p' in b) return b.p;
  if ('steps' in b) return b.steps.map((t, i) => `${i + 1}. ${t}`).join('\n');
  if ('list' in b) return b.list.map((t) => `- ${t}`).join('\n');
  if ('tip' in b) return `> 💡 ${b.tip}`;
  if ('table' in b) {
    const { head, rows } = b.table;
    return [
      `| ${head.map(cell).join(' | ')} |`,
      `|${head.map(() => '---').join('|')}|`,
      ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
    ].join('\n');
  }
  throw new Error('Unknown block: ' + JSON.stringify(b));
}

const out = [
  `<!-- Generated from frontend/content/manual.json by scripts/export-manual.mjs. Edit the JSON, not this file. -->`,
  `# ${manual.title}`,
  manual.intro,
  `The same manual is in the app: click **Help** in the sidebar. There, each person only sees the sections for their role.`,
  `## Contents`,
];
for (const a of ['all', 'hr', 'admin']) {
  const items = manual.sections.filter((s) => s.audience === a);
  if (!items.length) continue;
  out.push(`**${AUDIENCE[a]}**\n\n` + items.map((s) => `- [${s.title}](#${slug(s)})`).join('\n'));
}
for (const s of manual.sections) {
  const heading = [`<a id="${slug(s)}"></a>`, `## ${s.title}`];
  if (s.audience !== 'all') heading.push(`*${AUDIENCE[s.audience]}*`);
  out.push(heading.join('\n\n'), ...s.blocks.map(block));
}

writeFileSync(join(root, 'docs/user-manual.md'), out.join('\n\n') + '\n');
console.log('Wrote docs/user-manual.md');

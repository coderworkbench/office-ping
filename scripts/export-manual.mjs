#!/usr/bin/env node
// Writes docs/user-manual.md from frontend/content/manual.json and
// CHANGELOG.md from frontend/content/releases.json, the same sources the
// in-app Help page (/help) and Release history (/help/releases) render.
// Run after editing either:
//   node scripts/export-manual.mjs      (or: make manual)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manual = JSON.parse(readFileSync(join(root, 'frontend/content/manual.json'), 'utf8'));

// Commands and downloads in the app use the address it's opened at; this
// Markdown copy uses the production address.
const ORIGIN = process.env.OFFICE_PING_URL || 'https://ping.tejgyan.org';

const AUDIENCE = { all: 'For everyone', hr: 'For HR and admins', admin: 'For admins' };
const slug = (s) => s.id;
const cell = (s) => s.replace(/\|/g, '\\|');

function block(b) {
  if ('p' in b) return b.p;
  if ('steps' in b) return b.steps.map((t, i) => `${i + 1}. ${t}`).join('\n');
  if ('list' in b) return b.list.map((t) => `- ${t}`).join('\n');
  if ('tip' in b) return `> 💡 ${b.tip}`;
  if ('h3' in b) return `### ${b.h3}`;
  if ('code' in b) return '```\n' + b.code.replaceAll('{origin}', ORIGIN) + '\n```';
  if ('download' in b) return `[⬇ ${b.download.label}](${ORIGIN}${b.download.href})`;
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
  if (s.demos?.length) heading.push('> 🎬 In the app (Help page) this section has an animated demo.');
  out.push(heading.join('\n\n'), ...s.blocks.map(block));
}

writeFileSync(join(root, 'docs/user-manual.md'), out.join('\n\n') + '\n');
console.log('Wrote docs/user-manual.md');

// Release history → CHANGELOG.md. Fails on a malformed entry so a bad
// release note never ships.
const { releases } = JSON.parse(readFileSync(join(root, 'frontend/content/releases.json'), 'utf8'));
const KIND = { new: 'New', improved: 'Improved', fixed: 'Fixed', security: 'Security' };
const versions = new Set();
releases.forEach((r, i) => {
  const where = `releases.json: ${r.version || `entry ${i + 1}`}`;
  if (!/^\d+\.\d+\.\d+$/.test(r.version)) throw new Error(`${where}: version must look like 1.2.3`);
  if (versions.has(r.version)) throw new Error(`${where}: version listed twice`);
  versions.add(r.version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error(`${where}: date must be YYYY-MM-DD`);
  if (i && r.date > releases[i - 1].date) throw new Error(`${where}: newest release goes first`);
  if (!r.title || !r.changes?.length) throw new Error(`${where}: needs a title and changes`);
  for (const c of r.changes) if (!KIND[c.kind]) throw new Error(`${where}: unknown kind "${c.kind}"`);
});

const changelog = [
  `<!-- Generated from frontend/content/releases.json by scripts/export-manual.mjs. Edit the JSON, not this file. -->`,
  `# Release history`,
  `What changed in each version of Office Ping, newest first. The same list is in the app: **Help → What's new**.`,
  ...releases.map((r) => [
    `## ${r.version} — ${r.date}`,
    `**${r.title}**`,
    r.changes.map((c) => `- **${KIND[c.kind]}:** ${c.text}`).join('\n'),
  ].join('\n\n')),
];
writeFileSync(join(root, 'CHANGELOG.md'), changelog.join('\n\n') + '\n');
console.log('Wrote CHANGELOG.md');

// Research report: empty values, low-confidence values, ranges and cost basis per card.
// Usage: npm run report [-- <data-root>] [--md out.md]
import { writeFileSync } from 'node:fs';
import { loadData } from './lib/load.ts';
import { validate } from './lib/validate.ts';
import type { SystemCard, SourcedNumber } from '../src/model/types.ts';

const args = process.argv.slice(2);
const mdIdx = args.indexOf('--md');
const mdOut = mdIdx >= 0 ? args[mdIdx + 1] : null;
const root = args.find((a, i) => !a.startsWith('--') && i !== mdIdx + 1) ?? 'data';
const data = loadData(root);
const { issues } = validate(data);

const lines: string[] = ['# Data report', '', `Generated ${new Date().toISOString().slice(0, 10)} from \`${root}/\`.`, ''];
const byFile = new Map<string, typeof issues>();
for (const i of issues) byFile.set(i.file, [...(byFile.get(i.file) ?? []), i]);

lines.push('| Card | Empty | Low conf. | Ranges | Cost basis |', '|---|---|---|---|---|');
for (const f of data.systems) {
  const c = f.data as SystemCard;
  const values: [string, SourcedNumber][] = [
    ...Object.entries(c.specs ?? {}),
    ['in_service_since', c.in_service_since],
    ['units_built', c.units_built],
    ['cost', c.cost],
  ];
  const empty = values.filter(([, v]) => v?.value == null).map(([k]) => k);
  const low = values.filter(([, v]) => v?.confidence === 'low').map(([k]) => k);
  const ranges = values.filter(([, v]) => v?.range).map(([k, v]) => `${k} ${v.range!.min}–${v.range!.max}`);
  const basis = c.cost?.value != null ? `${c.cost.basis}, ${c.cost.currency} ${c.cost.price_year}` : '—';
  lines.push(`| ${c.name} | ${empty.join(', ') || '—'} | ${low.join(', ') || '—'} | ${ranges.join('; ') || '—'} | ${basis} |`);
}
lines.push('', '## Issues by file', '');
for (const [file, list] of byFile) {
  lines.push(`### ${file}`);
  for (const i of list) lines.push(`- **${i.level}** ${i.path || '(file)'}: ${i.message}`);
  lines.push('');
}
const md = lines.join('\n');
if (mdOut) writeFileSync(mdOut, md);
console.log(md);

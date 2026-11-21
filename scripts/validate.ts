// Usage: npm run validate [-- <data-root>]   (default: data)
import { loadData } from './lib/load.ts';
import { validate, formatIssue } from './lib/validate.ts';

const root = process.argv[2] ?? 'data';
const verbose = process.argv.includes('--gaps');
const data = loadData(root);
const { issues, errors } = validate(data);
const warnings = issues.filter((i) => i.level === 'warning');
const gaps = issues.filter((i) => i.level === 'gap');

for (const i of [...errors, ...warnings, ...(verbose ? gaps : [])]) console.log(formatIssue(i));
const files = data.categories.length + data.systems.length + data.sources.length + data.manufacturers.length;
console.log(
  `\n${files} files checked in ${root}/: ${errors.length} error(s), ${warnings.length} warning(s), ${gaps.length} empty value(s)` +
    (verbose || gaps.length === 0 ? '' : ' (run with --gaps or npm run report to list them)'),
);
process.exit(errors.length ? 1 : 0);

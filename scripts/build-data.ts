// Compile data/**/*.yaml into src/generated/deck.json. Refuses to build invalid data.
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadData } from './lib/load.ts';
import { validate, formatIssue } from './lib/validate.ts';
import { compileDeck } from './lib/compile.ts';

const root = process.argv[2] ?? 'data';
const out = 'src/generated/deck.json';
const data = loadData(root);
const { errors } = validate(data);
if (errors.length) {
  errors.forEach((e) => console.error(formatIssue(e)));
  console.error(`\nbuild-data: ${errors.length} validation error(s); not building.`);
  process.exit(1);
}
const deck = compileDeck(data);
mkdirSync('src/generated', { recursive: true });
writeFileSync(out, JSON.stringify(deck, null, 1));
console.log(`build-data: ${deck.categories.length} categories, ${deck.systems.length} systems → ${out}`);

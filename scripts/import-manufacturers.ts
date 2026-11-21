// Read-only import of manufacturer context from an external handover bundle into data/manufacturers/.
// Usage: npm run import:manufacturers -- <bundle-dir>
// The bundle is expected to contain manifest.json. Nothing is written back to the bundle.
// data/manufacturers/ is gitignored: this context stays local unless you decide otherwise.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'manifest.json'))) {
  console.error('Usage: npm run import:manufacturers -- <bundle-dir containing manifest.json>');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
// Accept a few plausible shapes: { companies: [...] }, { manufacturers: [...] }, or { files: [{ path }] } pointing to JSON per company.
let companies: Record<string, unknown>[] = manifest.companies ?? manifest.manufacturers ?? [];
if (!companies.length && Array.isArray(manifest.files))
  companies = manifest.files
    .filter((f: { path?: string }) => f.path?.endsWith('.json'))
    .map((f: { path: string }) => JSON.parse(readFileSync(join(dir, f.path), 'utf8')));
if (!companies.length) {
  console.error(`No companies found in manifest. Top-level keys: ${Object.keys(manifest).join(', ')}`);
  process.exit(1);
}
const KEEP = /^(name|slug|headquarters|hq|country|ownership|owner|revenue.*|employees.*|founded|key_products|segments?|fiscal_year|as_of|source.*)$/i;
mkdirSync('data/manufacturers', { recursive: true });
let n = 0;
for (const c of companies) {
  const slug = String(c.slug ?? c.id ?? '').toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) continue;
  const out = Object.fromEntries(Object.entries(c).filter(([k]) => KEEP.test(k)));
  writeFileSync(`data/manufacturers/${slug}.yaml`, `# Imported read-only from ${manifest.date ?? 'handover bundle'}; do not edit by hand.\n` + stringify({ slug, ...out }));
  n++;
}
console.log(`Imported ${n} manufacturers into data/manufacturers/.`);

// Find openly licensed rank insignia on Wikimedia Commons for every rank file in data/ranks/.
// Candidates come from the free Commons API; Claude only matches files to ranks (no web search).
// Output: data/insignia/<force-id>.yaml  (rank id -> image with licence and author)
//   npm run research:insignia [-- --only de-army] [--force]
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { loadData } from '../lib/load.ts';
import type { RankForce } from '../../src/model/types.ts';
import { MODEL, Meter, budget, canSpend, record, spent } from './ledger.ts';

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const force = args.includes('--force');
const today = new Date().toISOString().slice(0, 10);
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'quartermaster-research/0.1 (personal learning project)';
const OPEN = /^(cc0|cc[ -]by(-sa)?[ -]?\d|public domain|pd|pdm)/i;
const strip = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

interface Cand { n: number; title: string; page_url: string; image_url: string; licence: string; licence_url: string; author: string; description: string }

async function search(query: string): Promise<Cand[]> {
  const url = new URL(API);
  Object.entries({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: query, gsrlimit: '6',
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '240',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  let res: Response | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) break;
    if (res.status !== 429 && res.status < 500) break;
    const wait = Number(res.headers.get('retry-after')) || 15 * (attempt + 1);
    console.log(`  Commons ${res.status}, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  if (!res?.ok) throw new Error(`Commons ${res?.status}`);
  const pages = Object.values((await res.json()).query?.pages ?? {}) as any[];
  return pages
    .filter((p) => p.imageinfo?.[0])
    .map((p) => {
      const ii = p.imageinfo[0];
      const m = ii.extmetadata ?? {};
      const g = (k: string) => strip(m[k]?.value);
      return { n: 0, title: p.title, page_url: ii.descriptionurl, image_url: ii.thumburl ?? ii.url, licence: g('LicenseShortName'), licence_url: m.LicenseUrl?.value ?? '', author: g('Artist').slice(0, 160), description: g('ImageDescription').slice(0, 160) };
    });
}

const client = new Anthropic();
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['matches'],
  properties: { matches: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['rank_id', 'n'], properties: { rank_id: { type: 'string' }, n: { type: 'integer' } } } } },
};

async function main() {
  console.log(`Budget: $${spent().toFixed(2)} spent of $${budget()}.`);
  const only = opt('only');
  const forces = loadData('data').ranks.map((f) => f.data as RankForce).filter((r) => !only || r.id === only);
  for (const r of forces) {
    const out = `data/insignia/${r.id}.yaml`;
    if (existsSync(out) && !force) continue;
    if (!canSpend(0.3)) {
      console.log(`Budget stop before ${r.id}.`);
      break;
    }
    const seen = new Map<string, Cand>();
    for (const k of r.ranks) for (const c of await search(`${k.name} ${r.force} insignia`)) if (!seen.has(c.title)) seen.set(c.title, c);
    const cands = [...seen.values()].filter((c) => OPEN.test(c.licence)).map((c, i) => ({ ...c, n: i + 1 }));
    const meter = new Meter();
    let matches: { rank_id: string; n: number }[] = [];
    if (cands.length) {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 6000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [
          {
            role: 'user',
            content: `Match rank insignia images to the ranks of the ${r.force_en} (${r.force}). Only match a file whose title or description clearly shows the current insignia of exactly that rank in this service (not another service, not a historic version, not a collection sheet of many ranks). At most one file per rank; leave a rank out rather than guess.
Ranks:
${r.ranks.map((k) => `${k.id}: ${k.name} (${k.name_en}, ${k.code})`).join('\n')}
Files:
${cands.map((c) => `#${c.n} ${c.title} | ${c.licence} | ${c.description}`).join('\n')}`,
          },
        ],
      });
      meter.add(msg.usage);
      const t = msg.content.find((b) => b.type === 'text');
      if (t?.type === 'text') matches = JSON.parse(t.text).matches;
    }
    const ids = new Set(r.ranks.map((k) => k.id));
    const insignia = Object.fromEntries(
      matches
        .filter((m) => ids.has(m.rank_id))
        .map((m) => ({ m, c: cands.find((c) => c.n === m.n) }))
        .filter((x) => x.c)
        .map(({ m, c }) => [
          m.rank_id,
          { page_url: c!.page_url, image_url: c!.image_url, title: c!.title.replace(/^File:/, ''), caption: `Insignia: ${r.ranks.find((k) => k.id === m.rank_id)!.name}`, shows: 'exact_variant', licence: c!.licence, licence_url: c!.licence_url || undefined, author: c!.author || undefined, priority: 'A', retrieved: today },
        ]),
    );
    mkdirSync('data/insignia', { recursive: true });
    writeFileSync(out, `# Openly licensed insignia (Wikimedia Commons), matched ${today}. Attribution is shown with each image.\n` + stringify({ id: r.id, insignia }, { lineWidth: 0 }));
    const total = record(`insignia/${r.id}`, meter);
    console.log(`  ${r.id}: ${Object.keys(insignia).length}/${r.ranks.length} insignia from ${cands.length} candidates — $${meter.usd.toFixed(3)} — total $${total.toFixed(2)}/${budget()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

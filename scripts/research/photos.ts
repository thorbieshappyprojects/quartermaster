// Find openly licensed photos for every system card on Wikimedia Commons.
// Candidates come from the free Commons API; Claude only picks the ones that really show the system
// (no web search). Everything on Commons carries a free licence (CC BY, CC BY-SA, CC0, public domain),
// so these are all priority A. Output: data/photos/<category>/<id>.yaml
//   npm run research:photos [-- --category <id>] [--only <id>] [--force]
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { loadData } from '../lib/load.ts';
import type { SystemCard } from '../../src/model/types.ts';
import { MODEL, Meter, budget, canSpend, record, spent } from './ledger.ts';

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const force = args.includes('--force');
const today = new Date().toISOString().slice(0, 10);
const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia asks automated clients to identify themselves; no personal contact details are sent.
const UA = 'quartermaster-research/0.1 (personal learning project)';
const OPEN = /^(cc0|cc[ -]by(-sa)?[ -]?\d|public domain|pd|pdm)/i;

interface Candidate {
  n: number;
  title: string;
  page_url: string;
  image_url: string;
  width: number;
  height: number;
  licence: string;
  licence_url: string;
  author: string;
  credit: string;
  description: string;
  date: string;
}

const strip = (s = '') => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function search(query: string, limit = 10): Promise<Candidate[]> {
  const url = new URL(API);
  Object.entries({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: `${query} filetype:bitmap`, gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1200',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription|DateTimeOriginal|Credit',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  const pages = Object.values((await res.json()).query?.pages ?? {}) as any[];
  return pages
    .filter((p) => p.imageinfo?.[0])
    .map((p) => {
      const ii = p.imageinfo[0];
      const m = ii.extmetadata ?? {};
      const g = (k: string) => strip(m[k]?.value);
      return {
        n: 0, title: p.title, page_url: ii.descriptionurl, image_url: ii.thumburl ?? ii.url, width: ii.width, height: ii.height,
        licence: g('LicenseShortName'), licence_url: m.LicenseUrl?.value ?? '', author: g('Artist').slice(0, 160),
        credit: g('Credit').slice(0, 200), description: g('ImageDescription').slice(0, 300), date: g('DateTimeOriginal').slice(0, 20),
      };
    });
}

const client = new Anthropic();
const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['picks', 'note'],
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'shows', 'caption'],
        properties: {
          n: { type: 'integer' },
          shows: { type: 'string', enum: ['exact_variant', 'same_family'] },
          caption: { type: 'string' },
        },
      },
    },
    note: { type: 'string' },
  },
};

async function pick(card: SystemCard, cands: Candidate[], meter: Meter) {
  const list = cands
    .map((c) => `#${c.n} ${c.title}\n   licence: ${c.licence} | ${c.width}x${c.height} | date: ${c.date}\n   description: ${c.description}`)
    .join('\n');
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PICK_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Pick up to 3 photos for a learning card about the "${card.name}" (${card.variant_note ?? ''}; family: ${card.family ?? 'n/a'}; also known as ${(card.aliases ?? []).join(', ') || 'n/a'}).
Only pick a file if its title or description clearly shows this system. Prefer: the exact current variant, the whole vehicle in side or three-quarter view, good resolution, a real photo (no drawings, models, diagrams, toys or museum mock-ups unless nothing else exists). If only older variants of the same family exist, you may pick one and mark shows: same_family. Pick nothing rather than a doubtful match.
caption: one short neutral sentence describing what the photo shows, based only on the file title/description (e.g. "Leopard 2A8 of the German Army during a demonstration, 2025").
Candidates:
${list}`,
      },
    ],
  });
  meter.add(msg.usage);
  const text = msg.content.find((b) => b.type === 'text');
  if (msg.stop_reason === 'refusal' || !text || text.type !== 'text') return { picks: [], note: `no answer (${msg.stop_reason})` };
  return JSON.parse(text.text) as { picks: { n: number; shows: string; caption: string }[]; note: string };
}

async function main() {
  console.log(`Budget: $${spent().toFixed(2)} spent of $${budget()}.`);
  const only = opt('only');
  const cat = opt('category');
  const cards = loadData('data').systems.map((f) => f.data as SystemCard).filter((c) => (!cat || c.category === cat) && (!only || c.id === only));
  for (const card of cards) {
    const out = `data/photos/${card.category}/${card.id}.yaml`;
    if (existsSync(out) && !force) continue;
    if (!canSpend(0.3)) {
      console.log(`Budget stop before ${card.id}.`);
      break;
    }
    const queries = [...new Set([card.name, ...(card.aliases ?? []).slice(0, 2), card.family].filter(Boolean) as string[])];
    const seen = new Map<string, Candidate>();
    for (const q of queries) for (const c of await search(q)) if (!seen.has(c.title)) seen.set(c.title, c);
    const cands = [...seen.values()].filter((c) => OPEN.test(c.licence) && c.width >= 640).slice(0, 24).map((c, i) => ({ ...c, n: i + 1 }));
    const meter = new Meter();
    let picks: { n: number; shows: string; caption: string }[] = [];
    let note = '';
    if (cands.length) ({ picks, note } = await pick(card, cands, meter));
    else note = 'no openly licensed candidates found on Wikimedia Commons';
    const photos = picks
      .map((p) => ({ p, c: cands.find((c) => c.n === p.n) }))
      .filter((x) => x.c)
      .map(({ p, c }) => ({
        page_url: c!.page_url, image_url: c!.image_url, title: c!.title.replace(/^File:/, ''), caption: p.caption, shows: p.shows,
        licence: c!.licence, licence_url: c!.licence_url || undefined, author: c!.author || undefined, credit: c!.credit || undefined,
        priority: 'A', retrieved: today,
      }));
    mkdirSync(`data/photos/${card.category}`, { recursive: true });
    writeFileSync(out, `# Openly licensed photos (Wikimedia Commons), selected ${today}. Attribution is shown with each photo.\n` + stringify({ id: card.id, photos, note: note || undefined }, { lineWidth: 0 }));
    const total = record(`photos/${card.id}`, meter);
    console.log(`  ${card.id}: ${photos.length} photo(s) from ${cands.length} candidates — $${meter.usd.toFixed(3)} — total $${total.toFixed(2)}/${budget()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

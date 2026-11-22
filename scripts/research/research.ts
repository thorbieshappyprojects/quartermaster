// Research system cards and category cards with Claude + web search, within a hard USD budget.
//
//   npm run research -- --category main-battle-tank            # category card + all target systems
//   npm run research -- --category main-battle-tank --only t-90m
//   npm run research -- --category main-battle-tank --force    # overwrite existing files
//   npm run research -- --estimate                             # show ledger and budget only
//
// Output: data/categories/<cat>.yaml, data/systems/<cat>/<id>.yaml,
//         scripts/research/logs/<cat>/<id>.json (queries, URLs seen, cost, unseen-URL warnings).
// Every card is validated after writing; validation errors are sent back once or twice for repair.
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadData } from '../lib/load.ts';
import { validate, formatIssue, type Issue } from '../lib/validate.ts';

const MODEL = 'claude-opus-5-5';
// USD per million tokens / per search. Update if pricing changes.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, perSearch: 0.01 };
const LEDGER = 'scripts/research/ledger.json';
const EST_PER_CARD = Number(process.env.RESEARCH_RESERVE_USD ?? 1.5); // reserve required before starting a card
const today = new Date().toISOString().slice(0, 10);

type Target = { id: string; name: string };
interface LedgerEntry { date: string; item: string; usd: number; input: number; output: number; searches: number }
interface Ledger { spentUsd: number; entries: LedgerEntry[] }

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const budget = Number(process.env.RESEARCH_BUDGET_USD ?? 20);
const effort = (opt('effort') ?? 'high') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const ledger: Ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spentUsd: 0, entries: [] };
const saveLedger = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');

function costOf(u: Anthropic.Beta.BetaUsage) {
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  const usd =
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) /
      1e6 +
    searches * PRICE.perSearch;
  return { usd, searches };
}

// ---------- prompts ----------

const RULES = `You are a meticulous defence-equipment researcher filling cards for a learning card game.
Hard rules - follow them exactly:
- Public, catalogue-level information only (manufacturer pages and brochures, government/MoD/parliament publications,
  reference works such as IISS Military Balance, SIPRI, Jane's summaries, trade press like Defense News, Army Recognition,
  Janes, Breaking Defense, Hartpunkt, ESD). No leaked, classified or export-controlled detail.
- NEVER invent or estimate a value. If you cannot find a public figure, write value: null, source: null, confidence: null.
- Every non-null value has a source id and a confidence (high = manufacturer/government states it exactly;
  medium = reputable reference/trade press; low = single secondary source or inconsistent reporting).
- Conflicting public figures: store range: {min, max} and choose the displayed value explicitly (prefer manufacturer
  or government figures); explain in note.
- Wikipedia is only a pointer: follow it to the underlying source and cite that. Cite Wikipedia only if nothing else exists (then confidence low).
- Only cite URLs you actually saw in search results or fetched. Use the exact URL.
- Cost: per-unit value with currency (ISO 4217), price_year and basis: unit_price (stated unit/flyaway price) or
  contract_per_unit (contract value / units; includes training, spares). Say which contract in note.
- Neutral tone; no marketing language. English.
- Retrieval date for every source: ${today}.
- Use short source ids: s1, s2, ...
Output: after researching, reply with exactly one fenced \`\`\`yaml block containing the complete file and nothing after it.`;

/** Platform ids for the ammunition fires relation (tube artillery cards). */
const platforms = () => loadData('data').systems.map((f) => f.data as { id: string; category: string }).filter((c) => c.category === 'tube-artillery').map((c) => c.id);

function systemPrompt(cat: { id: string; indicators: { id: string; label: string; unit: string; derived?: unknown; description?: string }[] }, target: Target, all: Target[]) {
  const stored = cat.indicators.filter((i) => !i.derived);
  return `Research the "${target.name}" for category "${cat.id}".
Describe the variant named here. Older variants that are still in service count (the deck covers every system in use, not only the newest); if the name is only a family, use its most widely fielded variant in service. Keep id: ${target.id} exactly (the file name is fixed); put the precise variant in name.

The YAML must follow this shape (all keys required unless marked optional):

id: ${target.id}
category: ${cat.id}
name: <short current variant name, max 32 chars, e.g. "Leopard 2A8" - no descriptions>
variant_note: <optional, one short phrase: the configuration or batch the values describe>
family: <product family, e.g. "Leopard 2">            # optional
aliases: [<other names>]                              # optional
manufacturer: { name: <prime contractor> }
production_sites: [ { place: <city>, country: <ISO2>, source: sX } ]   # optional
origin: <ISO 3166-1 alpha-2 of the developing country>
role: <one neutral sentence, max 200 chars>
memorable_fact: { text: <one sentence a learner remembers>, source: sX }
status: in_production | in_service | retired
in_service_since: { value: <year of first service of this variant or of the base system - say which in note>, source: sX, confidence: high|medium|low }
units_built: { value: <integer, this variant/family - say which in note>, source: sX, confidence: ... }
combat_use: { text: <one or two sentences, or "No confirmed combat use as of ${today.slice(0, 4)}.">, source: sX }   # optional if nothing found
specs:
${stored.map((i) => `  ${i.id}: { value: <number in ${i.unit || 'count'}>, source: sX, confidence: ... }   # ${i.label}${i.description ? ' - ' + i.description : ''}`).join('\n')}
operators:
  - { country: <ISO2>, force: <e.g. Army>, state: in_service|ordered|retired|evaluating, quantity: <int or null>, source: sX }
cost: { value: <number or null>, currency: <ISO 4217 or null>, price_year: <year or null>, basis: unit_price|contract_per_unit|null, source: <sX or null>, confidence: <or null>, note: <which contract> }
contracts:                                             # optional, the 1-4 most significant
  - { customer: <country/force>, year: <int>, quantity: <int|null>, value: <number|null>, currency: <ISO|null>, note: <...>, source: sX }
peers: [ <2-4 ids of the closest direct competitors, ONLY from this list: ${all.filter((t) => t.id !== target.id).map((t) => t.id).join(', ')}> ]${cat.id.endsWith('ammunition') ? `\nfired_by: [ <ids of platforms from this list that are documented to fire this round: ${platforms().join(', ')}> ]` : ''}
sources:
  - { id: s1, url: <exact URL>, title: <page title>, publisher: <organisation>, retrieved: ${today}, kind: manufacturer|government|reference|press|other }

Spec units: values must be plain numbers in the stated unit (convert if needed, note the original). Every spec key above must be present (null if not found).
Optional per value: range: {min, max} and note: "...". Every listed source must be referenced at least once.`;
}

function categoryPrompt(cat: { id: string; name: string }) {
  return `Write the category card for "${cat.name}" (id ${cat.id}). Research recent, reputable public analysis
(think tanks such as RUSI, CSIS, IISS, RAND; military journals; government doctrine publications; quality trade press).
Reply with one yaml block of this shape:

category_card:
  summary: <two neutral sentences on what this category is>
  purpose:    [ { text: <one sentence>, source: sX }, ... ]   # 2-3 items: role in modern warfare
  strengths:  [ ... ]   # 2-4 items
  weaknesses: [ ... ]   # 2-4 items
  counters:   [ ... ]   # 2-4 items: typical threats/counters
  trends:     [ ... ]   # 2-4 items: current development trends (e.g. lessons from Ukraine)
sources:
  - { id: s1, url: <exact URL>, title: ..., publisher: ..., retrieved: ${today}, kind: manufacturer|government|reference|press|other }

category_card has exactly the keys summary, purpose, strengths, weaknesses, counters, trends (no id or name).
kind must be one of manufacturer, government, reference, press, other (think tanks and journals are "reference").
Every item cites a source you actually read. Every source must be used.`;
}

// ---------- API loop ----------

const client = new Anthropic();
const TOOLS = [
  { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 15 },
  { type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: 10, max_content_tokens: 20000 },
];

interface RunResult { text: string; urls: Set<string>; queries: string[]; usd: number; input: number; output: number; searches: number }

function collect(content: Anthropic.Beta.BetaContentBlock[], urls: Set<string>, queries: string[]) {
  for (const b of content) {
    if (b.type === 'server_tool_use') {
      const input = b.input as { query?: string; url?: string };
      if (input.query) queries.push(input.query);
      if (input.url) urls.add(input.url);
    } else if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === 'web_search_result') urls.add(r.url);
    } else if (b.type === 'web_fetch_tool_result') {
      const c = b.content as { type: string; url?: string };
      if (c.type === 'web_fetch_result' && c.url) urls.add(c.url);
    }
  }
}

async function converse(messages: Anthropic.Beta.BetaMessageParam[], system: string, acc: RunResult): Promise<Anthropic.Beta.BetaMessage> {
  let drops = 0;
  for (let turn = 0; turn < 8; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'adaptive' },
      output_config: { effort },
      system: RULES + '\n\n' + system,
      tools: TOOLS,
      messages,
    });
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
    } catch (e) {
      // A dropped connection is not an APIError; retry the same turn a couple of times.
      // Tokens streamed before the drop may still be billed but are not in the ledger.
      if (e instanceof Anthropic.APIError || ++drops > 2) throw e;
      console.log(`  connection dropped (${(e as Error).message}), retrying turn`);
      turn--;
      continue;
    }
    const c = costOf(msg.usage);
    acc.usd += c.usd;
    acc.searches += c.searches;
    acc.input += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
    acc.output += msg.usage.output_tokens;
    collect(msg.content, acc.urls, acc.queries);
    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue;
    if (msg.stop_reason === 'refusal') throw new Error(`refused: ${msg.stop_details?.category ?? 'unknown'}`);
    if (msg.stop_reason === 'max_tokens') throw new Error('hit max_tokens');
    return msg;
  }
  throw new Error('too many continuation turns');
}

function extractYaml(msg: Anthropic.Beta.BetaMessage): string | null {
  const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
  const blocks = [...text.matchAll(/```ya?ml\s*\n([\s\S]*?)```/g)];
  return blocks.length ? blocks[blocks.length - 1][1] : null;
}

/** Validate the whole data dir, return errors for one file (ignoring peers that are still pending research). */
function errorsFor(file: string, pending: Set<string>): Issue[] {
  const { issues } = validate(loadData('data'));
  return issues.filter(
    (i) => i.file === file && i.level === 'error' && !(/^peers\[/.test(i.path) && [...pending].some((p) => i.message.includes(`'${p}'`))),
  );
}

function checkBudget(item: string) {
  const left = budget - ledger.spentUsd;
  if (left < EST_PER_CARD) {
    console.log(`\nBudget stop before ${item}: spent $${ledger.spentUsd.toFixed(2)} of $${budget}.`);
    saveLedger();
    process.exit(0);
  }
}

function record(item: string, acc: RunResult) {
  ledger.spentUsd = Math.round((ledger.spentUsd + acc.usd) * 10000) / 10000;
  ledger.entries.push({ date: today, item, usd: Math.round(acc.usd * 10000) / 10000, input: acc.input, output: acc.output, searches: acc.searches });
  saveLedger();
}

function writeLog(cat: string, id: string, acc: RunResult, yamlText: string | null, remaining: Issue[]) {
  const dir = `scripts/research/logs/${cat}`;
  mkdirSync(dir, { recursive: true });
  let unseen: string[] = [];
  if (yamlText) {
    try {
      const doc = parse(yamlText) as { sources?: { url: string }[] };
      unseen = (doc.sources ?? []).map((s) => s.url).filter((u) => !acc.urls.has(u));
    } catch {
      /* ignore */
    }
  }
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify(
      { date: today, model: MODEL, effort, usd: acc.usd, searches: acc.searches, queries: acc.queries, urlsSeen: [...acc.urls], unseenSourceUrls: unseen, remainingErrors: remaining.map(formatIssue) },
      null,
      2,
    ) + '\n',
  );
  if (unseen.length) console.log(`  ! ${unseen.length} source URL(s) not seen in search/fetch results (see log)`);
}

async function researchItem(opts: { cat: string; id: string; file: string; system: string; user: string; pending: Set<string>; wrap?: (y: string) => string }) {
  checkBudget(opts.id);
  const acc: RunResult = { text: '', urls: new Set(), queries: [], usd: 0, input: 0, output: 0, searches: 0 };
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: opts.user }];
  let yamlText: string | null = null;
  let remaining: Issue[] = [];
  try {
    let msg = await converse(messages, opts.system, acc);
    for (let attempt = 0; attempt < 3; attempt++) {
      yamlText = extractYaml(msg);
      if (!yamlText) {
        if (attempt === 2) break;
        messages.push({ role: 'user', content: 'Please reply with the complete file in one ```yaml block.' });
        msg = await converse(messages, opts.system, acc);
        continue;
      }
      let out = yamlText;
      try {
        out = opts.wrap ? opts.wrap(yamlText) : yamlText;
      } catch (e) {
        remaining = [{ level: 'error', file: opts.file, path: '', message: `YAML parse error: ${(e as Error).message}` }];
      }
      mkdirSync(dirname(opts.file), { recursive: true });
      writeFileSync(opts.file, out);
      remaining = remaining.length ? remaining : errorsFor(opts.file, opts.pending);
      if (!remaining.length || attempt === 2) break;
      console.log(`  repair ${attempt + 1}: ${remaining.length} error(s)`);
      messages.push({
        role: 'user',
        content: `The validator reported these errors. Fix them (search again only if a source is genuinely missing; otherwise set the value to null) and reply with the complete corrected file:\n${remaining.map(formatIssue).join('\n')}`,
      });
      remaining = [];
      msg = await converse(messages, opts.system, acc);
    }
  } catch (e) {
    console.log(`  failed: ${(e as Error).message}`);
    remaining = [{ level: 'error', file: opts.file, path: '', message: (e as Error).message }];
  }
  record(`${opts.cat}/${opts.id}`, acc);
  writeLog(opts.cat, opts.id, acc, yamlText, remaining);
  console.log(`  $${acc.usd.toFixed(2)} (${acc.searches} searches) — total $${ledger.spentUsd.toFixed(2)}/${budget}${remaining.length ? ` — ${remaining.length} error(s) left` : ' — valid'}`);
}

async function main() {
  console.log(`Budget: $${ledger.spentUsd.toFixed(2)} spent of $${budget}.`);
  if (flag('estimate')) return;
  const catId = opt('category');
  if (!catId) throw new Error('--category <id> is required');
  const targets = (parse(readFileSync('scripts/research/targets.yaml', 'utf8')) as Record<string, Target[]>)[catId];
  if (!targets) throw new Error(`no targets for ${catId}`);
  const indicatorsFile = `scripts/research/indicators/${catId}.yaml`;
  const catDef = parse(readFileSync(indicatorsFile, 'utf8'));
  const catFile = `data/categories/${catId}.yaml`;
  const only = opt('only');
  const force = flag('force');

  if (!only && (force || !existsSync(catFile)) && !flag('skip-category')) {
    console.log(`\n[${catId}] category card`);
    await researchItem({
      cat: catId,
      id: '_category',
      file: catFile,
      system: '',
      user: categoryPrompt(catDef),
      pending: new Set(),
      wrap: (y) => {
        const doc = parse(y) as { category_card: unknown; sources: unknown };
        return `# Indicators: scripts/research/indicators/${catId}.yaml. Category card researched ${today}.\n` + stringify({ ...catDef, category_card: doc.category_card, sources: doc.sources }, { lineWidth: 0 });
      },
    });
  }

  const todo = targets.filter((t) => (!only || t.id === only) && (force || !existsSync(`data/systems/${catId}/${t.id}.yaml`)));
  const pending = new Set(targets.filter((t) => !existsSync(`data/systems/${catId}/${t.id}.yaml`)).map((t) => t.id));
  for (const t of todo) {
    console.log(`\n[${catId}] ${t.name}`);
    await researchItem({
      cat: catId,
      id: t.id,
      file: `data/systems/${catId}/${t.id}.yaml`,
      system: systemPrompt(catDef, t, targets),
      user: `Research ${t.name} and return the card.`,
      pending,
    });
    pending.delete(t.id);
  }
}

main().catch((e) => {
  if (e instanceof Anthropic.AuthenticationError) console.error('Invalid or missing ANTHROPIC_API_KEY in .env');
  else console.error(e);
  saveLedger();
  process.exit(1);
});

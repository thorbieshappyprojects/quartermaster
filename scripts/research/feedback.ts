// Research user feedback for each system: interviews and first-hand reports from soldiers and crews
// in defence media, blogs, official channels and parliamentary/army publications.
// Output: data/feedback/<category>/<id>.yaml (summaries in own words, at most one short quote per item).
//   npm run research:feedback [-- --category <id>] [--only <id>] [--force]
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { loadData } from '../lib/load.ts';
import type { SystemCard } from '../../src/model/types.ts';
import { MODEL, Meter, budget, canSpend, record, spent } from './ledger.ts';

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const force = args.includes('--force');
const today = new Date().toISOString().slice(0, 10);
const client = new Anthropic();
const TOOLS = [
  { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 8 },
  { type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: 5, max_content_tokens: 15000 },
];

const SYSTEM = `You research what soldiers and crews say about a military vehicle, for a learning card game.
Look for: interviews with crews or commanders, first-hand accounts reported by defence media and blogs
(e.g. Defense News, Breaking Defense, Army Recognition, Hartpunkt, ESUT, Kyiv Independent, RUSI, War on the Rocks),
army or ministry publications, unit magazines, parliamentary reports quoting users, evaluations and trials reports.
Rules:
- Only items where users of the system (crews, commanders, maintainers, trial units) are the voice. Not marketing.
- Social media only when a reputable outlet reported it; say so in the note.
- Summaries in your own words. At most ONE verbatim quote per item, 25 words or fewer, only if it is short and telling.
- Cite only URLs you actually saw. Retrieval date ${today}. Neutral tone. Public information only; nothing operationally sensitive.
- If you find nothing credible, return items: [].
Reply with exactly one fenced \`\`\`yaml block and nothing after it:

items:
  - summary: <1-2 sentences in your own words>
    quote: <optional, <= 25 words, verbatim>
    speaker: <role and country, e.g. "Ukrainian tank commander"; never a private person's full name unless they are a public official>
    context: <where/when, e.g. "Interview after the 2023 Zaporizhzhia counteroffensive">
    sentiment: positive | mixed | negative
    topics: [<1-3 of: protection, firepower, mobility, reliability, maintenance, ergonomics, sensors, logistics, training, cost>]
    source: { url: <exact URL>, title: <title>, publisher: <outlet>, date: <YYYY-MM-DD or YYYY, publication date if known>, retrieved: ${today} }
note: <one sentence on coverage, e.g. "Little first-hand reporting; mostly trial reports.">`;

async function converse(messages: Anthropic.Beta.BetaMessageParam[], meter: Meter): Promise<Anthropic.Beta.BetaMessage> {
  let drops = 0;
  for (let turn = 0; turn < 8; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      output_config: { effort: 'medium' },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await stream.finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.APIError || ++drops > 2) throw e;
      turn--;
      continue;
    }
    meter.add(msg.usage);
    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'pause_turn') continue;
    if (msg.stop_reason === 'refusal') throw new Error('refused');
    return msg;
  }
  throw new Error('too many continuation turns');
}

function seenUrls(messages: Anthropic.Beta.BetaMessageParam[]): Set<string> {
  const urls = new Set<string>();
  for (const m of messages) {
    if (m.role !== 'assistant' || typeof m.content === 'string') continue;
    for (const b of m.content as Anthropic.Beta.BetaContentBlock[]) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.type === 'web_search_result') urls.add(r.url);
      if (b.type === 'web_fetch_tool_result') {
        const c = b.content as { type: string; url?: string };
        if (c.type === 'web_fetch_result' && c.url) urls.add(c.url);
      }
      if (b.type === 'server_tool_use') {
        const u = (b.input as { url?: string }).url;
        if (u) urls.add(u);
      }
    }
  }
  return urls;
}

async function main() {
  console.log(`Budget: $${spent().toFixed(2)} spent of $${budget()}.`);
  const cat = opt('category');
  const only = opt('only');
  const cards = loadData('data').systems.map((f) => f.data as SystemCard).filter((c) => (!cat || c.category === cat) && (!only || c.id === only));
  for (const card of cards) {
    const out = `data/feedback/${card.category}/${card.id}.yaml`;
    if (existsSync(out) && !force) continue;
    if (!canSpend(1)) {
      console.log(`Budget stop before ${card.id}.`);
      break;
    }
    const meter = new Meter();
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: `System: ${card.name}${card.variant_note ? ` (${card.variant_note})` : ''}; family ${card.family ?? 'n/a'}; also known as ${(card.aliases ?? []).join(', ') || 'n/a'}; operators: ${card.operators.map((o) => o.country).join(', ') || 'n/a'}. Feedback on earlier variants of the same family is fine if marked in context. Find up to 5 strong items.` },
    ];
    try {
      const msg = await converse(messages, meter);
      const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
      const block = [...text.matchAll(/```ya?ml\s*\n([\s\S]*?)```/g)].pop()?.[1];
      if (!block) throw new Error('no yaml block');
      const doc = parse(block) as { items?: Record<string, any>[]; note?: string };
      const urls = seenUrls(messages);
      const items = (doc.items ?? []).map((i) => ({
        ...i,
        quote: i.quote && String(i.quote).split(/\s+/).length <= 25 ? i.quote : undefined,
        unverified_url: urls.has(i.source?.url) ? undefined : true,
      }));
      mkdirSync(`data/feedback/${card.category}`, { recursive: true });
      writeFileSync(out, `# User feedback researched ${today}. Summaries in own words; quotes are short excerpts with their source.\n` + stringify({ id: card.id, items, note: doc.note }, { lineWidth: 0 }));
      const total = record(`feedback/${card.id}`, meter);
      const bad = items.filter((i) => i.unverified_url).length;
      console.log(`  ${card.id}: ${items.length} item(s)${bad ? `, ${bad} with unseen URL` : ''} — $${meter.usd.toFixed(2)} — total $${total.toFixed(2)}/${budget()}`);
    } catch (e) {
      const total = record(`feedback/${card.id}`, meter);
      console.log(`  ${card.id}: failed (${(e as Error).message}) — $${meter.usd.toFixed(2)} — total $${total.toFixed(2)}/${budget()}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

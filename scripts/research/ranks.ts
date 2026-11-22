// Research the rank structure of one armed service per file: names in the original language, English
// translation, NATO rank code (STANAG 2116), group and typical role, each with a source.
// Output: data/ranks/<country>-<branch>.yaml
//   npm run research:ranks [-- --only de-army] [--force]
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { loadData } from '../lib/load.ts';
import { formatIssue, validate } from '../lib/validate.ts';
import { MODEL, Meter, budget, canSpend, record, spent } from './ledger.ts';

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const force = args.includes('--force');
const today = new Date().toISOString().slice(0, 10);
const client = new Anthropic();

// Pilot (M9): Germany and France, all three services. Extend this list for the next steps.
const FORCES = [
  { id: 'de-army', country: 'DE', branch: 'army', hint: 'German Army (Heer) of the Bundeswehr' },
  { id: 'de-air-force', country: 'DE', branch: 'air_force', hint: 'German Air Force (Luftwaffe) of the Bundeswehr' },
  { id: 'de-navy', country: 'DE', branch: 'navy', hint: 'German Navy (Marine) of the Bundeswehr' },
  { id: 'fr-army', country: 'FR', branch: 'army', hint: "French Army (Armée de Terre)" },
  { id: 'fr-air-force', country: 'FR', branch: 'air_force', hint: "French Air and Space Force (Armée de l'Air et de l'Espace)" },
  { id: 'fr-navy', country: 'FR', branch: 'navy', hint: 'French Navy (Marine nationale)' },
];

const TOOLS = [
  { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 8 },
  { type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: 6, max_content_tokens: 20000 },
];

const SYSTEM = `You research military rank structures for a learning card game. Public information only.
Prefer official sources: the ministry of defence or the service's own website, official regulations, NATO STANAG 2116 tables.
Reference works are fine as a second source; Wikipedia only as a pointer (cite the underlying source where possible).
Rules:
- List every current rank of the service, most junior first, from the lowest enlisted rank to the highest general/flag rank.
- Rank names exactly in the original language; name_en is the usual English translation or equivalent.
- code: the NATO rank code (OR-1..OR-9, WO-1..WO-5, OF-D for officer cadets, OF-1..OF-10). Several ranks may share a code.
- Never invent. If a code is not stated by a source, give your best documented equivalent and set approximate: true with a note.
- role: one short phrase on the typical role or command level (e.g. "platoon leader"), only where a source supports it; otherwise omit.
- Cite only URLs you actually saw. Retrieval date ${today}. Neutral tone.
Reply with exactly one fenced \`\`\`yaml block and nothing after it.`;

function prompt(f: (typeof FORCES)[number]) {
  return `Research the ranks of the ${f.hint}. Return this file:

id: ${f.id}
country: ${f.country}
branch: ${f.branch}
force: <name of the service in the original language>
force_en: <English name>
note: <optional, one sentence, e.g. on rank groups or recent changes>
ranks:
  - { id: ${f.id}-<slug of the original name, lowercase, hyphens>, name: <original>, name_en: <English>, abbreviation: <optional official abbreviation>, code: <NATO code>, group: enlisted|nco|warrant|officer_cadet|officer|general_flag, role: <optional>, source: s1 }
sources:
  - { id: s1, url: <exact URL>, title: <title>, publisher: <organisation>, retrieved: ${today}, kind: government|reference|press|other }

Every listed source must be referenced by at least one rank.`;
}

async function converse(messages: Anthropic.Beta.BetaMessageParam[], meter: Meter): Promise<Anthropic.Beta.BetaMessage> {
  let drops = 0;
  for (let turn = 0; turn < 8; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'adaptive' },
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

const yamlOf = (msg: Anthropic.Beta.BetaMessage) =>
  [...msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').matchAll(/```ya?ml\s*\n([\s\S]*?)```/g)].pop()?.[1];

async function main() {
  console.log(`Budget: $${spent().toFixed(2)} spent of $${budget()}.`);
  const only = opt('only');
  for (const f of FORCES.filter((x) => !only || x.id === only)) {
    const out = `data/ranks/${f.id}.yaml`;
    if (existsSync(out) && !force) continue;
    if (!canSpend(1)) {
      console.log(`Budget stop before ${f.id}.`);
      break;
    }
    const meter = new Meter();
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt(f) }];
    let errors: string[] = [];
    try {
      let msg = await converse(messages, meter);
      for (let attempt = 0; attempt < 3; attempt++) {
        const block = yamlOf(msg);
        errors = [];
        if (!block) errors = ['no yaml block'];
        else {
          try {
            const doc = parse(block, { schema: 'core' });
            mkdirSync('data/ranks', { recursive: true });
            writeFileSync(out, `# Ranks researched ${today}.\n` + stringify(doc, { lineWidth: 0 }));
            errors = validate(loadData('data')).issues.filter((i) => i.file === out && i.level === 'error').map(formatIssue);
          } catch (e) {
            errors = [`YAML parse error: ${(e as Error).message.split('\n')[0]}`];
          }
        }
        if (!errors.length || attempt === 2) break;
        messages.push({ role: 'user', content: `The validator reported:\n${errors.join('\n')}\nFix these and reply with the complete corrected file in one yaml block. Do not search again unless a source is missing.` });
        msg = await converse(messages, meter);
      }
    } catch (e) {
      errors = [(e as Error).message];
    }
    const total = record(`ranks/${f.id}`, meter);
    console.log(`  ${f.id}: ${errors.length ? `${errors.length} error(s): ${errors.slice(0, 3).join(' | ')}` : 'valid'} — $${meter.usd.toFixed(2)} — total $${total.toFixed(2)}/${budget()}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

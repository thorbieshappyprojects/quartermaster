// Shared cost ledger for research runs (same file and format as research.ts).
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5-5';
// USD per million tokens / per search. Update if pricing changes.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, perSearch: 0.01 };
const LEDGER = 'scripts/research/ledger.json';
const today = () => new Date().toISOString().slice(0, 10);

interface Entry { date: string; item: string; usd: number; input: number; output: number; searches: number }
interface Ledger { spentUsd: number; entries: Entry[] }

type Usage = Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'> & {
  server_tool_use?: { web_search_requests?: number } | null;
};

export const budget = () => Number(process.env.RESEARCH_BUDGET_USD ?? 20);

function read(): Ledger {
  return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { spentUsd: 0, entries: [] };
}

export function spent(): number {
  return read().spentUsd;
}

export class Meter {
  usd = 0;
  input = 0;
  output = 0;
  searches = 0;
  add(u: Usage) {
    const searches = u.server_tool_use?.web_search_requests ?? 0;
    this.usd +=
      (u.input_tokens * PRICE.input +
        u.output_tokens * PRICE.output +
        (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead +
        (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) /
        1e6 +
      searches * PRICE.perSearch;
    this.input += u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    this.output += u.output_tokens;
    this.searches += searches;
  }
}

/** Append one item's cost to the ledger (re-reads the file so entries are not lost). */
export function record(item: string, m: Meter): number {
  const l = read();
  l.spentUsd = Math.round((l.spentUsd + m.usd) * 10000) / 10000;
  l.entries.push({ date: today(), item, usd: Math.round(m.usd * 10000) / 10000, input: m.input, output: m.output, searches: m.searches });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
  return l.spentUsd;
}

/** True if there is at least `reserve` USD left under the cap. */
export function canSpend(reserve: number): boolean {
  return budget() - spent() >= reserve;
}

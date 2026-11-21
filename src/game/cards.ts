import type { Category, CompiledSystem, Indicator } from '../model/types.ts';

export const valueOf = (card: CompiledSystem, indicatorId: string): number | null => card.specs[indicatorId]?.value ?? null;

/** Indicators the holder of this card may pick in a duel: playable and with a recorded value. */
export function pickableIndicators(category: Category, card: CompiledSystem): Indicator[] {
  return category.indicators.filter((i) => i.trump !== 'not_playable' && valueOf(card, i.id) !== null);
}

export type Outcome = 'a' | 'b' | 'tie';

/** Compare two cards on one indicator. A missing value on either side counts as a tie (no invented values). */
export function compare(a: CompiledSystem, b: CompiledSystem, ind: Indicator): Outcome {
  const va = valueOf(a, ind.id);
  const vb = valueOf(b, ind.id);
  if (va === null || vb === null || va === vb || ind.trump === 'not_playable') return 'tie';
  const aHigher = va > vb;
  return (ind.trump === 'higher_wins') === aHigher ? 'a' : 'b';
}

/** Percentile (0..1) of the card's value among all cards of the category, oriented so 1 = strongest. */
export function strength(card: CompiledSystem, ind: Indicator, pool: CompiledSystem[]): number {
  const v = valueOf(card, ind.id);
  if (v === null) return 0;
  const values = pool.map((c) => valueOf(c, ind.id)).filter((x): x is number => x !== null);
  if (values.length <= 1) return 0.5;
  const beaten = values.filter((x) => (ind.trump === 'higher_wins' ? x < v : x > v)).length;
  const ties = values.filter((x) => x === v).length - 1;
  return (beaten + ties / 2) / (values.length - 1);
}

export function formatValue(v: number | null, ind?: Pick<Indicator, 'unit' | 'decimals'>): string {
  if (v === null) return '—';
  const d = ind?.decimals ?? (Number.isInteger(v) ? 0 : 1);
  const n = v.toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  return ind?.unit ? `${n} ${ind.unit}` : n;
}

export function formatMoney(value: number | null, currency: string | null): string {
  if (value === null || !currency) return '—';
  const abs = Math.abs(value);
  const [div, suffix] = abs >= 1e9 ? [1e9, ' bn'] : abs >= 1e6 ? [1e6, ' m'] : [1, ''];
  return `${currency} ${(value / div).toLocaleString('en-GB', { maximumFractionDigits: 1 })}${suffix}`;
}

/** Peer relation, symmetric: A and B are peers if either lists the other. */
export function peersOf(card: CompiledSystem, all: CompiledSystem[]): Set<string> {
  const s = new Set(card.peers);
  for (const c of all) if (c.peers.includes(card.id)) s.add(c.id);
  s.delete(card.id);
  return s;
}

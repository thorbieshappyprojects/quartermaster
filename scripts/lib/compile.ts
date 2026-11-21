import type {
  Category,
  Cost,
  CompiledSpec,
  CompiledSystem,
  Confidence,
  Deck,
  EurCost,
  FxTable,
  Manufacturer,
  Source,
  SystemCard,
} from '../../src/model/types.ts';
import type { LoadedData } from './load.ts';

const rank: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const lower = (a: Confidence, b: Confidence): Confidence => (rank[a] <= rank[b] ? a : b);

function round(v: number, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** Fill in derived indicators (e.g. power-to-weight) from two sourced values. */
export function compileSystem(card: SystemCard, cat: Category | undefined): CompiledSystem {
  const specs: Record<string, CompiledSpec> = { ...card.specs };
  for (const ind of cat?.indicators ?? []) {
    if (!ind.derived) continue;
    const a = card.specs[ind.derived.numerator];
    const b = card.specs[ind.derived.denominator];
    if (a?.value != null && b?.value != null && b.value !== 0 && a.confidence && b.confidence) {
      specs[ind.id] = {
        value: round((a.value / b.value) * (ind.derived.factor ?? 1), ind.decimals ?? 1),
        source: null,
        confidence: lower(a.confidence, b.confidence),
        derived: true,
        inputs: [ind.derived.numerator, ind.derived.denominator],
        note: `Calculated from ${ind.derived.numerator} / ${ind.derived.denominator}`,
      };
    } else {
      specs[ind.id] = {
        value: null,
        source: null,
        confidence: null,
        derived: true,
        inputs: [ind.derived.numerator, ind.derived.denominator],
      };
    }
  }
  return { ...card, specs };
}

/** Convert a cost to EUR with the ECB average of its price year (partial-year average if the year is not complete). */
export function toEur(cost: Cost, fx: FxTable | undefined): EurCost | undefined {
  if (cost.value == null || !cost.currency || !cost.price_year) return undefined;
  if (cost.currency === 'EUR') return { value: cost.value, rate: 1, year: cost.price_year };
  if (!fx) return undefined;
  const annual = fx.annual[cost.currency]?.[String(cost.price_year)];
  const partial = fx.partial_year.year === cost.price_year ? fx.partial_year.rates[cost.currency] : undefined;
  const rate = annual ?? partial?.value;
  if (!rate) return undefined;
  return { value: Math.round(cost.value / rate), rate, year: cost.price_year, ...(annual ? {} : { partial: partial!.months }) };
}

export function compileDeck(data: LoadedData, generated = new Date().toISOString()): Deck {
  const categories = data.categories.map((f) => f.data as Category).sort((a, b) => a.wave - b.wave || a.name.localeCompare(b.name));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const fx = data.fx[0]?.data as FxTable | undefined;
  const systems = data.systems
    .map((f) => f.data as SystemCard)
    .map((s) => compileSystem(s, byId.get(s.category)))
    .map((s) => ({ ...s, cost: { ...s.cost, eur: toEur(s.cost, fx) } }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sharedSources = data.sources.flatMap((f) => (f.data as { sources: Source[] }).sources);
  const manufacturers = data.manufacturers.map((f) => f.data as Manufacturer);
  return { generated, categories, systems, sharedSources, manufacturers, fxSource: fx?.source };
}

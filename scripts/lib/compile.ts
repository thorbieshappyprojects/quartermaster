import type {
  Category,
  CompiledSpec,
  CompiledSystem,
  Confidence,
  Deck,
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

export function compileDeck(data: LoadedData, generated = new Date().toISOString()): Deck {
  const categories = data.categories.map((f) => f.data as Category).sort((a, b) => a.wave - b.wave || a.name.localeCompare(b.name));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const systems = data.systems
    .map((f) => f.data as SystemCard)
    .map((s) => compileSystem(s, byId.get(s.category)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sharedSources = data.sources.flatMap((f) => (f.data as { sources: Source[] }).sources);
  const manufacturers = data.manufacturers.map((f) => f.data as Manufacturer);
  return { generated, categories, systems, sharedSources, manufacturers };
}

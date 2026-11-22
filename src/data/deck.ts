import raw from '../generated/deck.json';
import type { Category, CompiledSystem, Deck, Source } from '../model/types.ts';

export const deck = raw as unknown as Deck;

export const categoriesById = new Map<string, Category>(deck.categories.map((c) => [c.id, c]));
export const systemsById = new Map<string, CompiledSystem>(deck.systems.map((s) => [s.id, s]));
const shared = new Map<string, Source>(deck.sharedSources.map((s) => [s.id, s]));

export function systemsIn(categoryId: string): CompiledSystem[] {
  return deck.systems.filter((s) => s.category === categoryId);
}

/** Resolve a source reference (s1 or @shared-id) for a card or category. */
export function resolveSource(ref: string | null | undefined, local: Source[]): (Source & { shared: boolean }) | null {
  if (!ref) return null;
  if (ref.startsWith('@')) {
    const s = shared.get(ref.slice(1));
    return s ? { ...s, shared: true } : null;
  }
  const s = local.find((x) => x.id === ref);
  return s ? { ...s, shared: false } : null;
}

export function silhouetteUrl(card: Pick<CompiledSystem, 'silhouette' | 'category'>): string {
  // Absolute URL: a relative url() inside a CSS custom property resolves against the stylesheet, not the page.
  return new URL(`silhouettes/${card.silhouette ?? `_${card.category}.svg`}`, document.baseURI).href;
}

export function hasOwnSilhouette(card: CompiledSystem): boolean {
  return !!card.silhouette;
}

/** Quartet-style card code: category letter (A, B, …) plus position within the category, e.g. "A3". */
export function categoryLetter(categoryId: string): string {
  const i = deck.categories.findIndex((c) => c.id === categoryId);
  return i < 0 ? '?' : String.fromCharCode(65 + i);
}

export function cardCode(card: Pick<CompiledSystem, 'id' | 'category'>): string {
  const n = systemsIn(card.category).findIndex((s) => s.id === card.id) + 1;
  return `${categoryLetter(card.category)}${n}`;
}

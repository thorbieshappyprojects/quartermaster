import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import { deck, categoriesById } from '../data/deck.ts';
import { flag, countryName } from '../game/countries.ts';
import { CategoryFilter } from './CategoryFilter.tsx';
import { Silhouette } from './Silhouette.tsx';

const filter = signal('');
const query = signal('');

export function Browser() {
  const q = query.value.trim().toLowerCase();
  const systems = useMemo(
    () =>
      deck.systems.filter(
        (s) =>
          (!filter.value || s.category === filter.value) &&
          (!q ||
            [s.name, s.variant_note, s.family, ...(s.aliases ?? []), s.manufacturer.name, countryName(s.origin), s.origin, categoriesById.get(s.category)?.name]
              .filter(Boolean)
              .some((t) => t!.toLowerCase().includes(q))),
      ),
    [filter.value, q],
  );
  const cats = deck.categories.filter((c) => (!filter.value || c.id === filter.value) && (!q || c.name.toLowerCase().includes(q)));
  return (
    <div class="stack">
      <h1>Cards</h1>
      <input type="search" placeholder="Search name, maker, country…" value={query.value} onInput={(e) => (query.value = e.currentTarget.value)} aria-label="Search cards" />
      <CategoryFilter value={filter.value} onChange={(v) => (filter.value = v)} />
      <p class="muted small">{systems.length} system card{systems.length === 1 ? '' : 's'}</p>
      <div class="grid" data-testid="card-grid">
        {cats.map((c) => (
          <a class="tile cat" href={`#/category/${c.id}`}>
            <span class="badge">Category card</span>
            <Silhouette card={{ category: c.id }} label={c.name} />
            <span class="name">{c.name}</span>
            <span class="muted small">{deck.systems.filter((s) => s.category === c.id).length} cards</span>
          </a>
        ))}
        {systems.map((s) => (
          <a class="tile" href={`#/card/${s.id}`}>
            <Silhouette card={s} label={s.name} />
            <span class="name">{s.name}</span>
            <span class="muted small">
              {flag(s.origin)} {countryName(s.origin)} · {categoriesById.get(s.category)?.name}
            </span>
          </a>
        ))}
      </div>
      {systems.length === 0 && cats.length === 0 && <p class="muted">No cards match.</p>}
    </div>
  );
}

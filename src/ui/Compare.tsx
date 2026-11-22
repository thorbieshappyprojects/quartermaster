import { signal } from '@preact/signals';
import { useMemo, useState } from 'preact/hooks';
import type { CompiledSystem, Indicator } from '../model/types.ts';
import { cardCode, categoriesById, deck, systemsById } from '../data/deck.ts';
import { formatMoney, formatValue } from '../game/cards.ts';
import { countryName, flag } from '../game/countries.ts';
import { CategoryFilter } from './CategoryFilter.tsx';
import { Thumb } from './Thumb.tsx';
import { route, go } from './router.ts';

export const MAX_COMPARE = 4;

/** Cards picked for comparison; mirrored in the URL (#/compare?ids=a,b) so a comparison can be bookmarked. */
export const compareIds = signal<string[]>([]);

export function toggleCompare(id: string) {
  const cur = compareIds.value;
  compareIds.value = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COMPARE ? cur : [...cur, id];
}

export function compareHash(ids = compareIds.value) {
  return `#/compare?ids=${ids.join(',')}`;
}

interface Row {
  key: string;
  label: string;
  /** For highlighting: which value is best. */
  trump?: Indicator['trump'];
  value: (c: CompiledSystem) => number | null;
  show: (c: CompiledSystem) => string;
  applies?: (c: CompiledSystem) => boolean;
}

function rowsFor(cards: CompiledSystem[]): Row[] {
  // Union of the cards' indicators, in category order; an indicator only applies to cards of its category.
  const seen = new Map<string, { ind: Indicator; cats: Set<string> }>();
  for (const c of cards)
    for (const ind of categoriesById.get(c.category)?.indicators ?? []) {
      const key = `${ind.id}|${ind.unit}`;
      const e = seen.get(key) ?? { ind, cats: new Set<string>() };
      e.cats.add(c.category);
      seen.set(key, e);
    }
  const specRows: Row[] = [...seen.entries()].map(([key, { ind, cats }]) => ({
    key,
    label: ind.label + (ind.trump === 'lower_wins' ? ' ↓' : ''),
    trump: ind.trump,
    value: (c) => c.specs[ind.id]?.value ?? null,
    show: (c) => formatValue(c.specs[ind.id]?.value ?? null, ind),
    applies: (c) => cats.has(c.category),
  }));
  return [
    ...specRows,
    { key: 'cost', label: 'Unit cost (EUR)', trump: 'lower_wins', value: (c) => c.cost.eur?.value ?? null, show: (c) => (c.cost.eur ? formatMoney(c.cost.eur.value, 'EUR') : '—') },
    { key: 'since', label: 'In service since', value: (c) => c.in_service_since.value, show: (c) => String(c.in_service_since.value ?? '—') },
    { key: 'built', label: 'Units built', trump: 'higher_wins', value: (c) => c.units_built.value, show: (c) => c.units_built.value?.toLocaleString('en-GB') ?? '—' },
    {
      key: 'ops',
      label: 'Operator countries',
      trump: 'higher_wins',
      value: (c) => new Set(c.operators.filter((o) => o.state !== 'retired').map((o) => o.country)).size,
      show: (c) => String(new Set(c.operators.filter((o) => o.state !== 'retired').map((o) => o.country)).size),
    },
  ];
}

function bestIndex(row: Row, cards: CompiledSystem[]): Set<number> {
  if (!row.trump || row.trump === 'not_playable') return new Set();
  const vals = cards.map((c, i) => ({ i, v: row.applies && !row.applies(c) ? null : row.value(c) })).filter((x) => x.v !== null) as { i: number; v: number }[];
  if (vals.length < 2) return new Set();
  const best = row.trump === 'higher_wins' ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v));
  if (vals.every((x) => x.v === best)) return new Set();
  return new Set(vals.filter((x) => x.v === best).map((x) => x.i));
}

export function ComparePage() {
  const fromUrl = (route.value.query.get('ids') ?? '').split(',').filter((id) => systemsById.has(id)).slice(0, MAX_COMPARE);
  if (fromUrl.length && fromUrl.join() !== compareIds.value.join()) compareIds.value = fromUrl;
  const ids = compareIds.value;
  const cards = ids.map((id) => systemsById.get(id)!).filter(Boolean);
  const [picking, setPicking] = useState(cards.length < 2);

  if (picking || cards.length < 2) return <Picker onDone={() => (setPicking(false), go(compareHash()))} />;

  const rows = rowsFor(cards);
  const mixed = new Set(cards.map((c) => c.category)).size > 1;
  return (
    <div class="stack">
      <div class="spread">
        <h1>Compare</h1>
        <button class="btn" onClick={() => setPicking(true)}>Change cards</button>
      </div>
      {mixed && <p class="muted small">Cards from different categories: values that a category does not track show as n/a.</p>}
      <div class="compare-wrap">
        <table class="compare" data-testid="compare-table" style={{ "--cols": cards.length }}>
          <thead>
            <tr>
              <th scope="col" class="rowhead" />
              {cards.map((c) => (
                <th scope="col">
                  <a href={`#/card/${c.id}`} class="compare-card">
                    <Thumb card={c} label={c.name} />
                    <span class="code-sm">{cardCode(c)}</span>
                    <strong>{c.name}</strong>
                    <span class="muted small">
                      {flag(c.origin)} {countryName(c.origin)}
                    </span>
                  </a>
                  <button class="btn-x" aria-label={`Remove ${c.name}`} onClick={() => (toggleCompare(c.id), go(compareHash()))}>
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const best = bestIndex(r, cards);
              return (
                <tr>
                  <th scope="row" class="rowhead">{r.label}</th>
                  {cards.map((c, i) => (
                    <td class={best.has(i) ? 'best' : ''}>{r.applies && !r.applies(c) ? <span class="muted">n/a</span> : r.show(c)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="muted small">Highlighted: the best value in each row by the duel rule (↓ = lower wins; cost: lower wins). Costs are converted to EUR at the price year and use different bases; see each card's Business face.</p>
    </div>
  );
}

function Picker({ onDone }: { onDone: () => void }) {
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const ids = compareIds.value;
  const list = useMemo(
    () =>
      deck.systems.filter(
        (s) => (!cat || s.category === cat) && (!q || [s.name, s.variant_note, ...(s.aliases ?? []), s.manufacturer.name].filter(Boolean).some((t) => t!.toLowerCase().includes(q.toLowerCase()))),
      ),
    [cat, q],
  );
  return (
    <div class="stack">
      <h1>Compare</h1>
      <p class="muted">Pick 2 to {MAX_COMPARE} cards. Cards of the same category line up best.</p>
      <input type="search" placeholder="Search cards…" value={q} onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search cards" />
      <CategoryFilter value={cat} onChange={setCat} />
      <div class="hand" data-testid="compare-picker">
        {list.map((s) => {
          const on = ids.includes(s.id);
          return (
            <button class={`btn${on ? ' sel' : ''}`} aria-pressed={on} disabled={!on && ids.length >= MAX_COMPARE} onClick={() => toggleCompare(s.id)}>
              <Thumb card={s} label={s.name} />
              <strong>{s.name}</strong>
              <span class="muted small">{cardCode(s)} · {categoriesById.get(s.category)?.name}</span>
            </button>
          );
        })}
      </div>
      <div class="compare-bar">
        <span>{ids.length} selected</span>
        {ids.length > 0 && (
          <button class="btn" onClick={() => (compareIds.value = [])}>
            Clear
          </button>
        )}
        <button class="btn primary" disabled={ids.length < 2} onClick={onDone} data-testid="compare-go">
          Compare {ids.length >= 2 ? ids.length : ''}
        </button>
      </div>
    </div>
  );
}

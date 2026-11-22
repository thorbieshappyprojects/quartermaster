import { signal } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CompiledSystem, Indicator } from '../model/types.ts';
import { cardCode, categoriesById, deck, systemsById } from '../data/deck.ts';
import { formatMoney, formatValue } from '../game/cards.ts';
import { countryName, flag } from '../game/countries.ts';
import { CategoryFilter } from './CategoryFilter.tsx';
import { Thumb } from './Thumb.tsx';
import { route } from './router.ts';

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

/** Keep the URL in step with the selection without a navigation (so the page never re-reads stale ids). */
function syncUrl(ids: string[]) {
  const hash = ids.length ? compareHash(ids) : '#/compare';
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

export function ComparePage() {
  // Ids in the URL are adopted only when the URL itself changes by navigation (a bookmark or link).
  // The page's own updates use replaceState, which does not change `route`, so picks never snap back.
  const urlIds = route.value.query.get('ids') ?? '';
  useMemo(() => {
    const fromUrl = urlIds.split(',').filter((id) => systemsById.has(id)).slice(0, MAX_COMPARE);
    if (fromUrl.length) compareIds.value = fromUrl;
  }, [urlIds]);
  const ids = compareIds.value;
  useEffect(() => syncUrl(ids), [ids.join()]);
  const cards = ids.map((id) => systemsById.get(id)!).filter(Boolean);
  const rows = rowsFor(cards);
  const mixed = new Set(cards.map((c) => c.category)).size > 1;

  return (
    <div class="stack">
      <div class="spread">
        <h1>Compare</h1>
        {ids.length > 0 && (
          <button class="btn" onClick={() => (compareIds.value = [])}>
            Clear
          </button>
        )}
      </div>
      <div class="slots" data-testid="compare-slots">
        {Array.from({ length: MAX_COMPARE }, (_, i) => cards[i]).map((c, i) =>
          c ? (
            <div class="slot filled">
              <a href={`#/card/${c.id}`} class="slot-card">
                <Thumb card={c} label={c.name} />
                <strong>{c.name}</strong>
              </a>
              <button class="btn-x" aria-label={`Remove ${c.name}`} onClick={() => toggleCompare(c.id)}>
                ×
              </button>
            </div>
          ) : (
            <div class="slot empty muted small">{i < 2 ? `Pick card ${i + 1}` : 'Optional'}</div>
          ),
        )}
      </div>
      {cards.length >= 2 ? (
        <>
          {mixed && <p class="muted small">Cards from different categories: values that a category does not track show as n/a.</p>}
          <div class="compare-wrap">
            <table class="compare" data-testid="compare-table" style={{ '--cols': cards.length }}>
              <thead>
                <tr>
                  <th scope="col" class="rowhead" />
                  {cards.map((c) => (
                    <th scope="col">
                      <span class="code-sm">{cardCode(c)}</span> <strong>{c.name}</strong>
                      <br />
                      <span class="muted small">
                        {flag(c.origin)} {countryName(c.origin)}
                      </span>
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
        </>
      ) : (
        <p class="muted">Pick 2 to {MAX_COMPARE} cards below. Cards of the same category line up best.</p>
      )}
      <Picker />
      {cards.length >= 1 && (
        <div class="compare-bar">
          <span>
            {cards.length} of {MAX_COMPARE} selected
          </span>
          <button class="btn primary" disabled={cards.length < 2} onClick={() => document.querySelector('.slots')?.scrollIntoView({ behavior: 'smooth' })}>
            View comparison ↑
          </button>
        </div>
      )}
    </div>
  );
}

function Picker() {
  const ids = compareIds.value;
  // Start in the category of the first picked card: comparing tanks with tanks is the common case.
  const [cat, setCat] = useState(() => (ids[0] ? systemsById.get(ids[0])?.category ?? '' : ''));
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      deck.systems.filter(
        (s) => (!cat || s.category === cat) && (!q || [s.name, s.variant_note, ...(s.aliases ?? []), s.manufacturer.name].filter(Boolean).some((t) => t!.toLowerCase().includes(q.toLowerCase()))),
      ),
    [cat, q],
  );
  const full = ids.length >= MAX_COMPARE;
  return (
    <section class="stack" aria-label="Add cards">
      <h2>{full ? `Selection full (${MAX_COMPARE})` : 'Add cards'}</h2>
      <input type="search" placeholder="Search cards…" value={q} onInput={(e) => setQ(e.currentTarget.value)} aria-label="Search cards" />
      <CategoryFilter value={cat} onChange={setCat} />
      <div class="pick-grid" data-testid="compare-picker">
        {list.map((s) => {
          const on = ids.includes(s.id);
          return (
            <button class={`pick${on ? ' sel' : ''}`} aria-pressed={on} disabled={!on && full} onClick={() => toggleCompare(s.id)}>
              <Thumb card={s} label={s.name} />
              <span class="pick-name">{s.name}</span>
              <span class="muted small">{on ? '✓ selected' : cardCode(s)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

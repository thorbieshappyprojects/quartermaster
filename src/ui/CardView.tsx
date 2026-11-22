import type { Category, CompiledSystem, Confidence, Source } from '../model/types.ts';
import { cardCode, categoriesById, deck, resolveSource, systemsById, systemsIn } from '../data/deck.ts';
import { formatMoney, formatValue, peersOf } from '../game/cards.ts';
import { countryName, flag } from '../game/countries.ts';
import { Silhouette } from './Silhouette.tsx';
import { OperatorMap } from './OperatorMap.tsx';
import { go } from './router.ts';
import { CardFrame } from './CardFrame.tsx';
import { PhotoView } from './PhotoView.tsx';
import { compareHash, compareIds, MAX_COMPARE, toggleCompare } from './Compare.tsx';

export const FACES = ['Identity', 'Specs', 'Service', 'Business', 'Field', 'Sources'] as const;
const SENTIMENT: Record<string, string> = { positive: 'positive', mixed: 'mixed', negative: 'critical' };

const STATUS: Record<string, string> = { in_production: 'In production', in_service: 'In service', retired: 'Retired' };
const OP_STATE: Record<string, string> = { in_service: 'in service', ordered: 'ordered', retired: 'retired', evaluating: 'evaluating' };

export function Conf({ c }: { c: Confidence | null | undefined }) {
  if (!c) return null;
  return <span class={`conf ${c}`} title={`Confidence: ${c}`} aria-label={`confidence ${c}`} />;
}

function Spec({ card, cat }: { card: CompiledSystem; cat: Category }) {
  return (
    <div class="stats">
      {cat.indicators.map((i) => {
        const v = card.specs[i.id];
        return (
          <div class={`stat${v?.value == null ? ' empty' : ''}`}>
            <span class="k">
              {i.label}
              {i.trump === 'lower_wins' && <span class="muted small" title="Lower wins in the duel"> ↓</span>}
            </span>
            <span class="v">
              {formatValue(v?.value ?? null, i)}
              {v?.derived && v.value != null && <span class="tag" title={v.note}> calc</span>}
              {v?.range && <span class="range" title="Public figures vary"> {formatValue(v.range.min, { unit: '', decimals: i.decimals })}–{formatValue(v.range.max, { unit: '', decimals: i.decimals })}</span>}
              <Conf c={v?.confidence} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function sourceUses(card: CompiledSystem, cat: Category | undefined): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  const add = (ref: string | null | undefined, what: string) => ref && uses.set(ref, [...(uses.get(ref) ?? []), what]);
  for (const [k, v] of Object.entries(card.specs)) add(v.source, cat?.indicators.find((i) => i.id === k)?.label ?? k);
  add(card.in_service_since.source, 'In service since');
  add(card.units_built.source, 'Units built');
  add(card.cost.source, 'Unit cost');
  add(card.memorable_fact?.source, 'Memorable fact');
  add(card.combat_use?.source, 'Combat use');
  card.production_sites?.forEach((p) => add(p.source, `Production: ${p.place}`));
  card.operators.forEach((o) => add(o.source, `Operator: ${countryName(o.country)}`));
  card.contracts?.forEach((c) => add(c.source, `Contract: ${c.customer}${c.year ? ` ${c.year}` : ''}`));
  return uses;
}

export function SourceList({ refs, local }: { refs: Map<string, string[]>; local: Source[] }) {
  const ids = [...new Set([...local.map((s) => s.id), ...refs.keys()])];
  return (
    <ul class="plain">
      {ids.map((id) => {
        const s = resolveSource(id, local);
        if (!s) return null;
        return (
          <li class="src">
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>{' '}
            <span class="muted">
              — {s.publisher}, retrieved {s.retrieved}
            </span>{' '}
            {s.kind && <span class="tag">{s.kind}</span>} {s.shared && <span class="tag">shared</span>}
            {refs.get(id) && <div class="muted small">Used for: {refs.get(id)!.join(', ')}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function SystemCardView({ card, onPrev, onNext }: { card: CompiledSystem; onPrev?: () => void; onNext?: () => void }) {
  const cat = categoriesById.get(card.category);
  const peers = [...peersOf(card, deck.systems)].map((id) => systemsById.get(id)).filter(Boolean) as CompiledSystem[];
  // fires relation, stored on the round: show it on the round and on every platform that fires it.
  const firedBy = (card.fired_by ?? []).map((id) => systemsById.get(id)).filter(Boolean) as CompiledSystem[];
  const fires = deck.systems.filter((s) => s.fired_by?.includes(card.id));
  const maker = card.manufacturer.benchmark_slug ? deck.manufacturers.find((m) => m.slug === card.manufacturer.benchmark_slug) : undefined;
  const confCounts = Object.values(card.specs).reduce<Record<string, number>>((acc, v) => ((acc[v.confidence ?? 'empty'] = (acc[v.confidence ?? 'empty'] ?? 0) + 1), acc), {});

  const renderFace = (face: number) => (
      <>
        {face === 0 && (
          <>
            {card.photos?.length ? <PhotoView photos={card.photos} /> : <Silhouette card={card} label={`${card.name} silhouette`} />}
            <p>{card.role}</p>
            {card.memorable_fact && (
              <p>
                <strong>Memorable fact:</strong> {card.memorable_fact.text}
              </p>
            )}
            <dl class="kv">
              <dt>Manufacturer</dt>
              <dd>{card.manufacturer.name}</dd>
              <dt>Origin</dt>
              <dd>
                {flag(card.origin)} {countryName(card.origin)}
              </dd>
              {card.production_sites?.length ? (
                <>
                  <dt>Built in</dt>
                  <dd>{card.production_sites.map((p) => `${p.place} (${p.country})`).join(', ')}</dd>
                </>
              ) : null}
              {card.family && (
                <>
                  <dt>Family</dt>
                  <dd>{card.family}</dd>
                </>
              )}
            </dl>
          </>
        )}
        {face === 1 && cat && (
          <>
            <h2>Specs</h2>
            <Spec card={card} cat={cat} />
            <p class="muted small">“—” means no public figure was found. ↓ marks values where lower wins. “calc” values are calculated from two sourced values.</p>
          </>
        )}
        {face === 2 && (
          <>
            <dl class="kv">
              <dt>Status</dt>
              <dd>{STATUS[card.status]}</dd>
              <dt>In service since</dt>
              <dd>
                {card.in_service_since.value ?? '—'}
                <Conf c={card.in_service_since.confidence} />
              </dd>
              <dt>Units built</dt>
              <dd>
                {card.units_built.value?.toLocaleString('en-GB') ?? '—'}
                <Conf c={card.units_built.confidence} />
              </dd>
            </dl>
            {card.units_built.note && <p class="muted small">{card.units_built.note}</p>}
            <h3>Operators</h3>
            {card.operators.length ? (
              <ul class="plain">
                {card.operators.map((o) => (
                  <li>
                    {flag(o.country)} {countryName(o.country)}
                    {o.force ? ` · ${o.force}` : ''} <span class="tag">{OP_STATE[o.state]}</span>
                    {o.quantity != null && <span class="muted"> · {o.quantity}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p class="muted">No operators recorded.</p>
            )}
            {card.operators.length > 0 && <OperatorMap operators={card.operators} compact />}
            {card.combat_use && (
              <>
                <h3>Combat use</h3>
                <p>{card.combat_use.text}</p>
              </>
            )}
          </>
        )}
        {face === 3 && (
          <>
            <dl class="kv">
              <dt>Unit cost (estimate)</dt>
              <dd>
                {card.cost.eur ? formatMoney(card.cost.eur.value, 'EUR') : formatMoney(card.cost.value, card.cost.currency)}
                <Conf c={card.cost.confidence} />
              </dd>
              {card.cost.eur && card.cost.currency !== 'EUR' && (
                <>
                  <dt>Original figure</dt>
                  <dd>{formatMoney(card.cost.value, card.cost.currency)}</dd>
                </>
              )}
              {card.cost.value != null && (
                <>
                  <dt>Basis</dt>
                  <dd>
                    {card.cost.basis === 'unit_price' ? 'Unit price' : 'Contract value ÷ units'}, {card.cost.price_year} prices
                  </dd>
                </>
              )}
            </dl>
            {card.cost.eur && card.cost.currency !== 'EUR' && (
              <p class="muted small">
                Converted at the ECB {card.cost.eur.partial ? `average for ${card.cost.eur.partial}` : `annual average ${card.cost.eur.year}`}: 1 EUR ={' '}
                {card.cost.eur.rate.toLocaleString('en-GB', { maximumFractionDigits: 4 })} {card.cost.currency}. Not adjusted for inflation.
              </p>
            )}
            {card.cost.basis === 'contract_per_unit' && <p class="muted small">Contract values usually include training, spares and support, so they exceed the bare unit price.</p>}
            {card.cost.note && <p class="muted small">{card.cost.note}</p>}
            {card.contracts?.length ? (
              <>
                <h3>Major contracts</h3>
                <ul class="plain">
                  {card.contracts.map((c) => (
                    <li>
                      <strong>{c.customer}</strong>
                      {c.year ? ` (${c.year})` : ''}: {c.quantity != null ? `${c.quantity} units` : 'quantity n/a'}
                      {c.value != null ? `, ${formatMoney(c.value, c.currency ?? null)}` : ''}
                      {c.note && <div class="muted small">{c.note}</div>}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <h3>Manufacturer</h3>
            <p>
              {card.manufacturer.name}
              {maker && <span class="muted small"> — context available</span>}
            </p>
            {maker && <ManufacturerContext m={maker} />}
            {[['Fired by', firedBy], ['Ammunition', fires]].map(([label, list]) =>
              (list as CompiledSystem[]).length ? (
                <>
                  <h3>{label as string}</h3>
                  <div class="row">
                    {(list as CompiledSystem[]).map((p) => (
                      <a class="chip" href={`#/card/${p.id}`}>
                        {p.name}
                      </a>
                    ))}
                  </div>
                </>
              ) : null,
            )}
            {peers.length > 0 && (
              <>
                <h3>Direct peers</h3>
                <div class="row">
                  {peers.map((p) => (
                    <a class="chip" href={`#/card/${p.id}`}>
                      {p.name}
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {face === 4 && (
          <>
            <h2>Field reports</h2>
            {card.feedback?.items.length ? (
              <ul class="plain feedback">
                {card.feedback.items.map((f) => (
                  <li>
                    <div class="spread small">
                      <strong>{f.speaker}</strong>
                      <span class={`tag sent-${f.sentiment}`}>{SENTIMENT[f.sentiment] ?? f.sentiment}</span>
                    </div>
                    <p>{f.summary}</p>
                    {f.quote && <blockquote>“{f.quote}”</blockquote>}
                    <div class="muted small">
                      {f.context ? `${f.context} · ` : ''}
                      <a href={f.source.url} target="_blank" rel="noopener noreferrer">{f.source.publisher}</a>
                      {f.source.date ? `, ${f.source.date}` : ''}
                      {f.topics?.length ? ` · ${f.topics.join(', ')}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="muted">No first-hand reports from crews found yet.</p>
            )}
            {card.feedback?.note && <p class="muted small">{card.feedback.note}</p>}
          </>
        )}
        {face === 5 && (
          <>
            <h2>Sources</h2>
            <p class="muted small">
              Spec confidence: {confCounts.high ?? 0} high · {confCounts.medium ?? 0} medium · {confCounts.low ?? 0} low · {confCounts.empty ?? 0} empty
            </p>
            <SourceList refs={sourceUses(card, cat)} local={card.sources} />
            {card.photos?.map((p) => (
              <p class="src">
                <a href={p.page_url} target="_blank" rel="noopener noreferrer">{p.title}</a>{' '}
                <span class="muted">— {p.author || 'unknown'}, {p.licence}, via Wikimedia Commons, retrieved {p.retrieved}</span>
                <div class="muted small">Used for: photo</div>
              </p>
            ))}
            {card.cost.eur && card.cost.currency !== 'EUR' && deck.fxSource && (
              <p class="src">
                <a href={deck.fxSource.url} target="_blank" rel="noopener noreferrer">{deck.fxSource.title}</a>{' '}
                <span class="muted">— {deck.fxSource.publisher}, retrieved {deck.fxSource.retrieved}</span>
                <div class="muted small">Used for: EUR conversion of the unit cost</div>
              </p>
            )}
          </>
        )}
      </>
  );

  return (
    <CardFrame
      labels={FACES}
      resetKey={card.id}
      code={cardCode(card)}
      testId="system-card"
      onPrevCard={onPrev}
      onNextCard={onNext}
      header={
        <>
          <div class="cat">{cat?.name}</div>
          <h1>{card.name}</h1>
          {card.variant_note && <div class="variant" title={card.variant_note}>{card.variant_note}</div>}
        </>
      }
      renderFace={renderFace}
    />
  );
}

function ManufacturerContext({ m }: { m: Record<string, unknown> }) {
  const fields = Object.entries(m).filter(([k, v]) => !['slug', 'name', 'sources'].includes(k) && (typeof v === 'string' || typeof v === 'number'));
  if (!fields.length) return null;
  return (
    <dl class="kv small">
      {fields.slice(0, 8).map(([k, v]) => (
        <>
          <dt>{k.replace(/_/g, ' ')}</dt>
          <dd>{String(v)}</dd>
        </>
      ))}
    </dl>
  );
}

export function CardPage({ id }: { id: string }) {
  const card = systemsById.get(id);
  if (!card) return <p>Unknown card. <a href="#/">Back to cards</a></p>;
  const list = systemsIn(card.category);
  const idx = list.findIndex((c) => c.id === id);
  const prev = list[(idx - 1 + list.length) % list.length];
  const next = list[(idx + 1) % list.length];
  return (
    <div class="stack">
      <div class="spread">
        <a href="#/">← Cards</a>
        <span class="row">
          <button
            class={`btn${compareIds.value.includes(card.id) ? ' primary' : ''}`}
            aria-pressed={compareIds.value.includes(card.id)}
            disabled={!compareIds.value.includes(card.id) && compareIds.value.length >= MAX_COMPARE}
            onClick={() => toggleCompare(card.id)}
            data-testid="compare-toggle"
          >
            {compareIds.value.includes(card.id) ? '✓ Compare' : '+ Compare'}
          </button>
          {compareIds.value.length >= 2 && (
            <a class="btn" href={compareHash()}>
              Compare {compareIds.value.length}
            </a>
          )}
          <a class="btn" href={`#/card/${prev.id}`} aria-label="Previous card">↑ Prev</a>
          <a class="btn" href={`#/card/${next.id}`} aria-label="Next card">Next ↓</a>
        </span>
      </div>
      <SystemCardView card={card} onPrev={() => go(`#/card/${prev.id}`)} onNext={() => go(`#/card/${next.id}`)} />
      <p class="muted small" style={{ textAlign: 'center' }}>
        Swipe or tap to turn · ←/→ faces · ↑/↓ cards
      </p>
    </div>
  );
}

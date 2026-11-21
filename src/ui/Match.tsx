import { useMemo, useState } from 'preact/hooks';
import type { CompiledSystem } from '../model/types.ts';
import { deck, systemsById } from '../data/deck.ts';
import { peersOf } from '../game/cards.ts';
import { makeRng, sample, shuffle } from '../game/rng.ts';
import { countryName, flag } from '../game/countries.ts';
import { Silhouette } from './Silhouette.tsx';
import { updateProgress } from './store.ts';

export interface MatchRound {
  target: CompiledSystem;
  peers: Set<string>;
  hand: CompiledSystem[];
}

/** A target system and a hand of six: its true peers (up to four) mixed with other systems. */
export function makeMatch(all: CompiledSystem[], seed: number, handSize = 6): MatchRound | null {
  const rng = makeRng(seed);
  const candidates = all.filter((s) => peersOf(s, all).size > 0);
  if (!candidates.length) return null;
  const target = candidates[Math.floor(rng() * candidates.length)];
  const peers = peersOf(target, all);
  const truePeers = sample([...peers].map((id) => all.find((s) => s.id === id)!).filter(Boolean), Math.min(4, handSize - 2), rng);
  const sameCat = all.filter((s) => s.id !== target.id && !peers.has(s.id) && s.category === target.category);
  const other = all.filter((s) => s.id !== target.id && !peers.has(s.id) && s.category !== target.category);
  const fill = [...sample(sameCat, handSize, rng), ...sample(other, handSize, rng)].slice(0, handSize - truePeers.length);
  return { target, peers: new Set(truePeers.map((p) => p.id)), hand: shuffle([...truePeers, ...fill], rng) };
}

export function MatchPage() {
  const [seed, setSeed] = useState(() => Date.now());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState(false);
  const round = useMemo(() => makeMatch(deck.systems, seed), [seed]);
  if (!round) return <p class="muted">No peer links recorded yet.</p>;

  const toggle = (id: string) => {
    if (checked) return;
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };
  const hits = [...sel].filter((id) => round.peers.has(id)).length;
  const wrong = sel.size - hits;
  const check = () => {
    setChecked(true);
    const ok = hits === round.peers.size && wrong === 0;
    updateProgress((p) => {
      const q = p.quiz.match ?? { right: 0, wrong: 0 };
      return { ...p, quiz: { ...p.quiz, match: { right: q.right + (ok ? 1 : 0), wrong: q.wrong + (ok ? 0 : 1) } } };
    });
  };

  return (
    <div class="stack">
      <h1>Match-up</h1>
      <p class="muted">Pick the direct competitors of this system from the hand.</p>
      <div class="panel stack" data-testid="match">
        <Silhouette card={round.target} />
        <h2>{round.target.name}</h2>
        <p class="muted small">
          {flag(round.target.origin)} {countryName(round.target.origin)} · {round.target.role}
        </p>
      </div>
      <div class="hand">
        {round.hand.map((c) => {
          const isPeer = round.peers.has(c.id);
          const cls = checked ? (isPeer ? ' right' : sel.has(c.id) ? ' wrong' : '') : sel.has(c.id) ? ' sel' : '';
          return (
            <button class={`btn${cls}`} aria-pressed={sel.has(c.id)} onClick={() => toggle(c.id)}>
              <Silhouette card={c} />
              <strong>{c.name}</strong>
              <span class="muted small">
                {flag(c.origin)} {countryName(c.origin)}
              </span>
            </button>
          );
        })}
      </div>
      <style>{`.hand .btn.right{border-color:var(--win);box-shadow:inset 0 0 0 2px var(--win)}.hand .btn.wrong{border-color:var(--lose);box-shadow:inset 0 0 0 2px var(--lose)}`}</style>
      {checked ? (
        <div class="panel stack">
          <p class={`result ${hits === round.peers.size && !wrong ? 'player' : 'computer'}`}>
            {hits} of {round.peers.size} peers found{wrong ? `, ${wrong} wrong` : ''}.
          </p>
          <p class="small muted">Peers: {[...round.peers].map((id) => systemsById.get(id)?.name).join(', ')}</p>
          <button class="btn primary" onClick={() => (setSeed(seed + 1), setSel(new Set()), setChecked(false))}>
            Next
          </button>
        </div>
      ) : (
        <button class="btn primary" disabled={!sel.size} onClick={check}>
          Check
        </button>
      )}
    </div>
  );
}

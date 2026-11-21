import { useMemo, useRef, useState } from 'preact/hooks';
import type { CompiledSystem } from '../model/types.ts';
import { deck, systemsIn } from '../data/deck.ts';
import { pickableIndicators, valueOf, formatValue } from '../game/cards.ts';
import { computerChoice, newDuel, play, type Difficulty, type DuelState } from '../game/duel.ts';
import { makeRng } from '../game/rng.ts';
import { Silhouette } from './Silhouette.tsx';
import { updateProgress } from './store.ts';

const playable = () => deck.categories.filter((c) => systemsIn(c.id).filter((s) => pickableIndicators(c, s).length).length >= 2);

export function DuelPage() {
  const cats = playable();
  const [catId, setCatId] = useState(cats[0]?.id ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [state, setState] = useState<DuelState | null>(null);

  if (!cats.length) return <p class="muted">No category has enough cards with values for a duel yet.</p>;
  if (state) return <DuelBoard initial={state} onQuit={() => setState(null)} />;
  const cat = cats.find((c) => c.id === catId)!;
  return (
    <div class="stack">
      <h1>Trumps duel</h1>
      <p class="muted">The deck is shuffled and split. Whoever's turn it is picks a value from their top card; the better value wins both cards. Ties go to the pot. Empty values can't be picked.</p>
      <div class="panel stack">
        <label>
          Category
          <select value={catId} onChange={(e) => setCatId(e.currentTarget.value)} data-testid="duel-category">
            {cats.map((c) => (
              <option value={c.id}>
                {c.name} ({systemsIn(c.id).length} cards)
              </option>
            ))}
          </select>
        </label>
        <div class="row" role="radiogroup" aria-label="Difficulty">
          {(['easy', 'hard'] as const).map((d) => (
            <button class={`chip${difficulty === d ? ' on' : ''}`} role="radio" aria-checked={difficulty === d} onClick={() => setDifficulty(d)}>
              {d === 'easy' ? 'Easy — computer picks at random' : 'Hard — computer picks its best value'}
            </button>
          ))}
        </div>
        <button class="btn primary" data-testid="duel-start" onClick={() => setState(newDuel(cat, systemsIn(cat.id), difficulty))}>
          Deal cards
        </button>
      </div>
    </div>
  );
}

function MiniCard({ card, state, hidden, chosen, onPick }: { card: CompiledSystem; state: DuelState; hidden?: boolean; chosen?: string; onPick?: (id: string) => void }) {
  if (hidden)
    return (
      <div class="panel" style={{ minHeight: '200px', display: 'grid', placeItems: 'center' }}>
        <span class="muted">Computer's card is face down</span>
      </div>
    );
  const pickable = new Set(pickableIndicators(state.category, card).map((i) => i.id));
  return (
    <div class="panel stack">
      <Silhouette card={card} />
      <h2>{card.name}</h2>
      <div>
        {state.category.indicators.map((i) => {
          const v = valueOf(card, i.id);
          const can = !!onPick && pickable.has(i.id);
          return (
            <button class={`btn ind-btn${chosen === i.id ? ' primary' : ''}`} disabled={!can && !chosen} onClick={() => can && onPick!(i.id)} data-testid={can ? 'pick' : undefined}>
              <span>
                {i.label}
                {i.trump === 'lower_wins' ? ' ↓' : ''}
              </span>
              <span class="v">{formatValue(v, i)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DuelBoard({ initial, onQuit }: { initial: DuelState; onQuit: () => void }) {
  const [s, setS] = useState(initial);
  const [reveal, setReveal] = useState(false);
  const rng = useMemo(() => makeRng(initial.seed + 1), [initial.seed]);
  const pool = useMemo(() => systemsIn(initial.category.id), [initial.category.id]);
  const recorded = useRef(false);

  // Record the result as soon as the last round is played (not in an effect, which may never run if the player leaves).
  const pickFor = (id: string) => {
    const next = play(s, id);
    setS(next);
    setReveal(true);
    if (next.over && !recorded.current) {
      recorded.current = true;
      updateProgress((p) => ({
        ...p,
        duels: {
          played: p.duels.played + 1,
          won: p.duels.won + (next.winner === 'player' ? 1 : 0),
          lost: p.duels.lost + (next.winner === 'computer' ? 1 : 0),
          drawn: p.duels.drawn + (next.winner === 'draw' ? 1 : 0),
        },
      }));
    }
  };

  const last = s.last;
  const msg =
    last &&
    (last.winner === 'tie'
      ? `Tie on ${last.indicator.label} — ${last.potSize} cards in the pot.`
      : `${last.winner === 'player' ? 'You win' : 'Computer wins'} ${last.potSize} cards on ${last.indicator.label}.`);

  return (
    <div class="stack" data-testid="duel-board">
      <div class="spread">
        <h1>{s.category.name}</h1>
        <button class="btn" onClick={onQuit}>
          Quit
        </button>
      </div>
      <div class="score panel" aria-live="polite">
        <span>You: <strong data-testid="score-player">{s.player.length}</strong></span>
        <span>Computer: <strong>{s.computer.length}</strong></span>
        <span>Pot: {s.pot.length}</span>
        <span class="muted">Round {s.round}</span>
      </div>
      {reveal && last ? (
        <>
          <p class={`result ${last.winner}`} data-testid="round-result">{msg}</p>
          <div class="duel">
            <MiniCard card={last.playerCard} state={s} chosen={last.indicator.id} />
            <MiniCard card={last.computerCard} state={s} chosen={last.indicator.id} />
          </div>
          {s.over ? (
            <div class="panel stack" data-testid="duel-over">
              <p class="result">{s.winner === 'player' ? 'You won the duel!' : s.winner === 'computer' ? 'The computer won the duel.' : 'Draw.'}</p>
              <button class="btn primary" onClick={onQuit}>New duel</button>
            </div>
          ) : (
            <button class="btn primary" data-testid="duel-next" onClick={() => setReveal(false)} autofocus>
              Next round
            </button>
          )}
        </>
      ) : s.turn === 'player' ? (
        <>
          <p>Your turn — pick a value.</p>
          <div class="duel">
            <MiniCard card={s.player[0]} state={s} onPick={pickFor} />
            <MiniCard card={s.computer[0]} state={s} hidden />
          </div>
        </>
      ) : (
        <>
          <p>The computer's turn.</p>
          <div class="duel">
            <MiniCard card={s.player[0]} state={s} />
            <MiniCard card={s.computer[0]} state={s} hidden />
          </div>
          <button class="btn primary" data-testid="duel-computer" onClick={() => pickFor(computerChoice(s, pool, rng).id)}>
            Let the computer pick
          </button>
        </>
      )}
    </div>
  );
}

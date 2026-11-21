import { useMemo, useState } from 'preact/hooks';
import { deck, systemsById } from '../data/deck.ts';
import { countryName, flag } from '../game/countries.ts';
import { makeRng, sample, shuffle } from '../game/rng.ts';
import { OperatorMap } from './OperatorMap.tsx';
import { go } from './router.ts';
import { updateProgress } from './store.ts';

/** Operator map: explore who fields what, or quiz "which system is shown on this map?". */
export function MapPage({ id }: { id?: string }) {
  const withOps = deck.systems.filter((s) => s.operators.length > 0);
  const [mode, setMode] = useState<'explore' | 'quiz'>('explore');
  const [country, setCountry] = useState<string | null>(null);
  const card = (id && systemsById.get(id)) || withOps[0];
  if (!card) return <p class="muted">No operators recorded yet.</p>;
  const fielded = country ? deck.systems.filter((s) => s.operators.some((o) => o.country === country && o.state !== 'retired')) : [];
  return (
    <div class="stack">
      <h1>Operator map</h1>
      <div class="row">
        <button class={`chip${mode === 'explore' ? ' on' : ''}`} onClick={() => setMode('explore')}>Explore</button>
        <button class={`chip${mode === 'quiz' ? ' on' : ''}`} onClick={() => setMode('quiz')}>Quiz</button>
      </div>
      {mode === 'quiz' ? (
        <MapQuiz />
      ) : (
        <>
          <select value={card.id} onChange={(e) => go(`#/map/${e.currentTarget.value}`)} aria-label="System">
            {withOps.map((s) => (
              <option value={s.id}>{s.name}</option>
            ))}
          </select>
          <div class="panel">
            <OperatorMap operators={card.operators} onCountry={setCountry} />
          </div>
          <p class="muted small">Tap a highlighted country to see which systems it fields.</p>
          {country && (
            <div class="panel stack">
              <h2>
                {flag(country)} {countryName(country)}
              </h2>
              <div class="row">
                {fielded.map((s) => (
                  <a class="chip" href={`#/card/${s.id}`}>{s.name}</a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MapQuiz() {
  const pool = deck.systems.filter((s) => s.operators.length > 0);
  const [seed, setSeed] = useState(() => Date.now());
  const [chosen, setChosen] = useState<string | null>(null);
  const round = useMemo(() => {
    const rng = makeRng(seed);
    const card = pool[Math.floor(rng() * pool.length)];
    const others = sample(pool.filter((s) => s.id !== card.id), 3, rng);
    return others.length < 3 ? null : { card, options: shuffle([card, ...others], rng) };
  }, [seed]);
  if (!round) return <p class="muted">Needs at least four systems with operators.</p>;
  const answer = (id: string) => {
    setChosen(id);
    const ok = id === round.card.id;
    updateProgress((p) => {
      const q = p.quiz.map ?? { right: 0, wrong: 0 };
      return { ...p, quiz: { ...p.quiz, map: { right: q.right + (ok ? 1 : 0), wrong: q.wrong + (ok ? 0 : 1) } } };
    });
  };
  return (
    <div class="panel stack">
      <h2>Which system do these countries field?</h2>
      <OperatorMap operators={round.card.operators} />
      <div class="options">
        {round.options.map((o) => (
          <button class={`btn${chosen ? (o.id === round.card.id ? ' right' : o.id === chosen ? ' wrong' : '') : ''}`} disabled={!!chosen} onClick={() => answer(o.id)}>
            {o.name}
          </button>
        ))}
      </div>
      {chosen && (
        <button class="btn primary" onClick={() => (setChosen(null), setSeed(seed + 1))}>
          Next
        </button>
      )}
    </div>
  );
}

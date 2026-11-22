import { useMemo, useState } from 'preact/hooks';
import type { CompiledSystem } from '../model/types.ts';
import { deck, hasOwnSilhouette } from '../data/deck.ts';
import { makeRng, sample, shuffle } from '../game/rng.ts';
import { Silhouette } from './Silhouette.tsx';
import { PhotoView } from './PhotoView.tsx';
import { CategoryFilter } from './CategoryFilter.tsx';
import { updateProgress } from './store.ts';

interface Round {
  card: CompiledSystem;
  options: CompiledSystem[];
}

/** Silhouette → name, four options. Distractors come from the same category where possible. */
export function makeRound(pool: CompiledSystem[], all: CompiledSystem[], seed: number): Round | null {
  if (pool.length === 0) return null;
  const rng = makeRng(seed);
  const card = pool[Math.floor(rng() * pool.length)];
  const same = all.filter((s) => s.id !== card.id && s.category === card.category);
  const other = all.filter((s) => s.id !== card.id && s.category !== card.category);
  const distractors = [...sample(same, 3, rng), ...sample(other, 3, rng)].slice(0, 3);
  if (distractors.length < 3) return null;
  return { card, options: shuffle([card, ...distractors], rng) };
}

export function QuizPage() {
  const [cat, setCat] = useState('');
  const pool = useMemo(() => deck.systems.filter((s) => (hasOwnSilhouette(s) || s.photos?.length) && (!cat || s.category === cat)), [cat]);
  const [seed, setSeed] = useState(() => Date.now());
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const round = useMemo(() => makeRound(pool, deck.systems, seed), [pool, seed]);

  const answer = (id: string) => {
    if (!round) return;
    setChosen(id);
    const ok = id === round.card.id;
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    updateProgress((p) => {
      const q = p.quiz.silhouette ?? { right: 0, wrong: 0 };
      return { ...p, quiz: { ...p.quiz, silhouette: { right: q.right + (ok ? 1 : 0), wrong: q.wrong + (ok ? 0 : 1) } } };
    });
  };

  return (
    <div class="stack">
      <h1>Recognition quiz</h1>
      <p class="muted">Which system is this? Openly licensed photos where available, otherwise original silhouettes.</p>
      <CategoryFilter value={cat} onChange={(v) => (setCat(v), setChosen(null))} />
      {!round ? (
        <div class="panel">
          <p>No photos or silhouettes for {cat ? 'this category' : 'any card'} yet.</p>
          <p class="muted small">Cards without a drawing show a generic category placeholder and are left out of this quiz.</p>
        </div>
      ) : (
        <div class="panel stack" data-testid="quiz">
          <span class="muted small">
            Score {score.right}/{score.total}
          </span>
          {round.card.photos?.length ? <PhotoView key={round.card.id} photos={round.card.photos} hideCaption={!chosen} /> : <Silhouette card={round.card} label="Mystery silhouette" />}
          <div class="options">
            {round.options.map((o) => (
              <button class={`btn${chosen ? (o.id === round.card.id ? ' right' : o.id === chosen ? ' wrong' : '') : ''}`} disabled={!!chosen} onClick={() => answer(o.id)}>
                {o.name}
              </button>
            ))}
          </div>
          {chosen && (
            <div class="row">
              <button class="btn primary" onClick={() => (setChosen(null), setSeed(seed + 1))} autofocus>
                Next
              </button>
              <a class="btn" href={`#/card/${round.card.id}`}>Open card</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

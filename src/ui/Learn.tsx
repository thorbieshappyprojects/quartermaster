import { useMemo, useState } from 'preact/hooks';
import { categoriesById, deck } from '../data/deck.ts';
import { initialReview, nextBatch, questionsFor, review, type Grade, type Question } from '../game/srs.ts';
import { CategoryFilter } from './CategoryFilter.tsx';
import { progress, updateProgress } from './store.ts';

export function allQuestions(categoryId: string): Question[] {
  return deck.systems
    .filter((s) => !categoryId || s.category === categoryId)
    .flatMap((s) => questionsFor(s, categoriesById.get(s.category)!, deck.systems));
}

export function LearnPage() {
  const [cat, setCat] = useState('');
  const [session, setSession] = useState<Question[] | null>(null);
  const questions = useMemo(() => allQuestions(cat), [cat]);
  const reviews = progress.value.reviews;
  const now = Date.now();
  const due = questions.filter((q) => reviews[q.id] && reviews[q.id].due <= now).length;
  const fresh = questions.filter((q) => !reviews[q.id]).length;
  const learned = questions.filter((q) => reviews[q.id]?.interval >= 3).length;

  if (session) return <Session questions={session} onDone={() => setSession(null)} />;
  return (
    <div class="stack">
      <h1>Flashcards</h1>
      <p class="muted">Questions come from the card values. Spaced repetition brings back what you miss sooner.</p>
      <CategoryFilter value={cat} onChange={setCat} />
      <div class="panel stack">
        <div class="score">
          <span>Due: <strong>{due}</strong></span>
          <span>New: <strong>{fresh}</strong></span>
          <span>Learned: <strong>{learned}</strong> / {questions.length}</span>
        </div>
        <button class="btn primary" disabled={!due && !fresh} data-testid="learn-start" onClick={() => setSession(nextBatch(questions, reviews, Date.now()))}>
          {due || fresh ? `Start session (${Math.min(20, due + Math.min(10, fresh))})` : 'Nothing due — come back later'}
        </button>
      </div>
    </div>
  );
}

function Session({ questions, onDone }: { questions: Question[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const q = questions[i];
  if (!q)
    return (
      <div class="panel stack" data-testid="learn-done">
        <h2>Session complete</h2>
        <p>
          {right} of {questions.length} right.
        </p>
        <button class="btn primary" onClick={onDone}>Done</button>
      </div>
    );
  const grade = (g: Grade) => {
    updateProgress((p) => ({ ...p, reviews: { ...p.reviews, [q.id]: review(p.reviews[q.id] ?? initialReview(Date.now()), g, Date.now()) } }));
    setChosen(null);
    setI(i + 1);
  };
  const correct = chosen === q.answer;
  return (
    <div class="stack" data-testid="learn-session">
      <div class="spread">
        <span class="muted">
          {i + 1} / {questions.length}
        </span>
        <button class="btn" onClick={onDone}>End</button>
      </div>
      <div class="panel stack">
        <h2>{q.prompt}</h2>
        {q.detail && <p class="muted small">{q.detail}</p>}
        <div class="options">
          {q.options.map((o) => (
            <button
              class={`btn${chosen ? (o === q.answer ? ' right' : o === chosen ? ' wrong' : '') : ''}`}
              disabled={!!chosen}
              data-testid="option"
              onClick={() => {
                setChosen(o);
                if (o === q.answer) setRight(right + 1);
              }}
            >
              {o}
            </button>
          ))}
        </div>
        {chosen && (
          <div class="stack">
            <p class={`result ${correct ? 'player' : 'computer'}`}>{correct ? 'Correct.' : `Answer: ${q.answer}`}</p>
            <div class="row">
              {correct ? (
                <>
                  <button class="btn" onClick={() => grade('hard')}>Hard</button>
                  <button class="btn primary" data-testid="grade" onClick={() => grade('good')}>Good</button>
                  <button class="btn" onClick={() => grade('easy')}>Easy</button>
                </>
              ) : (
                <button class="btn primary" data-testid="grade" onClick={() => grade('again')}>Continue</button>
              )}
              <a class="btn" href={`#/card/${q.systemId}`}>Open card</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

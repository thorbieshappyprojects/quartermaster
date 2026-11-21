import type { SourcedText } from '../model/types.ts';
import { categoriesById, systemsIn } from '../data/deck.ts';
import { Silhouette } from './Silhouette.tsx';
import { SourceList, useFaces } from './CardView.tsx';

const FACES = ['Purpose', 'Strengths', 'Weaknesses', 'Counters', 'Trends', 'Sources'] as const;
const KEYS = ['purpose', 'strengths', 'weaknesses', 'counters', 'trends'] as const;

export function CategoryPage({ id }: { id: string }) {
  const cat = categoriesById.get(id);
  const { face, setFace, handlers, flipClass } = useFaces(FACES.length);
  if (!cat) return <p>Unknown category. <a href="#/">Back to cards</a></p>;
  const cc = cat.category_card;
  const refs = new Map<string, string[]>();
  KEYS.forEach((k) => cc[k].forEach((t) => refs.set(t.source, [...new Set([...(refs.get(t.source) ?? []), FACES[KEYS.indexOf(k)]])])));
  const items: SourcedText[] = face < KEYS.length ? cc[KEYS[face]] : [];
  return (
    <div class="stack">
      <a href="#/">← Cards</a>
      <div class="card-stage">
      <article key={`${id}-${face}`} class={flipClass} {...handlers} data-testid="category-card">
        <header class="card-head">
          <div class="cat">Category card · {cat.domain}</div>
          <h1>{cat.name}</h1>
        </header>
        <section class="card-body stack">
          {face === 0 && (
            <>
              <Silhouette card={{ category: cat.id }} label={cat.name} />
              {cc.summary && <p>{cc.summary}</p>}
            </>
          )}
          {face < KEYS.length ? (
            <>
              <h2>{FACES[face]}</h2>
              {items.length ? (
                <ul>
                  {items.map((t) => (
                    <li>{t.text}</li>
                  ))}
                </ul>
              ) : (
                <p class="muted">Not researched yet.</p>
              )}
            </>
          ) : (
            <>
              <h2>Sources</h2>
              <SourceList refs={refs} local={cat.sources} />
              <h3>Trump values in this category</h3>
              <ul class="plain small">
                {cat.indicators.map((i) => (
                  <li>
                    {i.label} ({i.unit || 'count'}) — {i.trump === 'higher_wins' ? 'higher wins' : i.trump === 'lower_wins' ? 'lower wins' : 'not playable'}
                    {i.derived ? ', calculated' : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p class="muted small">{systemsIn(cat.id).length} system cards in this category.</p>
        </section>
        <nav class="faces" aria-label="Card faces">
          {FACES.map((f, i) => (
            <button class={face === i ? 'on' : ''} aria-pressed={face === i} onClick={() => setFace(i)}>
              {f}
            </button>
          ))}
        </nav>
      </article>
      </div>
    </div>
  );
}

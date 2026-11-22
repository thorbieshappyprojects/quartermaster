import { route } from './ui/router.ts';
import { deck } from './data/deck.ts';
import { Browser } from './ui/Browser.tsx';
import { CardPage } from './ui/CardView.tsx';
import { CategoryPage } from './ui/CategoryCard.tsx';
import { DuelPage } from './ui/Duel.tsx';
import { LearnPage } from './ui/Learn.tsx';
import { QuizPage } from './ui/Quiz.tsx';
import { MatchPage } from './ui/Match.tsx';
import { MapPage } from './ui/MapPage.tsx';
import { SettingsPage } from './ui/Settings.tsx';
import { DesignPage } from './ui/DesignPage.tsx';
import { ComparePage } from './ui/Compare.tsx';

const NAV = [
  { hash: '', label: 'Cards', ico: '🂠' },
  { hash: 'duel', label: 'Duel', ico: '⚔' },
  { hash: 'learn', label: 'Learn', ico: '↻' },
  { hash: 'quiz', label: 'Quiz', ico: '◐' },
  { hash: 'match', label: 'Match-up', ico: '⇄' },
  { hash: 'map', label: 'Map', ico: '◍' },
  { hash: 'settings', label: 'More', ico: '⋯' },
];

export function App() {
  const [page = '', id] = route.value.parts;
  const active = page === 'card' || page === 'category' ? '' : page;
  return (
    <div class="app">
      <nav class="nav" aria-label="Main">
        <span class="brand">Quartermaster</span>
        {NAV.map((n) => (
          <a href={`#/${n.hash}`} class={active === n.hash ? 'active' : ''} aria-current={active === n.hash ? 'page' : undefined}>
            <span class="ico" aria-hidden="true">{n.ico}</span>
            {n.label}
          </a>
        ))}
      </nav>
      <main>
        {deck.systems.length === 0 && deck.categories.length === 0 && page !== 'settings' ? (
          <div class="empty panel" data-testid="empty-deck">
            <h1>The deck is empty</h1>
            <p class="muted">No cards have been researched yet. Add YAML files under data/ and rebuild.</p>
          </div>
        ) : page === 'card' && id ? (
          <CardPage id={id} />
        ) : page === 'category' && id ? (
          <CategoryPage id={id} />
        ) : page === 'duel' ? (
          <DuelPage />
        ) : page === 'learn' ? (
          <LearnPage />
        ) : page === 'quiz' ? (
          <QuizPage />
        ) : page === 'match' ? (
          <MatchPage />
        ) : page === 'map' ? (
          <MapPage id={id} />
        ) : page === 'compare' ? (
          <ComparePage />
        ) : page === 'design' ? (
          <DesignPage />
        ) : page === 'settings' ? (
          <SettingsPage />
        ) : (
          <Browser />
        )}
      </main>
    </div>
  );
}

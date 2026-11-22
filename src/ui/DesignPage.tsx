import { deck, systemsById } from '../data/deck.ts';
import { SystemCardView } from './CardView.tsx';
import { prefs, setPrefs, type CardMotion, type CardStyle } from './prefs.ts';

const STYLES: { id: CardStyle; label: string; note: string }[] = [
  { id: 'field', label: 'Field (default)', note: 'White card border and shadow, dark gunmetal panel, code badge, values as bars.' },
  { id: 'plain', label: 'Plain', note: 'The earlier sleek design without a card border.' },
  { id: 'classic', label: 'Classic', note: 'White card border and shadow, light printed card with a colour band per category.' },
];
const MOTIONS: { id: CardMotion; label: string; note: string }[] = [
  { id: 'rotate', label: 'Pillar (default)', note: 'Rotates like a pillar with one face per side.' },
  { id: 'flip', label: 'Flip', note: 'Turns like a playing card.' },
];

/** Design test: pick card style, motion and dark theme, see them on a real card. Stored per browser. */
export function DesignPage() {
  const p = prefs.value;
  const card = systemsById.get('leopard-2a8') ?? deck.systems[0];
  return (
    <div class="stack">
      <h1>Display</h1>
      <p class="muted">Card style, motion and theme. Defaults: Field, pillar, dark. A change applies to all cards in this browser.</p>
      <div class="panel stack">
        <div class="row" role="radiogroup" aria-label="Card style">
          {STYLES.map((s) => (
            <button class={`chip${p.style === s.id ? ' on' : ''}`} role="radio" aria-checked={p.style === s.id} onClick={() => setPrefs({ style: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
        <p class="small muted">{STYLES.find((s) => s.id === p.style)?.note}</p>
        <div class="row" role="radiogroup" aria-label="Motion">
          {MOTIONS.map((m) => (
            <button class={`chip${p.motion === m.id ? ' on' : ''}`} role="radio" aria-checked={p.motion === m.id} onClick={() => setPrefs({ motion: m.id })}>
              {m.label}
            </button>
          ))}
          <button class={`chip${p.dark ? ' on' : ''}`} aria-pressed={p.dark} onClick={() => setPrefs({ dark: true })}>
            Dark
          </button>
          <button class={`chip${!p.dark ? ' on' : ''}`} aria-pressed={!p.dark} onClick={() => setPrefs({ dark: false })}>
            Light
          </button>
        </div>
        <p class="small muted">{MOTIONS.find((m) => m.id === p.motion)?.note}</p>
      </div>
      {card && <SystemCardView card={card} />}
    </div>
  );
}

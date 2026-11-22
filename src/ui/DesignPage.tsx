import { deck, systemsById } from '../data/deck.ts';
import { SystemCardView } from './CardView.tsx';
import { prefs, setPrefs, type CardMotion, type CardStyle } from './prefs.ts';

const STYLES: { id: CardStyle; label: string; note: string }[] = [
  { id: 'plain', label: 'Current', note: 'The sleek design as it is today.' },
  { id: 'field', label: 'A · Field', note: 'White card border and shadow, dark gunmetal panel, code badge, values as bars.' },
  { id: 'classic', label: 'B · Classic', note: 'White card border and shadow, light printed card with a colour band per category.' },
];
const MOTIONS: { id: CardMotion; label: string; note: string }[] = [
  { id: 'flip', label: 'Flip', note: 'Turns like a playing card.' },
  { id: 'rotate', label: 'Pillar', note: 'Rotates like a pillar with one face per side.' },
];

/** Design test: pick card style, motion and dark theme, see them on a real card. Stored per browser. */
export function DesignPage() {
  const p = prefs.value;
  const card = systemsById.get('leopard-2a8') ?? deck.systems[0];
  return (
    <div class="stack">
      <h1>Card design test</h1>
      <p class="muted">Pick a style and a motion, then turn the card below (swipe, tap or the tabs). The choice applies to all cards in this browser.</p>
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
          <button class={`chip${p.dark ? ' on' : ''}`} aria-pressed={p.dark} onClick={() => setPrefs({ dark: !p.dark })}>
            Dark theme
          </button>
        </div>
        <p class="small muted">{MOTIONS.find((m) => m.id === p.motion)?.note}</p>
      </div>
      {card && <SystemCardView card={card} />}
    </div>
  );
}

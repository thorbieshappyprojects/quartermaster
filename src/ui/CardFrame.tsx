import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { prefs } from './prefs.ts';

const ROTATE_MS = 480;

interface Props {
  labels: readonly string[];
  /** Resets to the first face when this changes (e.g. another card). */
  resetKey: string;
  header: ComponentChildren;
  code?: string;
  renderFace: (i: number) => ComponentChildren;
  onPrevCard?: () => void;
  onNextCard?: () => void;
  testId: string;
}

/**
 * A card with several faces. Swipe, tap, arrow keys or the tab bar change the face.
 * Motion "flip" turns the card like a playing card; "rotate" turns it like a pillar with one face per side.
 */
export function CardFrame({ labels, resetKey, header, code, renderFace, onPrevCard, onNextCard, testId }: Props) {
  const count = labels.length;
  const [state, setState] = useState({ face: 0, prev: -1, dir: 1, n: 0 });
  const motion = prefs.value.motion;
  const stage = useRef<HTMLDivElement>(null);
  const [apothem, setApothem] = useState(280);

  const goTo = (next: number, dir: number) =>
    setState((s) => (next === s.face ? s : { face: next, prev: s.face, dir, n: s.n + 1 }));
  const step = (d: number) => goTo((state.face + d + count) % count, d);

  useEffect(() => setState({ face: 0, prev: -1, dir: 1, n: 0 }), [resetKey]);
  // Pillar geometry: distance from the axis to each face of a regular prism with `count` sides.
  useLayoutEffect(() => {
    const w = stage.current?.offsetWidth ?? 400;
    setApothem(w / (2 * Math.tan(Math.PI / count)));
  }, [count]);
  useEffect(() => {
    if (state.prev < 0) return;
    const t = setTimeout(() => setState((s) => ({ ...s, prev: -1 })), ROTATE_MS + 40);
    return () => clearTimeout(t);
  }, [state.n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowDown' && onNextCard) (e.preventDefault(), onNextCard());
      else if (e.key === 'ArrowUp' && onPrevCard) (e.preventDefault(), onPrevCard());
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= count) {
        const i = Number(e.key) - 1;
        goTo(i, i >= state.face ? 1 : -1);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY };
      moved.current = false;
    },
    onPointerUp: (e: PointerEvent) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        moved.current = true;
        step(dx < 0 ? 1 : -1);
      }
    },
    onClick: (e: MouseEvent) => {
      if (moved.current) return;
      if ((e.target as HTMLElement).closest('a, button, input, select, svg')) return;
      if (window.getSelection()?.toString()) return;
      step(1);
    },
  };

  const side = (i: number, role: 'current' | 'leaving') => {
    const animating = state.prev >= 0;
    let cls = 'card';
    if (animating && motion === 'flip' && role === 'current') cls += ` flip ${state.dir > 0 ? 'fwd' : 'back'}`;
    if (animating && motion === 'rotate') cls += ` pillar ${role} ${state.dir > 0 ? 'fwd' : 'back'}`;
    return (
      <article
        key={`${resetKey}-${i}-${role}`}
        class={cls}
        style={motion === 'rotate' ? { '--apothem': `${apothem}px`, '--step': `${360 / count}deg` } : undefined}
        data-cat={code?.[0]}
        data-testid={role === 'current' ? testId : undefined}
        aria-hidden={role === 'leaving' ? 'true' : undefined}
        aria-roledescription="card"
        {...(role === 'current' ? handlers : {})}
      >
        <div class="card-inner">
          <header class="card-head">
            {code && <span class="code">{code}</span>}
            <div class="head-text">{header}</div>
          </header>
          <section class="card-body stack" aria-live={role === 'current' ? 'polite' : undefined}>
            {renderFace(i)}
          </section>
          <nav class="faces" aria-label="Card faces">
            {labels.map((f, n) => (
              <button
                class={i === n ? 'on' : ''}
                aria-pressed={i === n}
                tabIndex={role === 'leaving' ? -1 : undefined}
                onClick={() => goTo(n, n >= state.face ? 1 : -1)}
              >
                {f}
              </button>
            ))}
          </nav>
        </div>
      </article>
    );
  };

  return (
    <div class={`card-stage motion-${motion}`} ref={stage}>
      {motion === 'rotate' && state.prev >= 0 && side(state.prev, 'leaving')}
      {side(state.face, 'current')}
    </div>
  );
}

import { useState } from 'preact/hooks';
import { deck } from '../data/deck.ts';
import { emptyProgress, mergeProgress, parseProgress } from '../game/progress.ts';
import { progress, updateProgress } from './store.ts';

export function SettingsPage() {
  const [msg, setMsg] = useState('');
  const p = progress.value;
  const exportFile = () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `quartermaster-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const incoming = parseProgress(await file.text());
      updateProgress((cur) => mergeProgress(cur, incoming));
      setMsg(`Imported ${Object.keys(incoming.reviews).length} reviews.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const values = deck.systems.flatMap((s) => Object.values(s.specs));
  const filled = values.filter((v) => v.value !== null).length;
  return (
    <div class="stack">
      <h1>Progress & about</h1>
      <div class="panel stack">
        <h2>Your progress</h2>
        <p>
          Duels: {p.duels.played} played, {p.duels.won} won, {p.duels.lost} lost, {p.duels.drawn} drawn · Flashcards reviewed: {Object.keys(p.reviews).length}
        </p>
        <p class="muted small">Progress is stored in this browser only. Export it to move it to another device.</p>
        <div class="row">
          <button class="btn primary" onClick={exportFile}>Export progress</button>
          <label class="btn">
            Import progress
            <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => importFile(e.currentTarget.files?.[0])} />
          </label>
          <button
            class="btn"
            onClick={() => {
              if (confirm('Reset all progress in this browser?')) updateProgress(() => emptyProgress());
            }}
          >
            Reset
          </button>
        </div>
        {msg && <p role="status">{msg}</p>}
      </div>
      <div class="panel stack">
        <h2>Display</h2>
        <p>
          <a href="#/design">Card style, motion and light/dark theme</a> — stored in this browser.
        </p>
      </div>
      <div class="panel stack">
        <h2>About the deck</h2>
        <p>
          {deck.categories.length} categories, {deck.systems.length} system cards, {filled} of {values.length} spec values filled. Data built {deck.generated.slice(0, 10)}.
        </p>
        <ul class="small">
          <li>Public, catalogue-level information only. No value is invented: a value without a public source stays empty and cannot be played.</li>
          <li>Every value carries a source and a confidence (green high, amber medium, red low). Conflicting figures are stored as a range.</li>
          <li>Costs show currency, price year and basis (unit price, or contract value divided by units).</li>
          <li>Silhouettes are original drawings; the world map uses public-domain Natural Earth data.</li>
        </ul>
      </div>
    </div>
  );
}

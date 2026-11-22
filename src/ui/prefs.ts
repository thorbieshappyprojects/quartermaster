import { signal } from '@preact/signals';

// Per-browser display preferences (design test). Stored locally; the page works without storage.
export type CardStyle = 'plain' | 'field' | 'classic';
export type CardMotion = 'flip' | 'rotate';
export interface Prefs {
  style: CardStyle;
  motion: CardMotion;
  dark: boolean;
}

// v2: defaults chosen after the design test (A Field, pillar, dark); earlier test choices are not carried over.
const KEY = 'quartermaster.prefs.v2';
const DEFAULTS: Prefs = { style: 'field', motion: 'rotate', dark: true };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export const prefs = signal<Prefs>(load());

export function setPrefs(p: Partial<Prefs>) {
  prefs.value = { ...prefs.value, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs.value));
  } catch {
    /* storage unavailable: preference lasts for this visit */
  }
  applyTheme();
}

export function applyTheme() {
  const root = document.documentElement;
  root.dataset.cardStyle = prefs.value.style;
  // Always explicit, so the choice wins over the system setting in both directions.
  root.dataset.theme = prefs.value.dark ? 'dark' : 'light';
}

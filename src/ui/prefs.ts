import { signal } from '@preact/signals';

// Per-browser display preferences (design test). Stored locally; the page works without storage.
export type CardStyle = 'plain' | 'field' | 'classic';
export type CardMotion = 'flip' | 'rotate';
export interface Prefs {
  style: CardStyle;
  motion: CardMotion;
  dark: boolean;
}

const KEY = 'quartermaster.prefs.v1';
const DEFAULTS: Prefs = { style: 'plain', motion: 'flip', dark: false };

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
  if (prefs.value.dark) root.dataset.theme = 'dark';
  else delete root.dataset.theme;
}

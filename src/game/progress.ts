// Player progress in the browser (localStorage), with export/import as a JSON file.
import type { ReviewState } from './srs.ts';

export interface Progress {
  version: 1;
  reviews: Record<string, ReviewState>;
  duels: { played: number; won: number; lost: number; drawn: number };
  quiz: Record<string, { right: number; wrong: number }>; // per mode
  updated: string;
}

export const KEY = 'quartermaster.progress.v1';

export function emptyProgress(): Progress {
  return { version: 1, reviews: {}, duels: { played: 0, won: 0, lost: 0, drawn: 0 }, quiz: {}, updated: new Date(0).toISOString() };
}

export function parseProgress(text: string): Progress {
  const p = JSON.parse(text);
  if (!p || p.version !== 1 || typeof p.reviews !== 'object' || typeof p.duels !== 'object')
    throw new Error('This file is not a Quartermaster progress export (version 1).');
  return { ...emptyProgress(), ...p };
}

export function loadProgress(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Progress {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? parseProgress(raw) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ ...p, updated: new Date().toISOString() }));
  } catch {
    /* storage unavailable (private mode); progress lives for this session only */
  }
}

/** Merge an import into existing progress: per question, keep the review seen most recently (later due date). */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const reviews = { ...a.reviews };
  for (const [k, v] of Object.entries(b.reviews)) if (!reviews[k] || v.due > reviews[k].due) reviews[k] = v;
  const quiz = { ...a.quiz };
  for (const [k, v] of Object.entries(b.quiz)) quiz[k] = { right: Math.max(v.right, quiz[k]?.right ?? 0), wrong: Math.max(v.wrong, quiz[k]?.wrong ?? 0) };
  const duels = a.duels.played >= b.duels.played ? a.duels : b.duels;
  return { version: 1, reviews, quiz, duels, updated: new Date().toISOString() };
}

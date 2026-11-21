import { signal } from '@preact/signals';
import { loadProgress, saveProgress, type Progress } from '../game/progress.ts';

export const progress = signal<Progress>(loadProgress());

export function updateProgress(fn: (p: Progress) => Progress) {
  progress.value = fn(progress.value);
  saveProgress(progress.value);
}

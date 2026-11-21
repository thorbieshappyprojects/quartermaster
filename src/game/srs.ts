// Spaced repetition (SM-2 variant) and question generation from card fields.
import type { Category, CompiledSystem } from '../model/types.ts';
import { formatMoney, formatValue } from './cards.ts';
import { countryName } from './countries.ts';
import { makeRng, sample, shuffle, type Rng } from './rng.ts';

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewState {
  ease: number; // SM-2 ease factor
  interval: number; // days
  reps: number;
  due: number; // epoch ms
  lapses: number;
}

const DAY = 86_400_000;

export function initialReview(now: number): ReviewState {
  return { ease: 2.5, interval: 0, reps: 0, due: now, lapses: 0 };
}

export function review(s: ReviewState, grade: Grade, now: number): ReviewState {
  if (grade === 'again') return { ...s, reps: 0, interval: 0, lapses: s.lapses + 1, ease: Math.max(1.3, s.ease - 0.2), due: now + 10 * 60_000 };
  const q = { hard: 3, good: 4, easy: 5 }[grade];
  const ease = Math.max(1.3, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const reps = s.reps + 1;
  let interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(s.interval * ease);
  if (grade === 'hard') interval = Math.max(1, Math.round(interval * 0.6));
  if (grade === 'easy') interval = Math.round(interval * 1.3) + 1;
  return { ease, interval, reps, lapses: s.lapses, due: now + interval * DAY };
}

export interface Question {
  id: string; // stable: <system>:<field>
  systemId: string;
  prompt: string;
  answer: string;
  options: string[]; // four choices including the answer, shuffled
  detail?: string;
}

function choices(answer: string, distractors: string[], rng: Rng): string[] {
  const uniq = [...new Set(distractors.filter((d) => d !== answer))];
  return shuffle([answer, ...sample(uniq, 3, rng)], rng);
}

/** All questions answerable from recorded values. Distractors come from other cards in the same category. */
export function questionsFor(card: CompiledSystem, category: Category, all: CompiledSystem[], seed = 1): Question[] {
  const rng = makeRng(seed + card.id.length * 31);
  const peers = all.filter((c) => c.id !== card.id);
  const sameCat = peers.filter((c) => c.category === card.category);
  const qs: Question[] = [];
  for (const ind of category.indicators) {
    const v = card.specs[ind.id]?.value;
    if (v == null) continue;
    const answer = formatValue(v, ind);
    const others = sameCat.map((c) => c.specs[ind.id]?.value).filter((x): x is number => x != null && x !== v);
    // Fill up with nearby plausible numbers when the category is small; these are distractors, never shown as facts.
    const synthetic = [0.8, 0.9, 1.1, 1.2].map((f) => (ind.decimals ? Math.round(v * f * 10) / 10 : Math.round(v * f)));
    const pool = [...others, ...synthetic].map((x) => formatValue(x, ind));
    if (new Set(pool.filter((p) => p !== answer)).size < 3) continue;
    qs.push({ id: `${card.id}:${ind.id}`, systemId: card.id, prompt: `${ind.label} of the ${card.name}?`, answer, options: choices(answer, pool, rng), detail: card.specs[ind.id]?.derived ? 'Calculated value' : undefined });
  }
  const textQ = (field: string, prompt: string, answer: string | undefined, pool: (string | undefined)[]) => {
    if (!answer) return;
    const p = pool.filter((x): x is string => !!x);
    if (new Set(p.filter((x) => x !== answer)).size < 3) return;
    qs.push({ id: `${card.id}:${field}`, systemId: card.id, prompt, answer, options: choices(answer, p, rng) });
  };
  textQ('origin', `Country of origin of the ${card.name}?`, countryName(card.origin), peers.map((c) => countryName(c.origin)));
  textQ('manufacturer', `Who builds the ${card.name}?`, card.manufacturer.name, peers.map((c) => c.manufacturer.name));
  textQ('role', `Which system is this? “${card.role}”`, card.name, sameCat.map((c) => c.name));
  if (card.memorable_fact) textQ('fact', `Which system? ${card.memorable_fact.text}`, card.name, sameCat.map((c) => c.name));
  if (card.in_service_since.value != null)
    textQ('since', `In service since (${card.name})?`, String(card.in_service_since.value), [-6, -3, -2, 2, 3, 5, ...peers.map((c) => (c.in_service_since.value ?? 0) - card.in_service_since.value!)].map((d) => (d ? String(card.in_service_since.value! + d) : undefined)));
  if (card.cost.value != null)
    textQ('cost', `Unit cost estimate of the ${card.name} (${card.cost.basis === 'unit_price' ? 'unit price' : 'contract value per unit'}, ${card.cost.price_year})?`, formatMoney(card.cost.value, card.cost.currency), [0.5, 0.7, 1.4, 2].map((f) => formatMoney(card.cost.value! * f, card.cost.currency)));
  return qs;
}

/** Next questions to study: due ones first (oldest first), then new ones, up to limit. */
export function nextBatch(questions: Question[], states: Record<string, ReviewState>, now: number, limit = 20, newLimit = 10): Question[] {
  const due = questions.filter((q) => states[q.id] && states[q.id].due <= now).sort((a, b) => states[a.id].due - states[b.id].due);
  const fresh = questions.filter((q) => !states[q.id]).slice(0, newLimit);
  return [...due, ...fresh].slice(0, limit);
}

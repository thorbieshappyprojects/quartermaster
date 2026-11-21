import { describe, expect, it } from 'vitest';
import { loadData } from '../../scripts/lib/load.ts';
import { compileDeck } from '../../scripts/lib/compile.ts';
import { compare, pickableIndicators, peersOf, strength } from '../../src/game/cards.ts';
import { newDuel, play, computerChoice } from '../../src/game/duel.ts';
import { makeRng } from '../../src/game/rng.ts';
import { initialReview, review, questionsFor, nextBatch } from '../../src/game/srs.ts';
import { emptyProgress, mergeProgress, parseProgress } from '../../src/game/progress.ts';
import type { CompiledSystem } from '../../src/model/types.ts';

const deck = compileDeck(loadData('tests/fixtures/valid'));
const cat = deck.categories[0];
const alpha = deck.systems.find((s) => s.id === 'alpha')!;
const beta = deck.systems.find((s) => s.id === 'beta')!;
const ind = (id: string) => cat.indicators.find((i) => i.id === id)!;

function clone(card: CompiledSystem, id: string, specs: Record<string, number | null>): CompiledSystem {
  const s = Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, { value: v, source: v == null ? null : 's1', confidence: v == null ? null : ('high' as const) }]));
  return { ...card, id, name: id, specs: s };
}

describe('cards', () => {
  it('respects trump direction', () => {
    expect(compare(alpha, beta, ind('combat_weight'))).toBe('a'); // 60 > 55, higher wins
    expect(compare(alpha, beta, ind('crew'))).toBe('b'); // 4 vs 3, lower wins
  });
  it('treats a missing value as a tie and never offers it for picking', () => {
    expect(compare(alpha, beta, ind('engine_power'))).toBe('tie');
    expect(pickableIndicators(cat, beta).map((i) => i.id)).toEqual(['combat_weight', 'crew']);
  });
  it('computes strength percentiles and symmetric peers', () => {
    expect(strength(alpha, ind('combat_weight'), [alpha, beta])).toBe(1);
    expect([...peersOf(alpha, deck.systems)]).toEqual(['beta']);
  });
});

describe('duel', () => {
  const cards = [
    clone(alpha, 'a1', { combat_weight: 60, engine_power: 1500, crew: 4 }),
    clone(alpha, 'a2', { combat_weight: 50, engine_power: 1200, crew: 3 }),
    clone(alpha, 'a3', { combat_weight: 70, engine_power: null, crew: 4 }),
    clone(alpha, 'a4', { combat_weight: 40, engine_power: 1000, crew: 2 }),
  ];

  it('splits the deck evenly', () => {
    const s = newDuel(cat, cards, 'easy', 7);
    expect(s.player.length).toBe(2);
    expect(s.computer.length).toBe(2);
  });

  it('winner takes both cards and keeps the turn; ties go to the pot', () => {
    let s = newDuel(cat, cards, 'easy', 7);
    s = { ...s, turn: 'player', player: [cards[0], cards[1]], computer: [cards[3], cards[2]] };
    s = play(s, 'combat_weight'); // 60 vs 40 → player
    expect(s.last!.winner).toBe('player');
    expect(s.player.map((c) => c.id)).toEqual(['a2', 'a1', 'a4']);
    expect(s.turn).toBe('player');
    // a2 (crew 3) vs a3 (crew 4) on engine power: a3 has none → tie into pot
    s = play(s, 'engine_power');
    expect(s.last!.winner).toBe('tie');
    expect(s.pot.length).toBe(2);
    expect(s.over).toBe(true); // computer is out of cards
  });

  it('rejects picking an empty value', () => {
    const s = { ...newDuel(cat, cards, 'easy', 1), turn: 'player' as const, player: [cards[2]], computer: [cards[0]] };
    expect(() => play(s, 'engine_power')).toThrow(/cannot be picked/);
  });

  it('hard computer picks its strongest indicator', () => {
    const s = { ...newDuel(cat, cards, 'hard', 1), computer: [cards[3]] };
    expect(computerChoice(s, cards, makeRng(1)).id).toBe('crew'); // crew 2 is the best (lower wins)
  });

  it('a full random game terminates', () => {
    let s = newDuel(cat, cards, 'hard', 3);
    const rng = makeRng(3);
    while (!s.over) s = play(s, s.turn === 'computer' ? computerChoice(s, cards, rng).id : pickableIndicators(cat, s.player[0])[0].id);
    expect(['player', 'computer', 'draw']).toContain(s.winner);
  });
});

describe('spaced repetition', () => {
  it('grows intervals on success and resets on failure', () => {
    let r = initialReview(0);
    r = review(r, 'good', 0);
    expect(r.interval).toBe(1);
    r = review(r, 'good', 0);
    expect(r.interval).toBe(3);
    r = review(r, 'good', 0);
    expect(r.interval).toBeGreaterThan(6);
    r = review(r, 'again', 0);
    expect(r.interval).toBe(0);
    expect(r.lapses).toBe(1);
  });

  it('generates questions only from recorded values, with four distinct options', () => {
    const qs = questionsFor(alpha, cat, deck.systems);
    expect(qs.some((q) => q.id === 'alpha:engine_power')).toBe(true);
    expect(questionsFor(beta, cat, deck.systems).some((q) => q.id === 'beta:engine_power')).toBe(false);
    for (const q of qs) {
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  it('schedules due questions before new ones', () => {
    const qs = questionsFor(alpha, cat, deck.systems);
    const states = { [qs[1].id]: { ...initialReview(0), due: 5 } };
    expect(nextBatch(qs, states, 10)[0].id).toBe(qs[1].id);
  });
});

describe('progress', () => {
  it('round-trips export/import and rejects foreign files', () => {
    const p = emptyProgress();
    p.duels.played = 2;
    expect(parseProgress(JSON.stringify(p)).duels.played).toBe(2);
    expect(() => parseProgress('{"foo":1}')).toThrow(/not a Quartermaster/);
  });
  it('merges keeping the later review', () => {
    const a = emptyProgress();
    const b = emptyProgress();
    a.reviews.x = { ...initialReview(0), due: 1 };
    b.reviews.x = { ...initialReview(0), due: 9 };
    expect(mergeProgress(a, b).reviews.x.due).toBe(9);
  });
});

import type { Category, CompiledSystem, Indicator } from '../model/types.ts';
import { compare, pickableIndicators, strength } from './cards.ts';
import { makeRng, pick, shuffle, type Rng } from './rng.ts';

export type Side = 'player' | 'computer';
export type Difficulty = 'easy' | 'hard';

export interface RoundResult {
  picker: Side;
  indicator: Indicator;
  playerCard: CompiledSystem;
  computerCard: CompiledSystem;
  winner: Side | 'tie';
  potSize: number; // cards won (incl. pot) or now in the pot
}

export interface DuelState {
  category: Category;
  difficulty: Difficulty;
  player: CompiledSystem[]; // index 0 = top card
  computer: CompiledSystem[];
  pot: CompiledSystem[];
  turn: Side;
  round: number;
  maxRounds: number;
  last: RoundResult | null;
  over: boolean;
  winner: Side | 'draw' | null;
  seed: number;
}

/** Shuffle and split a category deck. Cards with no playable value at all are left out. */
export function newDuel(category: Category, cards: CompiledSystem[], difficulty: Difficulty, seed = Date.now(), maxRounds = 100): DuelState {
  const rng = makeRng(seed);
  const usable = shuffle(
    cards.filter((c) => c.category === category.id && pickableIndicators(category, c).length > 0),
    rng,
  );
  if (usable.length < 2) throw new Error('A duel needs at least two cards with values.');
  const even = usable.length - (usable.length % 2);
  const deal = usable.slice(0, even);
  return {
    category,
    difficulty,
    player: deal.filter((_, i) => i % 2 === 0),
    computer: deal.filter((_, i) => i % 2 === 1),
    pot: [],
    turn: rng() < 0.5 ? 'player' : 'computer',
    round: 0,
    maxRounds,
    last: null,
    over: false,
    winner: null,
    seed,
  };
}

/** The computer's choice: easy = random playable indicator, hard = its card's strongest indicator. */
export function computerChoice(s: DuelState, pool: CompiledSystem[], rng: Rng): Indicator {
  const card = s.computer[0];
  const options = pickableIndicators(s.category, card);
  if (s.difficulty === 'easy') return pick(options, rng);
  return options.reduce((best, i) => (strength(card, i, pool) > strength(card, best, pool) ? i : best));
}

export function play(s: DuelState, indicatorId: string): DuelState {
  if (s.over) throw new Error('The duel is over.');
  const picker = s.turn;
  const holder = picker === 'player' ? s.player[0] : s.computer[0];
  const indicator = pickableIndicators(s.category, holder).find((i) => i.id === indicatorId);
  if (!indicator) throw new Error(`Indicator '${indicatorId}' cannot be picked for ${holder.name}.`);

  const [pc, ...pRest] = s.player;
  const [cc, ...cRest] = s.computer;
  const outcome = compare(pc, cc, indicator);
  let player = pRest;
  let computer = cRest;
  let pot = s.pot;
  let turn: Side = picker;
  let winner: RoundResult['winner'];
  let potSize: number;
  if (outcome === 'tie') {
    pot = [...pot, pc, cc];
    winner = 'tie';
    potSize = pot.length;
  } else {
    const won = [...(outcome === 'a' ? [pc, cc] : [cc, pc]), ...pot];
    potSize = won.length;
    pot = [];
    if (outcome === 'a') {
      player = [...player, ...won];
      winner = 'player';
      turn = 'player';
    } else {
      computer = [...computer, ...won];
      winner = 'computer';
      turn = 'computer';
    }
  }
  const round = s.round + 1;
  const next: DuelState = {
    ...s,
    player,
    computer,
    pot,
    turn,
    round,
    last: { picker, indicator, playerCard: pc, computerCard: cc, winner, potSize },
  };
  // A hand can run out on a tie; the next holder must also have something to pick.
  const stuck = (side: CompiledSystem[]) => side.length === 0;
  if (stuck(player) || stuck(computer) || round >= s.maxRounds) {
    next.over = true;
    next.winner = player.length === computer.length ? 'draw' : player.length > computer.length ? 'player' : 'computer';
  }
  return next;
}

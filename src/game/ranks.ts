// Ranks deck: pure game logic (seniority, equivalence across countries, quiz rounds).
import type { Rank, RankForce } from '../model/types.ts';
import { makeRng, sample, shuffle } from './rng.ts';

/** Seniority of a NATO rank code: OR-1..9 < WO-1..5 < OF-D < OF-1..10. NaN for anything else. */
export function codeRank(code: string): number {
  const [, kind, n] = /^(OR|WO|OF)-(D|\d+)$/.exec(code) ?? [];
  if (kind === 'OR') return Number(n);
  if (kind === 'WO') return 10 + Number(n);
  if (kind === 'OF') return n === 'D' ? 20 : 20 + Number(n);
  return NaN;
}

export const BRANCH_LABEL = { army: 'Army', air_force: 'Air force', navy: 'Navy' } as const;

export interface RankRef {
  force: RankForce;
  rank: Rank;
}

const all = (forces: RankForce[]): RankRef[] => forces.flatMap((force) => force.ranks.map((rank) => ({ force, rank })));

/** All NATO codes in use across the given forces, most senior first. */
export function codesInUse(forces: RankForce[]): string[] {
  return [...new Set(forces.flatMap((f) => f.ranks.map((r) => r.code)))].sort((a, b) => codeRank(b) - codeRank(a));
}

export interface ChoiceRound {
  question: RankRef;
  /** For the equivalence round: the force the answer comes from. */
  target?: RankForce;
  options: RankRef[];
  correct: Set<string>;
}

/** Insignia → rank name: four ranks of the same force, the shown one has an insignia image. */
export function insigniaRound(forces: RankForce[], seed: number): ChoiceRound | null {
  const rng = makeRng(seed);
  const pool = all(forces).filter((r) => r.rank.insignia);
  if (!pool.length) return null;
  const q = pool[Math.floor(rng() * pool.length)];
  const others = q.force.ranks.filter((r) => r.id !== q.rank.id && r.name !== q.rank.name);
  if (others.length < 3) return null;
  // Prefer neighbours in the same group: they are the ones that get confused.
  const near = others.filter((r) => r.group === q.rank.group);
  const pick = [...sample(near, 3, rng), ...sample(others.filter((r) => r.group !== q.rank.group), 3, rng)].slice(0, 3);
  return { question: q, options: shuffle([q, ...pick.map((rank) => ({ force: q.force, rank }))], rng), correct: new Set([q.rank.id]) };
}

/** Rank of one country → the equivalent rank (same NATO code) of another country's same service. */
export function equivalenceRound(forces: RankForce[], seed: number): ChoiceRound | null {
  const rng = makeRng(seed);
  const pairs = forces.flatMap((a) => forces.filter((b) => b.branch === a.branch && b.country !== a.country).map((b) => [a, b] as const));
  if (!pairs.length) return null;
  const [a, b] = pairs[Math.floor(rng() * pairs.length)];
  const askable = a.ranks.filter((r) => b.ranks.some((x) => x.code === r.code));
  if (!askable.length) return null;
  const q = askable[Math.floor(rng() * askable.length)];
  const right = b.ranks.filter((x) => x.code === q.code);
  const wrong = b.ranks.filter((x) => x.code !== q.code);
  const near = wrong.filter((x) => Math.abs(codeRank(x.code) - codeRank(q.code)) <= 2);
  const opts = [right[Math.floor(rng() * right.length)], ...[...sample(near, 3, rng), ...sample(wrong, 3, rng)].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 3)];
  if (opts.length < 4) return null;
  return { question: { force: a, rank: q }, target: b, options: shuffle(opts.map((rank) => ({ force: b, rank })), rng), correct: new Set(right.map((r) => r.id)) };
}

export interface OrderRound {
  force: RankForce;
  /** Shuffled; the answer is the order by seniority. */
  ranks: Rank[];
}

/** n ranks of one service with distinct NATO codes, to be put in order (most junior first). */
export function orderRound(forces: RankForce[], seed: number, n = 4): OrderRound | null {
  const rng = makeRng(seed);
  const usable = forces.filter((f) => new Set(f.ranks.map((r) => r.code)).size >= n);
  if (!usable.length) return null;
  const force = usable[Math.floor(rng() * usable.length)];
  const byCode = new Map<string, Rank[]>();
  for (const r of force.ranks) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  const codes = sample([...byCode.keys()], n, rng);
  const ranks = codes.map((c) => { const l = byCode.get(c)!; return l[Math.floor(rng() * l.length)]; });
  return { force, ranks: shuffle(ranks, rng) };
}

/** True if the ids are ordered most junior first. */
export function isOrdered(ranks: Rank[]): boolean {
  return ranks.every((r, i) => i === 0 || codeRank(ranks[i - 1].code) < codeRank(r.code));
}

import { describe, expect, it } from 'vitest';
import { loadData } from '../../scripts/lib/load.ts';
import { validate, formatIssue } from '../../scripts/lib/validate.ts';
import { compileDeck } from '../../scripts/lib/compile.ts';
import { codeRank, codesInUse, equivalenceRound, insigniaRound, isOrdered, orderRound } from '../../src/game/ranks.ts';

const forces = compileDeck(loadData('tests/fixtures/valid')).ranks;

describe('ranks data', () => {
  it('accepts the valid rank fixtures', () => {
    expect(validate(loadData('tests/fixtures/valid')).errors.map(formatIssue)).toEqual([]);
    expect(forces.map((f) => f.id)).toEqual(['aa-army', 'bb-army']); // sorted by country, then branch
  });

  it('rejects wrong order, unknown sources and unmarked approximate codes', () => {
    const msgs = validate(loadData('tests/fixtures/broken')).errors.filter((e) => e.file.includes('/ranks/')).map((e) => `${e.path}: ${e.message}`);
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ranks[1].code: ranks must be listed most junior first'),
        "ranks[1].source: unknown source 's2'",
        'ranks[1].approximate: country is outside the NATO scheme: mark the code approximate',
      ]),
    );
  });
});

describe('ranks game', () => {
  it('orders NATO codes by seniority', () => {
    expect(['OF-1', 'OR-9', 'WO-1', 'OF-D', 'OR-1', 'OF-10'].sort((a, b) => codeRank(a) - codeRank(b))).toEqual(['OR-1', 'OR-9', 'WO-1', 'OF-D', 'OF-1', 'OF-10']);
    expect(codesInUse(forces)[0]).toBe('OF-1');
  });

  it('equivalence rounds accept every rank with the same code', () => {
    for (let seed = 1; seed < 30; seed++) {
      const r = equivalenceRound(forces, seed)!;
      expect(r.target!.country).not.toBe(r.question.force.country);
      for (const id of r.correct) expect(r.target!.ranks.find((x) => x.id === id)!.code).toBe(r.question.rank.code);
      expect(r.options.some((o) => r.correct.has(o.rank.id))).toBe(true);
      expect(new Set(r.options.map((o) => o.rank.id)).size).toBe(4);
    }
  });

  it('order rounds use distinct codes and check seniority', () => {
    const r = orderRound(forces, 7)!;
    expect(new Set(r.ranks.map((x) => x.code)).size).toBe(4);
    const sorted = [...r.ranks].sort((a, b) => codeRank(a.code) - codeRank(b.code));
    expect(isOrdered(sorted)).toBe(true);
    expect(isOrdered([...sorted].reverse())).toBe(false);
  });

  it('insignia rounds need images', () => {
    expect(insigniaRound(forces, 1)).toBeNull();
  });
});

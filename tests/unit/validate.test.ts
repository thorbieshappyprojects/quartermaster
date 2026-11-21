import { describe, expect, it } from 'vitest';
import { loadData } from '../../scripts/lib/load.ts';
import { validate, formatIssue } from '../../scripts/lib/validate.ts';
import { compileDeck } from '../../scripts/lib/compile.ts';

describe('validator', () => {
  it('accepts the valid fixture and logs empty values as gaps', () => {
    const r = validate(loadData('tests/fixtures/valid'));
    expect(r.errors.map(formatIssue)).toEqual([]);
    expect(r.issues.some((i) => i.level === 'gap' && i.path === 'specs.engine_power')).toBe(true);
  });

  it('rejects the broken sample card with readable messages', () => {
    const r = validate(loadData('tests/fixtures/broken'));
    const msgs = r.errors.map((e) => `${e.path}: ${e.message}`);
    expect(r.ok).toBe(false);
    expect(msgs).toEqual(
      expect.arrayContaining([
        'origin: has an invalid format (expected pattern ^[A-Z]{2}$)',
        'in_service_since.source: has a value but no source (every value needs a source)',
        'specs.combat_weight.value: displayed value 70 lies outside its range 58–62',
        "specs.engine_power.source: source 's9' is not listed in this file's sources",
        expect.stringContaining("unknown indicator 'top_speed'"),
        expect.stringContaining("missing indicator 'crew'"),
        'cost.basis: cost has a value but no basis',
        "peers[0]: peer 'does-not-exist' does not exist",
      ]),
    );
    expect(formatIssue(r.errors[0])).toMatch(/^ERROR\s+tests\/fixtures\/broken\/systems\/test-tank\/broken\.yaml → /);
  });

  it('validates the real data directory', () => {
    const r = validate(loadData('data'));
    expect(r.errors.map(formatIssue)).toEqual([]);
  });
});

describe('compile', () => {
  it('derives power-to-weight from two sourced values with the lower confidence', () => {
    const deck = compileDeck(loadData('tests/fixtures/valid'));
    const alpha = deck.systems.find((s) => s.id === 'alpha')!;
    expect(alpha.specs.power_to_weight).toMatchObject({ value: 25, confidence: 'medium', derived: true, source: null });
    const beta = deck.systems.find((s) => s.id === 'beta')!;
    expect(beta.specs.power_to_weight.value).toBeNull();
    expect(deck.sharedSources.map((s) => s.id)).toEqual(['shared-ref']);
  });
});

import { toEur } from '../../scripts/lib/compile.ts';
import type { Cost, FxTable } from '../../src/model/types.ts';

describe('EUR conversion', () => {
  const fx: FxTable = {
    source: { id: 'ecb-exr', url: 'https://example.org', title: 'ECB', publisher: 'ECB', retrieved: '2026-01-01' },
    annual: { USD: { '2022': 1.05 } },
    partial_year: { year: 2026, rates: { USD: { value: 1.16, months: '2026-01 to 2026-10' } } },
  };
  const cost = (value: number | null, currency: string | null, price_year: number | null): Cost => ({ value, currency, price_year, basis: 'unit_price', source: 's1', confidence: 'low' });

  it('uses the annual average of the price year', () => {
    expect(toEur(cost(10_500_000, 'USD', 2022), fx)).toEqual({ value: 10_000_000, rate: 1.05, year: 2022 });
  });
  it('falls back to the partial-year average and marks it', () => {
    expect(toEur(cost(11_600_000, 'USD', 2026), fx)).toMatchObject({ value: 10_000_000, partial: '2026-01 to 2026-10' });
  });
  it('keeps EUR as is and returns nothing when no rate or value exists', () => {
    expect(toEur(cost(5, 'EUR', 2020), fx)).toEqual({ value: 5, rate: 1, year: 2020 });
    expect(toEur(cost(5, 'GBP', 2020), fx)).toBeUndefined();
    expect(toEur(cost(null, null, null), fx)).toBeUndefined();
  });
});

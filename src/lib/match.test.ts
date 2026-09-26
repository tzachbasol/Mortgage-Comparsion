import { describe, expect, it } from 'vitest';
import { findMatches, stats } from './match';
import type { MatchSettings, OfferRecord } from './types';

const rec = (id: string, postedAt: string, tracks: OfferRecord['tracks'], extra: Partial<OfferRecord> = {}): OfferRecord => ({
  id,
  source: { kind: 'facebook_post', channel: 'group', postedAt, collectedAt: postedAt, quote: 'q' },
  stage: 'initial',
  tracks,
  origin: 'repo',
  ...extra,
});

const settings: MatchSettings = { termToleranceYears: 3, maxAgeMonths: 6, bank: '', stages: [], includeDemo: false };
const now = new Date('2026-09-26');

describe('findMatches', () => {
  const records = [
    rec('1', '2026-09-01', [{ type: 'fixed_unlinked', termYears: 20, rate: 4.8 }]),
    rec('2', '2026-08-01', [{ type: 'fixed_unlinked', termYears: 25, rate: 5.0 }]),
    rec('3', '2025-01-01', [{ type: 'fixed_unlinked', termYears: 20, rate: 3.0 }]), // too old
    rec('4', '2026-09-01', [{ type: 'prime', termYears: 30, primeMargin: -0.6 }]),
    rec('5', '2026-09-01', [{ type: 'prime', termYears: 30, rate: 4.75 }]),
    rec('6', '2026-09-01', [{ type: 'fixed_unlinked', termYears: 20, rate: 1 }], { origin: 'demo' }),
    rec('7', '2026-09-01', [{ type: 'variable_linked', termYears: 25, rate: 3.5, changeEveryYears: 5 }]),
    rec('8', '2026-09-01', [{ type: 'variable_linked', termYears: 25, rate: 3.0, changeEveryYears: 2 }]),
  ];

  it('filters by type, term tolerance, age and demo flag', () => {
    const m = findMatches({ type: 'fixed_unlinked', termYears: 22 }, records, settings, 5.25, now);
    expect(m.map((x) => x.record.id)).toEqual(['1', '2']);
  });

  it('includes demo records only when asked', () => {
    const m = findMatches({ type: 'fixed_unlinked', termYears: 20 }, records, { ...settings, includeDemo: true }, 5.25, now);
    expect(m.map((x) => x.record.id)).toContain('6');
  });

  it('uses the prime margin, converting total prime rates', () => {
    const m = findMatches({ type: 'prime', termYears: 30 }, records, settings, 5.25, now);
    expect(m.map((x) => x.value).sort((a, b) => a - b)).toEqual([-0.6, -0.5]);
  });

  it('matches variable tracks by reset period', () => {
    const m = findMatches({ type: 'variable_linked', termYears: 25, changeEveryYears: 5 }, records, settings, 5.25, now);
    expect(m.map((x) => x.record.id)).toEqual(['7']);
  });
});

describe('stats', () => {
  it('computes median for even and odd counts', () => {
    expect(stats([3, 1, 2])!.median).toBe(2);
    expect(stats([4, 1, 2, 3])!.median).toBe(2.5);
    expect(stats([])).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { checkPassword, sha256Hex } from './admin';
import { buildCategories, summarize } from './coverage';
import type { OfferRecord } from './types';

const rec = (id: string, url: string | undefined, tracks: OfferRecord['tracks'], origin: OfferRecord['origin'] = 'repo'): OfferRecord => ({
  id,
  source: { kind: 'forum_post', channel: id.startsWith('s') ? 'ספונסר' : 'תפוז', url, postedAt: '2026-09-01', collectedAt: '2026-09-02', quote: 'q' },
  stage: 'initial',
  tracks,
  origin,
});

const records = [
  rec('s1', 'https://a/1', [
    { type: 'prime', termYears: 30, primeMargin: -0.6 },
    { type: 'fixed_unlinked', termYears: 20, rate: 4.8 },
  ]),
  rec('s2', 'https://a/1', [{ type: 'fixed_unlinked', termYears: 18, rate: 4.9 }]),
  rec('t1', undefined, [{ type: 'variable_linked', termYears: 25, rate: 3.5, changeEveryYears: 5 }]),
  rec('d1', 'https://demo', [{ type: 'fixed_unlinked', termYears: 20, rate: 1 }], 'demo'),
];

describe('buildCategories', () => {
  it('groups real tracks by type and term bucket, excluding demo', () => {
    const cats = buildCategories(records, 5.25);
    const kal = cats.find((c) => c.type === 'fixed_unlinked')!;
    expect(kal.bucket).toEqual([16, 20]);
    expect(kal.entries.map((e) => e.record.id)).toEqual(['s1', 's2']);
    expect(cats.map((c) => c.type)).toEqual(['prime', 'fixed_unlinked', 'variable_linked']);
    expect(cats.find((c) => c.type === 'variable_linked')!.changeEveryYears).toBe(5);
  });
});

describe('summarize', () => {
  it('counts real records, missing links and duplicate links', () => {
    const s = summarize(records);
    expect(s.realRecords).toBe(3);
    expect(s.realTracks).toBe(4);
    expect(s.withUrl).toBe(2);
    expect(s.withoutUrl.map((r) => r.id)).toEqual(['t1']);
    expect(s.duplicateUrls).toEqual(['https://a/1']);
    expect(s.byChannel).toEqual([
      { channel: 'ספונסר', count: 2 },
      { channel: 'תפוז', count: 1 },
    ]);
  });
});

describe('admin password', () => {
  it('matches only the configured hash', async () => {
    const hash = await sha256Hex('secret');
    expect(hash).toBe('2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b');
    expect(await checkPassword('secret', hash)).toBe(true);
    expect(await checkPassword('wrong', hash)).toBe(false);
    expect(await checkPassword('secret', '')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { importPayload } from './import-inbox.mjs';

const rec = (id, url, offerDate = '2026-09-20') => ({
  id,
  source: { kind: 'facebook_post', channel: 'קבוצה', url, postedAt: '2026-09-20', collectedAt: '2026-09-30', quote: 'q' },
  offerDate,
  offerDateBasis: offerDate === '2026-09-20' ? 'post_date' : 'stated',
  stage: 'initial',
  tracks: [{ type: 'prime', termYears: 30, primeMargin: -0.6 }],
});

describe('importPayload', () => {
  const existing = [rec('old', 'https://fb/1')];

  it('appends valid records and never touches existing ones', () => {
    const r = importPayload(existing, { records: [rec('new', 'https://fb/2')] }, '2026-09-30');
    expect(r.records.map((x) => x.id)).toEqual(['old', 'new']);
    expect(r.records[0]).toBe(existing[0]);
    expect(r.run.added).toEqual(['new']);
  });

  it('rejects invalid, stale and duplicate records with a reason', () => {
    const r = importPayload(
      existing,
      { records: [rec('dup-url', 'https://fb/1'), rec('old', 'https://fb/3'), rec('stale', 'https://fb/4', '2025-09-01'), { id: 'broken' }] },
      '2026-09-30',
    );
    expect(r.added).toHaveLength(0);
    expect(r.run.rejected).toHaveLength(4);
    expect(r.run.rejected.map((x) => x.reason).join(' ')).toMatch(/קיים/);
    expect(r.run.rejected.map((x) => x.reason).join(' ')).toMatch(/120/);
  });

  it('fills collectedAt when the task left it out', () => {
    const noDate = rec('n', 'https://fb/5');
    delete noDate.source.collectedAt;
    const r = importPayload([], { records: [noDate] }, '2026-09-30');
    expect(r.records[0].source.collectedAt).toBe('2026-09-30');
  });
});

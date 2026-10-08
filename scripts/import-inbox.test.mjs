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

  it("keeps a late run's own date, but never a future or malformed one", () => {
    const at = (runDate) => importPayload([], { records: [], run: { runDate } }, '2026-10-09').run.runDate;
    expect(at('2026-10-01')).toBe('2026-10-01');
    expect(at('2026-10-20')).toBe('2026-10-09');
    expect(at('01/10/2026')).toBe('2026-10-09');
    expect(at(undefined)).toBe('2026-10-09');
  });

  it('passes the needsReview flag through and still validates it', () => {
    const flagged = { ...rec('rev', 'https://fb/5'), needsReview: { reason: 'לא ברור שזו הצעת בנק', since: '2026-09-30' } };
    const broken = { ...rec('bad', 'https://fb/6'), needsReview: { reason: '' } };
    const r = importPayload([], { records: [flagged, broken] }, '2026-09-30');
    expect(r.added.map((x) => x.id)).toEqual(['rev']);
    expect(r.added[0].needsReview.reason).toMatch(/הצעת בנק/);
    expect(r.run.rejected[0].reason).toMatch(/needsReview/);
  });

  it('treats links that differ only by a trailing slash or query as the same post', () => {
    const base = [rec('old', 'https://www.facebook.com/groups/1/posts/2/')];
    const r = importPayload(
      base,
      { records: [rec('a', 'https://www.facebook.com/groups/1/posts/2'), rec('b', 'https://www.facebook.com/groups/1/posts/2/?ref=x'), rec('c', 'https://www.facebook.com/groups/1/posts/3')] },
      '2026-09-30',
    );
    expect(r.added.map((x) => x.id)).toEqual(['c']);
    expect(r.run.rejected.map((x) => x.reason)).toEqual(['הפוסט כבר קיים במאגר', 'הפוסט כבר קיים במאגר']);
  });

  it('keeps offers from different banks in the same post, but not the same bank twice', () => {
    const at = (id, bank) => ({ ...rec(id, 'https://fb/multi'), bank });
    const r = importPayload([at('leumi', 'לאומי')], { records: [at('mizrahi', 'מזרחי טפחות'), at('leumi-again', 'לאומי')] }, '2026-09-30');
    expect(r.added.map((x) => x.id)).toEqual(['mizrahi']);
    expect(r.run.rejected.map((x) => x.reason)).toEqual(['הפוסט כבר קיים במאגר']);
  });
});

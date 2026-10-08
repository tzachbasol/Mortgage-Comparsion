import { describe, expect, it } from 'vitest';
import { validateRecord } from './validate';
import records from '../../public/data/records.json';

const good = {
  id: 'x',
  source: { kind: 'facebook_post', channel: 'קבוצה', postedAt: '2026-09-01', collectedAt: '2026-09-02', url: 'https://example.com' },
  offerDate: '2026-09-01',
  offerDateBasis: 'post_date',
  stage: 'initial',
  tracks: [{ type: 'prime', termYears: 30, primeMargin: -0.5 }],
};
const withSource = (patch: object) => ({ ...good, source: { ...good.source, ...patch } });

describe('validateRecord', () => {
  it('accepts a needsReview flag only with a reason and date', () => {
    expect(validateRecord({ ...good, needsReview: { reason: 'לא נאמר שזו הצעת בנק', since: '2026-09-02' } })).toBeNull();
    expect(validateRecord({ ...good, needsReview: { reason: ' ', since: '2026-09-02' } })).toMatch(/needsReview/);
    expect(validateRecord({ ...good, needsReview: { reason: 'x' } })).toMatch(/needsReview/);
  });
  it('accepts a well-formed record', () => {
    expect(validateRecord(good)).toBeNull();
  });
  it('rejects records with no traceable source', () => {
    expect(validateRecord(withSource({ url: undefined }))).toMatch(/קישור/);
  });
  it('rejects demo records', () => {
    expect(validateRecord(withSource({ kind: 'demo' }))).not.toBeNull();
  });
  it('requires an offer date and its basis', () => {
    expect(validateRecord({ ...good, offerDate: undefined })).toMatch(/offerDate/);
    expect(validateRecord({ ...good, offerDateBasis: undefined })).toMatch(/offerDateBasis/);
  });
  it('accepts an offer given exactly 120 days before collection', () => {
    const r = { ...good, offerDate: '2026-05-05', offerDateBasis: 'stated', source: { ...good.source, postedAt: '2026-09-01' } };
    expect(validateRecord(r)).toBeNull();
  });
  it('rejects an offer older than 120 days even when the post is fresh', () => {
    const r = { ...good, offerDate: '2025-09-01', offerDateBasis: 'stated' };
    expect(validateRecord(r)).toMatch(/120/);
  });
  it('rejects a post-date offer whose date differs from the post date', () => {
    expect(validateRecord({ ...good, offerDate: '2026-08-20' })).toMatch(/post_date/);
  });
  it('rejects an offer dated after the post', () => {
    expect(validateRecord({ ...good, offerDate: '2026-09-02', offerDateBasis: 'stated' })).not.toBeNull();
  });
  it('keeps old records valid forever: the window is relative to collectedAt, not today', () => {
    const r = { ...good, offerDate: '2024-01-01', source: { ...good.source, postedAt: '2024-01-01', collectedAt: '2024-01-10' } };
    expect(validateRecord(r)).toBeNull();
  });
  it('rejects a post dated after its collection', () => {
    expect(validateRecord(withSource({ postedAt: '2026-09-03' }))).not.toBeNull();
  });
  it('keeps excluded records valid when they carry a reason, even outside the window', () => {
    const old = { ...good, offerDate: '2025-09-01', offerDateBasis: 'stated' };
    expect(validateRecord({ ...old, excluded: { reason: 'ישנה', since: '2026-09-30' } })).toBeNull();
    expect(validateRecord({ ...old, excluded: { reason: '', since: '2026-09-30' } })).toMatch(/excluded/);
  });
  it('every committed record in public/data/records.json is valid', () => {
    for (const r of records as unknown[]) expect(validateRecord(r)).toBeNull();
  });
});

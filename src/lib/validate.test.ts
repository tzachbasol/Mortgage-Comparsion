import { describe, expect, it } from 'vitest';
import { validateRecord } from './validate';
import records from '../../public/data/records.json';

const good = {
  id: 'x',
  source: { kind: 'facebook_post', channel: 'קבוצה', postedAt: '2026-09-01', collectedAt: '2026-09-02', url: 'https://example.com' },
  stage: 'initial',
  tracks: [{ type: 'prime', termYears: 30, primeMargin: -0.5 }],
};

describe('validateRecord', () => {
  it('accepts a well-formed record', () => {
    expect(validateRecord(good)).toBeNull();
  });
  it('rejects records with no traceable source', () => {
    expect(validateRecord({ ...good, source: { ...good.source, url: undefined } })).toMatch(/קישור/);
  });
  it('rejects demo records', () => {
    expect(validateRecord({ ...good, source: { ...good.source, kind: 'demo' } })).not.toBeNull();
  });
  it('accepts a post published exactly 60 days before collection', () => {
    expect(validateRecord({ ...good, source: { ...good.source, postedAt: '2026-07-04', collectedAt: '2026-09-02' } })).toBeNull();
  });
  it('rejects posts older than 60 days at collection time', () => {
    expect(validateRecord({ ...good, source: { ...good.source, postedAt: '2026-07-03', collectedAt: '2026-09-02' } })).toMatch(/60/);
  });
  it('keeps old records valid forever: the window is relative to collectedAt, not today', () => {
    expect(validateRecord({ ...good, source: { ...good.source, postedAt: '2024-01-01', collectedAt: '2024-01-10' } })).toBeNull();
  });
  it('rejects a post dated after its collection', () => {
    expect(validateRecord({ ...good, source: { ...good.source, postedAt: '2026-09-03' } })).not.toBeNull();
  });
  it('every committed record in public/data/records.json is valid', () => {
    for (const r of records as unknown[]) expect(validateRecord(r)).toBeNull();
  });
});

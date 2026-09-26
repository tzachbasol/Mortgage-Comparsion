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
  it('every committed record in public/data/records.json is valid', () => {
    for (const r of records as unknown[]) expect(validateRecord(r)).toBeNull();
  });
});

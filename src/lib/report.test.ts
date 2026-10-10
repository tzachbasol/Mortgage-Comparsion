import { describe, expect, it } from 'vitest';
import { buildAlerts, categoryMedians, groupRuns, medianHistory, type RunLog } from './report';
import type { OfferRecord } from './types';

const web = (runDate: string, patch: Partial<RunLog> = {}): RunLog => ({
  runDate,
  windowStart: '2026-06-10',
  status: 'partial',
  sources: [
    { name: 'הסולידית', status: 'ok', postsScanned: 3, offersFound: 0 },
    { name: 'FXP', status: 'blocked', postsScanned: 0, offersFound: 0 },
    { name: 'פייסבוק – קבוצות', status: 'blocked', postsScanned: 0, offersFound: 0 },
  ],
  added: [],
  rejected: [{ url: 'https://forum/1', reason: 'שאלה כללית' }],
  prUrl: `https://github.com/x/tree/collect/${runDate}`,
  notes: 'לא נמצאו הצעות',
  ...patch,
});

const facebook = (runDate: string): RunLog => ({
  runDate,
  status: 'ok',
  sources: [{ name: 'קבוצת משכנתאות', status: 'ok', postsScanned: 25, offersFound: 2 }],
  added: ['fb-2026-10-01-aaaa', 'fb-2026-10-02-bbbb'],
  rejected: [{ url: 'https://fb/9', reason: 'ישנה' }],
  notes: 'נאסף ב-Claude in Chrome',
});

const record = (id: string, offerDate: string, collectedAt: string, patch: Partial<OfferRecord> = {}): OfferRecord => ({
  id,
  source: { kind: 'facebook_post', channel: 'קבוצה', postedAt: offerDate, collectedAt, url: `https://fb/${id}` },
  offerDate,
  offerDateBasis: 'post_date',
  stage: 'initial',
  tracks: [{ type: 'prime', termYears: 30, primeMargin: -0.6 }],
  ...patch,
});

describe('groupRuns', () => {
  it('merges the web and Facebook logs of one day, newest day first', () => {
    const days = groupRuns([web('2026-10-07'), web('2026-10-08'), facebook('2026-10-08')]);
    expect(days.map((d) => d.runDate)).toEqual(['2026-10-08', '2026-10-07']);
    const today = days[0];
    expect(today.collectors.sort()).toEqual(['facebook', 'web']);
    expect(today.added).toHaveLength(2);
    expect(today.rejected.map((r) => r.collector).sort()).toEqual(['facebook', 'web']);
    expect(today.status).toBe('partial');
    expect(today.notes.map((n) => n.collector).sort()).toEqual(['facebook', 'web']);
  });

  it("drops the web routine's blocked Facebook placeholder only when the Facebook task ran", () => {
    const [withFb] = groupRuns([web('2026-10-08'), facebook('2026-10-08')]);
    expect(withFb.sources.map((s) => s.name)).not.toContain('פייסבוק – קבוצות');
    const [webOnly] = groupRuns([web('2026-10-08')]);
    expect(webOnly.sources.map((s) => s.name)).toContain('פייסבוק – קבוצות');
  });
});

describe('categoryMedians', () => {
  it('uses only usable records known by the date, and reports the change from the previous run', () => {
    const records = [
      record('a', '2026-09-01', '2026-09-02'),
      record('b', '2026-10-01', '2026-10-08', { tracks: [{ type: 'prime', termYears: 28, primeMargin: -0.8 }] }),
      record('c', '2026-10-01', '2026-10-08', { needsReview: { reason: 'לא ברור שזו הצעת בנק', since: '2026-10-08' } }),
      record('d', '2026-10-01', '2026-10-08', { excluded: { reason: 'x', since: '2026-10-08' } }),
    ];
    const [prime] = categoryMedians(records, '2026-10-08', '2026-10-07', 5);
    expect(prime.count).toBe(2);
    expect(prime.median).toBeCloseTo(-0.7);
    expect(prime.previous).toBeCloseTo(-0.6);
  });

  it('leaves out offers older than the 120-day window', () => {
    expect(categoryMedians([record('old', '2026-05-01', '2026-05-02')], '2026-10-08', undefined, 5)).toEqual([]);
  });
});

describe('buildAlerts', () => {
  const texts = (a: { text: string }[]) => a.map((x) => x.text).join('\n');

  it('is quiet when both collectors ran recently and nothing is pending', () => {
    const days = groupRuns([web('2026-10-08', { sources: [{ name: 'הסולידית', status: 'ok' }] }), facebook('2026-10-08')]);
    expect(buildAlerts(days, [], '2026-10-09')).toEqual([]);
  });

  it('flags missing runs, a stale Facebook collection, failing sources and pending reviews', () => {
    const days = groupRuns([web('2026-10-03'), web('2026-10-04'), web('2026-10-05'), facebook('2026-10-01')]);
    const pending = [record('p', '2026-10-01', '2026-10-01', { needsReview: { reason: 'r', since: '2026-10-01' } })];
    const out = texts(buildAlerts(days, pending, '2026-10-09'));
    expect(out).toMatch(/אין ריצת איסוף 4 ימים/);
    expect(out).toMatch(/פייסבוק לא רץ 8 ימים/);
    expect(out).toMatch(/"FXP"/);
    expect(out).not.toMatch(/"הסולידית"/);
    expect(out).toMatch(/1 רשומות ממתינות/);
  });

  it('does not flag a source whose failure streak was broken by a success', () => {
    const ok = (d: string) => web(d, { sources: [{ name: 'FXP', status: 'ok' }] });
    const days = groupRuns([web('2026-10-07'), web('2026-10-08'), ok('2026-10-06'), web('2026-10-05')]);
    expect(texts(buildAlerts(days, [], '2026-10-08'))).not.toMatch(/"FXP"/);
  });

  it('flags Facebook groups that were barely scanned on the latest run', () => {
    const thin: RunLog = { ...facebook('2026-10-08'), sources: [
      { name: 'קבוצה א', status: 'ok', postsScanned: 4, offersFound: 0 },
      { name: 'קבוצה ב', status: 'ok', postsScanned: 30, offersFound: 1 },
    ] };
    const out = texts(buildAlerts(groupRuns([web('2026-10-08'), thin]), [], '2026-10-08'));
    expect(out).toMatch(/כיסוי נמוך בפייסבוק: ב־1 מתוך 2 קבוצות/);
    expect(out).toMatch(/סה"כ 34 פוסטים/);
    expect(texts(buildAlerts(groupRuns([web('2026-10-08'), facebook('2026-10-08')]), [], '2026-10-08'))).not.toMatch(/כיסוי נמוך/);
  });

  it('reports a blocked latest run with its reason', () => {
    const days = groupRuns([web('2026-10-08', { status: 'blocked', notes: 'אין הרשאת push' })]);
    expect(texts(buildAlerts(days, [], '2026-10-08'))).toMatch(/נחסמה או נכשלה: אין הרשאת push/);
  });
});

describe('medianHistory', () => {
  it('tracks the median of well-covered categories across run days, oldest first', () => {
    const records = [
      record('a', '2026-09-01', '2026-09-02'),
      record('b', '2026-09-01', '2026-09-02', { tracks: [{ type: 'prime', termYears: 30, primeMargin: -0.8 }] }),
      record('c', '2026-10-01', '2026-10-08', { tracks: [{ type: 'prime', termYears: 30, primeMargin: -1.0 }] }),
      record('f', '2026-10-01', '2026-10-08', { tracks: [{ type: 'fixed_unlinked', termYears: 20, rate: 4.5 }] }),
    ];
    const [prime, ...rest] = medianHistory(records, ['2026-10-08', '2026-09-30', '2026-10-08'], 5);
    expect(rest).toEqual([]);
    expect(prime.points.map((p) => p.date)).toEqual(['2026-09-30', '2026-10-08']);
    expect(prime.points[0].median).toBeCloseTo(-0.7);
    expect(prime.points[1].median).toBeCloseTo(-0.8);
    expect(prime.points.map((p) => p.count)).toEqual([2, 3]);
  });
});

import { trackValue } from './match';
import type { MixTrack, OfferRecord, RecordTrack, SourceKind, TrackType } from './types';
import { VARIABLE_TRACKS } from './types';

export const TERM_BUCKETS: [number, number][] = [
  [1, 10],
  [11, 15],
  [16, 20],
  [21, 25],
  [26, 35],
];

export interface CoverageEntry {
  record: OfferRecord;
  track: RecordTrack;
  value: number;
}

export interface CoverageCategory {
  key: string;
  type: TrackType;
  bucket: [number, number];
  changeEveryYears?: number;
  entries: CoverageEntry[];
}

export interface CoverageSummary {
  realRecords: number;
  realTracks: number;
  withUrl: number;
  withScreenshot: number;
  withoutUrl: OfferRecord[];
  duplicateUrls: string[];
  excluded: OfferRecord[];
  needsReview: OfferRecord[];
  byKind: Partial<Record<SourceKind, number>>;
  byChannel: { channel: string; count: number }[];
}

export const isReal = (r: OfferRecord) => r.origin !== 'demo' && r.source.kind !== 'demo' && !r.excluded;
/** Real records that may feed rates and medians: borderline records wait for the owner's review. */
export const isUsable = (r: OfferRecord) => isReal(r) && !r.needsReview;

const bucketOf = (years: number) => TERM_BUCKETS.find(([lo, hi]) => years >= lo && years <= hi) ?? TERM_BUCKETS[TERM_BUCKETS.length - 1];

/** Groups every track of every real record into (type × term bucket × reset period) categories. */
export function buildCategories(records: OfferRecord[], primeRate: number): CoverageCategory[] {
  const map = new Map<string, CoverageCategory>();
  for (const record of records.filter(isUsable)) {
    for (const track of record.tracks) {
      const value = trackValue(track, primeRate);
      if (value === undefined) continue;
      const bucket = bucketOf(track.termYears);
      const change = VARIABLE_TRACKS.has(track.type) ? track.changeEveryYears : undefined;
      const key = `${track.type}|${bucket[0]}-${bucket[1]}|${change ?? ''}`;
      let cat = map.get(key);
      if (!cat) {
        cat = { key, type: track.type, bucket, changeEveryYears: change, entries: [] };
        map.set(key, cat);
      }
      cat.entries.push({ record, track, value });
    }
  }
  const order = (t: TrackType) => ['prime', 'fixed_unlinked', 'fixed_linked', 'variable_unlinked', 'variable_linked'].indexOf(t);
  return [...map.values()].sort(
    (a, b) => order(a.type) - order(b.type) || a.bucket[0] - b.bucket[0] || (a.changeEveryYears ?? 0) - (b.changeEveryYears ?? 0),
  );
}

export function summarize(records: OfferRecord[]): CoverageSummary {
  const real = records.filter(isReal);
  const urlCount = new Map<string, number>();
  const byKind: Partial<Record<SourceKind, number>> = {};
  const channels = new Map<string, number>();
  for (const r of real) {
    if (r.source.url) urlCount.set(r.source.url, (urlCount.get(r.source.url) ?? 0) + 1);
    byKind[r.source.kind] = (byKind[r.source.kind] ?? 0) + 1;
    channels.set(r.source.channel, (channels.get(r.source.channel) ?? 0) + 1);
  }
  return {
    realRecords: real.length,
    realTracks: real.reduce((s, r) => s + r.tracks.length, 0),
    withUrl: real.filter((r) => r.source.url).length,
    withScreenshot: real.filter((r) => r.source.screenshot).length,
    withoutUrl: real.filter((r) => !r.source.url),
    excluded: records.filter((r) => r.excluded),
    needsReview: real.filter((r) => r.needsReview),
    duplicateUrls: [...urlCount].filter(([, n]) => n > 1).map(([u]) => u),
    byKind,
    byChannel: [...channels].map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count),
  };
}

export const describeTrack = (t: Pick<MixTrack, 'termYears' | 'changeEveryYears'>) =>
  `${t.termYears} שנים${t.changeEveryYears ? `, משתנה כל ${t.changeEveryYears}` : ''}`;

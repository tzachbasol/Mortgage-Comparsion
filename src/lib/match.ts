import { offerDateOf, type MatchSettings, type MixTrack, type OfferRecord, type RecordTrack } from './types';

export interface Match {
  record: OfferRecord;
  track: RecordTrack;
  /** Prime: margin; other tracks: total rate. */
  value: number;
  termDistance: number;
}

export interface MatchStats {
  count: number;
  median: number;
  mean: number;
  min: number;
  max: number;
}

function monthsBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/** The number a record track contributes: margin for prime, total rate otherwise. */
export function trackValue(t: RecordTrack, primeRate: number): number | undefined {
  if (t.type === 'prime') {
    if (t.primeMargin !== undefined) return t.primeMargin;
    // A published total prime rate can only be turned into a margin against the prime of that day,
    // which we don't know reliably, so fall back to today's prime.
    if (t.rate !== undefined) return t.rate - primeRate;
    return undefined;
  }
  return t.rate;
}

/** Finds every record track that is comparable to the requested mix track. */
export function findMatches(
  target: Pick<MixTrack, 'type' | 'termYears' | 'changeEveryYears'>,
  records: OfferRecord[],
  settings: MatchSettings,
  primeRate: number,
  now: Date = new Date(),
): Match[] {
  const matches: Match[] = [];
  for (const record of records) {
    if (record.excluded || record.needsReview) continue;
    if (record.origin === 'demo' && !settings.includeDemo) continue;
    if (settings.bank && record.bank !== settings.bank) continue;
    if (settings.stages.length && !settings.stages.includes(record.stage)) continue;
    if (settings.maxAgeMonths > 0 && monthsBetween(offerDateOf(record), now) > settings.maxAgeMonths) continue;
    for (const track of record.tracks) {
      if (track.type !== target.type || track.balloon) continue;
      if (
        target.changeEveryYears !== undefined &&
        track.changeEveryYears !== undefined &&
        track.changeEveryYears !== target.changeEveryYears
      ) {
        continue;
      }
      const termDistance = Math.abs(track.termYears - target.termYears);
      if (termDistance > settings.termToleranceYears) continue;
      const value = trackValue(track, primeRate);
      if (value === undefined || Number.isNaN(value)) continue;
      matches.push({ record, track, value, termDistance });
    }
  }
  return matches.sort(
    (a, b) => a.termDistance - b.termDistance || offerDateOf(b.record).localeCompare(offerDateOf(a.record)),
  );
}

export function stats(values: number[]): MatchStats | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    count: sorted.length,
    median,
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

import { amortize, sumResults, type AmortizationResult, type MixTotals } from './calc';
import { findMatches, stats, type Match, type MatchStats } from './match';
import type { EconomicAssumptions, MatchSettings, MixTrack, OfferRecord } from './types';

export type RateSource = 'records' | 'manual' | 'none';

export interface EvaluatedTrack {
  track: MixTrack;
  matches: Match[];
  stats?: MatchStats;
  /** Prime: margin; others: total rate – the value that was actually used. */
  usedValue?: number;
  /** Total annual rate in percent used for the calculation. */
  totalRate?: number;
  rateSource: RateSource;
  result: AmortizationResult;
}

export interface EvaluatedMix {
  tracks: EvaluatedTrack[];
  totals: MixTotals;
  missingRates: number;
}

export function evaluateMix(
  mix: MixTrack[],
  records: OfferRecord[],
  settings: MatchSettings,
  assumptions: EconomicAssumptions,
): EvaluatedMix {
  const tracks = mix.map((track): EvaluatedTrack => {
    const matches = findMatches(track, records, settings, assumptions.primeRate);
    const s = stats(matches.map((m) => m.value));
    let usedValue: number | undefined;
    let rateSource: RateSource = 'none';
    if (track.manualRate !== undefined) {
      usedValue = track.manualRate;
      rateSource = 'manual';
    } else if (s) {
      usedValue = s.median;
      rateSource = 'records';
    }
    const totalRate =
      usedValue === undefined ? undefined : track.type === 'prime' ? assumptions.primeRate + usedValue : usedValue;
    const result =
      totalRate === undefined
        ? { firstPayment: 0, maxPayment: 0, totalPaid: 0, totalInterestAndIndexation: 0 }
        : amortize(track.amount, totalRate, track.termYears * 12, track.type, assumptions.inflation);
    return { track, matches, stats: s, usedValue, totalRate, rateSource, result };
  });
  const priced = tracks.filter((t) => t.totalRate !== undefined);
  return {
    tracks,
    totals: sumResults(priced.map((t) => ({ principal: t.track.amount, rate: t.totalRate!, result: t.result }))),
    missingRates: tracks.length - priced.length,
  };
}

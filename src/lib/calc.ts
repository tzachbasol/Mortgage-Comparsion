import { LINKED_TRACKS, type TrackType } from './types';

export interface AmortizationResult {
  firstPayment: number;
  maxPayment: number;
  totalPaid: number;
  totalInterestAndIndexation: number;
}

/** Standard annuity (שפיצר) monthly payment. */
export function annuityPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * Simulates a שפיצר loan month by month. For CPI-linked tracks the balance is indexed
 * every month by the assumed inflation and the payment is recalculated, which is how
 * Israeli banks compute linked loans. The rate is assumed to stay constant.
 */
export function amortize(
  principal: number,
  annualRatePct: number,
  months: number,
  type: TrackType,
  annualInflationPct: number,
): AmortizationResult {
  if (principal <= 0 || months <= 0) {
    return { firstPayment: 0, maxPayment: 0, totalPaid: 0, totalInterestAndIndexation: 0 };
  }
  const linked = LINKED_TRACKS.has(type);
  const monthlyIndex = linked ? Math.pow(1 + annualInflationPct / 100, 1 / 12) - 1 : 0;
  const r = annualRatePct / 100 / 12;
  let balance = principal;
  let totalPaid = 0;
  let firstPayment = 0;
  let maxPayment = 0;
  for (let m = 0; m < months; m++) {
    balance *= 1 + monthlyIndex;
    const payment = annuityPayment(balance, annualRatePct, months - m);
    const interest = balance * r;
    balance -= payment - interest;
    totalPaid += payment;
    if (m === 0) firstPayment = payment;
    if (payment > maxPayment) maxPayment = payment;
  }
  return {
    firstPayment,
    maxPayment,
    totalPaid,
    totalInterestAndIndexation: totalPaid - principal,
  };
}

export interface MixTotals extends AmortizationResult {
  principal: number;
  /** Payment-weighted average rate, in percent. */
  weightedRate: number;
}

export function sumResults(items: { principal: number; rate: number; result: AmortizationResult }[]): MixTotals {
  const principal = items.reduce((s, i) => s + i.principal, 0);
  return {
    principal,
    firstPayment: items.reduce((s, i) => s + i.result.firstPayment, 0),
    maxPayment: items.reduce((s, i) => s + i.result.maxPayment, 0),
    totalPaid: items.reduce((s, i) => s + i.result.totalPaid, 0),
    totalInterestAndIndexation: items.reduce((s, i) => s + i.result.totalInterestAndIndexation, 0),
    weightedRate: principal > 0 ? items.reduce((s, i) => s + i.rate * i.principal, 0) / principal : 0,
  };
}

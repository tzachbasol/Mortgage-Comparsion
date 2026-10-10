import { LINKED_TRACKS, type RepaymentMethod, type TrackType } from './types';

export interface AmortizationResult {
  firstPayment: number;
  maxPayment: number;
  totalPaid: number;
  totalInterestAndIndexation: number;
  /** Interest paid over the life of the loan. */
  totalInterest: number;
  /** CPI indexation added to the balance (linked tracks only). */
  totalIndexation: number;
}

export const EMPTY_RESULT: AmortizationResult = {
  firstPayment: 0,
  maxPayment: 0,
  totalPaid: 0,
  totalInterestAndIndexation: 0,
  totalInterest: 0,
  totalIndexation: 0,
};

/** Standard annuity (שפיצר) monthly payment. */
export function annuityPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * Simulates a loan month by month, as שפיצר (equal payments) or קרן שווה (equal principal).
 * For CPI-linked tracks the balance is indexed every month by the assumed inflation and the
 * payment is recalculated, which is how Israeli banks compute linked loans. The rate is
 * assumed to stay constant.
 */
export function amortize(
  principal: number,
  annualRatePct: number,
  months: number,
  type: TrackType,
  annualInflationPct: number,
  method: RepaymentMethod = 'spitzer',
): AmortizationResult {
  if (principal <= 0 || months <= 0) return { ...EMPTY_RESULT };
  const linked = LINKED_TRACKS.has(type);
  const monthlyIndex = linked ? Math.pow(1 + annualInflationPct / 100, 1 / 12) - 1 : 0;
  const r = annualRatePct / 100 / 12;
  const whole = Math.max(1, Math.round(months));
  let balance = principal;
  let totalPaid = 0;
  let totalInterest = 0;
  let totalIndexation = 0;
  let firstPayment = 0;
  let maxPayment = 0;
  for (let m = 0; m < whole; m++) {
    const indexation = balance * monthlyIndex;
    balance += indexation;
    totalIndexation += indexation;
    const interest = balance * r;
    const payment = method === 'equal_principal' ? balance / (whole - m) + interest : annuityPayment(balance, annualRatePct, whole - m);
    balance -= payment - interest;
    totalPaid += payment;
    totalInterest += interest;
    if (m === 0) firstPayment = payment;
    if (payment > maxPayment) maxPayment = payment;
  }
  return {
    firstPayment,
    maxPayment,
    totalPaid,
    totalInterestAndIndexation: totalPaid - principal,
    totalInterest,
    totalIndexation,
  };
}

export interface MixTotals extends AmortizationResult {
  principal: number;
  /** Payment-weighted average rate, in percent. */
  weightedRate: number;
}

export function sumResults(items: { principal: number; rate: number; result: AmortizationResult }[]): MixTotals {
  const principal = items.reduce((s, i) => s + i.principal, 0);
  const sum = (k: keyof AmortizationResult) => items.reduce((s, i) => s + i.result[k], 0);
  return {
    principal,
    firstPayment: sum('firstPayment'),
    maxPayment: sum('maxPayment'),
    totalPaid: sum('totalPaid'),
    totalInterestAndIndexation: sum('totalInterestAndIndexation'),
    totalInterest: sum('totalInterest'),
    totalIndexation: sum('totalIndexation'),
    weightedRate: principal > 0 ? items.reduce((s, i) => s + i.rate * i.principal, 0) / principal : 0,
  };
}

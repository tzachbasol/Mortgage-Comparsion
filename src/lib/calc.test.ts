import { describe, expect, it } from 'vitest';
import { amortize, annuityPayment } from './calc';

describe('annuityPayment', () => {
  it('matches the standard Spitzer formula', () => {
    // 1,000,000 ₪ at 5% for 30 years ≈ 5,368 ₪/month
    expect(annuityPayment(1_000_000, 5, 360)).toBeCloseTo(5368.22, 1);
  });
  it('handles zero rate', () => {
    expect(annuityPayment(120_000, 0, 120)).toBe(1000);
  });
});

describe('amortize', () => {
  it('unlinked loan pays a constant payment', () => {
    const r = amortize(1_000_000, 5, 360, 'fixed_unlinked', 3);
    expect(r.firstPayment).toBeCloseTo(r.maxPayment, 6);
    expect(r.totalPaid).toBeCloseTo(5368.22 * 360, -2);
  });
  it('linked loan payment grows with inflation', () => {
    const r = amortize(1_000_000, 3, 240, 'fixed_linked', 2.5);
    expect(r.maxPayment).toBeGreaterThan(r.firstPayment);
    const unlinked = amortize(1_000_000, 3, 240, 'fixed_unlinked', 2.5);
    expect(r.totalPaid).toBeGreaterThan(unlinked.totalPaid);
  });
  it('linked loan with zero inflation equals unlinked', () => {
    const a = amortize(500_000, 4, 180, 'fixed_linked', 0);
    const b = amortize(500_000, 4, 180, 'fixed_unlinked', 0);
    expect(a.totalPaid).toBeCloseTo(b.totalPaid, 4);
  });
});

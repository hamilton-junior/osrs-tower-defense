import { describe, it, expect } from 'vitest';
import { softCapMult, DAMAGE_MULT_CEILING } from './run-modifiers';

describe('softCapMult', () => {
  it('is identity at 1 (no cards → no change)', () => {
    expect(softCapMult(1)).toBe(1);
  });

  it('passes penalties (<1) through untouched', () => {
    expect(softCapMult(0.7)).toBe(0.7);
  });

  it('gives early stacks nearly full value (first-unit ≈ full)', () => {
    // A single +20% card lands within 2% of its raw value.
    expect(softCapMult(1.2)).toBeGreaterThan(1.18);
    expect(softCapMult(1.2)).toBeLessThanOrEqual(1.2);
  });

  it('caps the upside below the raw product for large stacks', () => {
    expect(softCapMult(20)).toBeLessThan(20);
  });

  it('is strictly increasing', () => {
    expect(softCapMult(5)).toBeGreaterThan(softCapMult(3));
    expect(softCapMult(3)).toBeGreaterThan(softCapMult(1.5));
  });

  it('is concave (each further unit adds less)', () => {
    const d1 = softCapMult(2) - softCapMult(1);
    const d2 = softCapMult(3) - softCapMult(2);
    expect(d2).toBeLessThan(d1);
  });

  it('approaches the ceiling from below without overshooting it', () => {
    // Well up the curve but before the exponential underflows to a flat 8: still
    // strictly under the ceiling, and already within a hair of it.
    expect(softCapMult(50)).toBeLessThan(DAMAGE_MULT_CEILING);
    expect(softCapMult(50)).toBeGreaterThan(DAMAGE_MULT_CEILING - 0.01);
    // Even a colossal stack never exceeds the ceiling.
    expect(softCapMult(1e9)).toBeLessThanOrEqual(DAMAGE_MULT_CEILING);
  });
});

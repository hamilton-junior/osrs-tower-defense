import { describe, it, expect } from 'vitest';
import { nextPriceMultiplier, MIN_PRICE_MULTIPLIER, MAX_PRICE_MULTIPLIER } from './economy';

const noJitter = () => 0.5; // (0.5 - 0.5) * 0.1 === 0

describe('nextPriceMultiplier', () => {
  it('drops sharply when many were sold', () => {
    expect(nextPriceMultiplier(1.0, 6, noJitter)).toBeCloseTo(0.85);
  });
  it('drops gently on light selling', () => {
    expect(nextPriceMultiplier(1.0, 1, noJitter)).toBeCloseTo(0.95);
  });
  it('drifts up when nothing was sold', () => {
    expect(nextPriceMultiplier(1.0, 0, noJitter)).toBeCloseTo(1.1);
  });
  it('clamps to the floor', () => {
    expect(nextPriceMultiplier(MIN_PRICE_MULTIPLIER, 6, noJitter)).toBe(MIN_PRICE_MULTIPLIER);
  });
  it('clamps to the ceiling', () => {
    expect(nextPriceMultiplier(MAX_PRICE_MULTIPLIER, 0, noJitter)).toBe(MAX_PRICE_MULTIPLIER);
  });
  it('applies the rng jitter', () => {
    // rng=1 -> +0.05 jitter on top of the +0.1 no-sale drift.
    expect(nextPriceMultiplier(1.0, 0, () => 1)).toBeCloseTo(1.15);
  });
});

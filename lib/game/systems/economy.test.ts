import { describe, it, expect } from 'vitest';
import {
  nextPriceMultiplier, nextBuyPriceMultiplier, towerSpamCost, towerSpamBatchCost,
  MIN_PRICE_MULTIPLIER, MAX_PRICE_MULTIPLIER,
} from './economy';

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

describe('nextBuyPriceMultiplier', () => {
  it('rises sharply on heavy demand', () => {
    expect(nextBuyPriceMultiplier(1.0, 6, noJitter)).toBeCloseTo(1.15);
  });
  it('rises gently on light demand', () => {
    expect(nextBuyPriceMultiplier(1.0, 1, noJitter)).toBeCloseTo(1.05);
  });
  it('relaxes toward baseline when idle (above 1.0)', () => {
    // 1.5 + (1 - 1.5)*0.2 = 1.4
    expect(nextBuyPriceMultiplier(1.5, 0, noJitter)).toBeCloseTo(1.4);
  });
  it('rises toward baseline when idle below 1.0', () => {
    // 0.8 + (1 - 0.8)*0.2 = 0.84
    expect(nextBuyPriceMultiplier(0.8, 0, noJitter)).toBeCloseTo(0.84);
  });
  it('holds steady at baseline when idle', () => {
    expect(nextBuyPriceMultiplier(1.0, 0, noJitter)).toBeCloseTo(1.0);
  });
  it('clamps to the ceiling', () => {
    expect(nextBuyPriceMultiplier(MAX_PRICE_MULTIPLIER, 6, noJitter)).toBe(MAX_PRICE_MULTIPLIER);
  });
});

describe('towerSpamCost', () => {
  it('leaves the first tower of a type at its base price', () => {
    expect(towerSpamCost(25, 0)).toBe(25);
  });

  it('escalates with each one already owned', () => {
    // The archer ladder quoted in the doc comment — the numbers the balance
    // decision was actually made on.
    expect(towerSpamCost(25, 4)).toBe(44);
    expect(towerSpamCost(25, 9)).toBe(88);
    expect(towerSpamCost(25, 19)).toBe(356);
  });

  it('never charges less than the base, however the count is passed', () => {
    expect(towerSpamCost(25, -3)).toBe(25);
  });

  it('is strictly increasing, so a wider board never gets a discount', () => {
    for (let n = 0; n < 30; n++) {
      expect(towerSpamCost(100, n + 1)).toBeGreaterThan(towerSpamCost(100, n));
    }
  });
});

describe('towerSpamBatchCost', () => {
  it('charges a batch exactly what placing them one at a time would', () => {
    const base = 40, owned = 3;
    const oneAtATime = towerSpamCost(base, 3) + towerSpamCost(base, 4) + towerSpamCost(base, 5);
    expect(towerSpamBatchCost(base, owned, 3)).toBe(oneAtATime);
  });

  it('costs nothing for an empty batch', () => {
    expect(towerSpamBatchCost(40, 3, 0)).toBe(0);
  });

  it('is dearer per tower than a flat price would be — the point of the change', () => {
    expect(towerSpamBatchCost(25, 10, 5)).toBeGreaterThan(5 * 25);
  });
});

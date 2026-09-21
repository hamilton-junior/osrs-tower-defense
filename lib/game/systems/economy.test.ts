import { describe, it, expect } from 'vitest';
import { towerSpamCost, towerSpamBatchCost } from './economy';

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

import { describe, it, expect } from 'vitest';
import { upgradeOrder, type UpgradeCandidate } from './upgrades';

const t = (id: string, upgradeCost: number, level = 1, maxLevel = 4): UpgradeCandidate =>
  ({ id, upgradeCost, level, maxLevel });

describe('upgradeOrder', () => {
  it('orders upgradeable towers cheapest-first', () => {
    expect(upgradeOrder([t('a', 300), t('b', 100), t('c', 200)])).toEqual(['b', 'c', 'a']);
  });

  it('drops maxed-out towers', () => {
    expect(upgradeOrder([t('a', 100), t('maxed', 50, 4, 4), t('b', 200)])).toEqual(['a', 'b']);
  });

  it('breaks ties by original position (stable)', () => {
    // Same cost → placement order decides.
    expect(upgradeOrder([t('a', 100), t('b', 100), t('c', 100)])).toEqual(['a', 'b', 'c']);
  });

  it('returns [] when nothing is upgradeable', () => {
    expect(upgradeOrder([t('a', 100, 4, 4), t('b', 50, 2, 2)])).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(upgradeOrder([])).toEqual([]);
  });
});

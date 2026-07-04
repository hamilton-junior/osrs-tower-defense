import { describe, it, expect } from 'vitest';
import {
  DEFAULT_UPGRADES,
  GLOBAL_UPGRADE_DEFS,
  essenceForWave,
  purchaseCount,
  nextCost,
  isMaxed,
  steppedValue,
  formatUpgradeValue,
  sanitizeUpgrades,
  spentOn,
  totalEssenceSpent,
  refundValue,
  type UpgradeDef,
} from './meta-progression';

const def = (id: string): UpgradeDef => GLOBAL_UPGRADE_DEFS.find(d => d.id === id)!;

describe('essenceForWave', () => {
  it('scales with the wave (at the 25% cut rate)', () => {
    expect(essenceForWave(1)).toBe(1); // floor((5 + 1.5) * 0.25)
    expect(essenceForWave(10)).toBe(5); // floor(20 * 0.25)
  });
  it('is non-decreasing and never negative', () => {
    expect(essenceForWave(0)).toBe(1); // floor(5 * 0.25)
    expect(essenceForWave(-3)).toBe(1); // clamped
    expect(essenceForWave(20)).toBeGreaterThan(essenceForWave(10));
  });
});

describe('catalog integrity', () => {
  it('every def baseline matches the DEFAULT_UPGRADES entry', () => {
    for (const d of GLOBAL_UPGRADE_DEFS) {
      expect(d.baseline).toBe(DEFAULT_UPGRADES[d.id]);
    }
  });
  it('has unique ids', () => {
    const ids = GLOBAL_UPGRADE_DEFS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('purchaseCount / nextCost (geometric pricing)', () => {
  it('counts purchases from the current value', () => {
    expect(purchaseCount(def('startingMoney'), 0)).toBe(0);
    expect(purchaseCount(def('startingMoney'), 150)).toBe(3);
    expect(purchaseCount(def('archerRange'), 1.5)).toBe(5);
  });
  it('doubles the cost each purchase', () => {
    const d = def('startingMoney');
    expect(nextCost(d, 0)).toBe(50);
    expect(nextCost(d, 50)).toBe(100);
    expect(nextCost(d, 100)).toBe(200);
  });
  it('handles negative-increment upgrades (cost reduction)', () => {
    const d = def('towerCostReduction');
    expect(purchaseCount(d, 1)).toBe(0);
    expect(purchaseCount(d, 0.9)).toBe(2);
    expect(nextCost(d, 0.9)).toBe(1200); // 300 * 2^2
  });
});

describe('isMaxed / steppedValue', () => {
  it('steps toward and clamps at the cap (positive inc)', () => {
    const d = def('archerRange');
    expect(steppedValue(d, 1)).toBeCloseTo(1.1);
    expect(steppedValue(d, 1.95)).toBe(2.0); // clamp, not 2.05
    expect(isMaxed(d, 2.0)).toBe(true);
    expect(isMaxed(d, 1.9)).toBe(false);
  });
  it('steps toward and clamps at the floor (negative inc)', () => {
    const d = def('towerCostReduction');
    expect(steppedValue(d, 1)).toBeCloseTo(0.95);
    expect(steppedValue(d, 0.52)).toBe(0.5); // clamp, not 0.47
    expect(isMaxed(d, 0.5)).toBe(true);
    expect(isMaxed(d, 0.6)).toBe(false);
  });
  it('survives float drift at the cap', () => {
    // ten 0.1 steps land on 1.9999999…; isMaxed must still see it as maxed
    let v = 1;
    for (let i = 0; i < 10; i++) v = steppedValue(def('archerRange'), v);
    expect(isMaxed(def('archerRange'), v)).toBe(true);
  });
});

describe('spentOn / totalEssenceSpent / refundValue', () => {
  it('sums the geometric purchase prices for one upgrade', () => {
    const d = def('startingMoney'); // baseCost 50
    expect(spentOn(d, 0)).toBe(0);    // nothing bought
    expect(spentOn(d, 50)).toBe(50);  // 50
    expect(spentOn(d, 100)).toBe(150); // 50 + 100
    expect(spentOn(d, 150)).toBe(350); // 50 + 100 + 200
  });
  it('totals spend across every upgrade', () => {
    expect(totalEssenceSpent(DEFAULT_UPGRADES)).toBe(0);
    // startingMoney +100 (50+100=150) and archerRange one step (100).
    const ups = { ...DEFAULT_UPGRADES, startingMoney: 100, archerRange: 1.1 };
    expect(totalEssenceSpent(ups)).toBe(150 + 100);
  });
  it('refunds 90% of total spend, floored', () => {
    expect(refundValue(DEFAULT_UPGRADES)).toBe(0);
    const ups = { ...DEFAULT_UPGRADES, startingMoney: 150 }; // spent 350
    expect(refundValue(ups)).toBe(Math.floor(350 * 0.9)); // 315
  });
});

describe('formatUpgradeValue', () => {
  it('renders each format', () => {
    expect(formatUpgradeValue(def('startingMoney'), 250)).toBe('+250 gp');
    expect(formatUpgradeValue(def('archerRange'), 1.3)).toBe('+30%');
    expect(formatUpgradeValue(def('towerCostReduction'), 0.85)).toBe('-15%');
    expect(formatUpgradeValue(def('prayerRegen'), 0.6)).toBe('+0.6/s');
  });
});

describe('sanitizeUpgrades', () => {
  it('returns clean defaults for garbage input', () => {
    expect(sanitizeUpgrades(null)).toEqual(DEFAULT_UPGRADES);
    expect(sanitizeUpgrades('nope')).toEqual(DEFAULT_UPGRADES);
    expect(sanitizeUpgrades(42)).toEqual(DEFAULT_UPGRADES);
  });
  it('merges a partial save onto the defaults', () => {
    const out = sanitizeUpgrades({ archerRange: 1.4 });
    expect(out.archerRange).toBe(1.4);
    expect(out.magicDamage).toBe(1); // untouched default
  });
  it('clamps out-of-range values to the catalog limits', () => {
    expect(sanitizeUpgrades({ archerRange: 99 }).archerRange).toBe(2.0);
    expect(sanitizeUpgrades({ archerRange: -5 }).archerRange).toBe(1.0);
    expect(sanitizeUpgrades({ towerCostReduction: 0.1 }).towerCostReduction).toBe(0.5);
    expect(sanitizeUpgrades({ startingMoney: NaN }).startingMoney).toBe(0); // non-finite ignored
  });
});

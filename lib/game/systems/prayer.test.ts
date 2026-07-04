import { describe, it, expect } from 'vitest';
import type { PrayerDef, PrayerType } from '../types';
import { prayerDrainRate, isPrayerUnlocked, prayerUnlockWave, prayerMaxForWave } from './prayer';

const prayers: PrayerDef[] = [
  { id: 'rigour', name: 'Rigour', level: 74, drain: 8, description: '' },
  { id: 'augury', name: 'Augury', level: 77, drain: 8, description: '' },
];

describe('prayerDrainRate', () => {
  it('is zero with no active prayers', () => {
    expect(prayerDrainRate(new Set(), prayers, 1, 1)).toBe(0);
  });

  it('sums active prayer drains scaled by 1/10', () => {
    const rate = prayerDrainRate(new Set<PrayerType>(['rigour']), prayers, 1, 1);
    expect(rate).toBeCloseTo(0.8); // 8/10 * 1 * 1
  });

  it('adds up multiple active prayers', () => {
    const rate = prayerDrainRate(new Set<PrayerType>(['rigour', 'augury']), prayers, 1, 1);
    expect(rate).toBeCloseTo(1.6);
  });

  it('reduces drain by prayer efficiency and level', () => {
    const rate = prayerDrainRate(new Set<PrayerType>(['rigour']), prayers, 0.5, 11);
    // 0.8 * 0.5 * (1 - 10*0.01) = 0.8 * 0.5 * 0.9
    expect(rate).toBeCloseTo(0.36);
  });

  it('rates the three strongest prayers, before and after the maxed meta upgrade', () => {
    const trio: PrayerDef[] = [
      { id: 'piety', name: 'Piety', level: 70, drain: 8, description: '' },
      { id: 'rigour', name: 'Rigour', level: 74, drain: 8, description: '' },
      { id: 'augury', name: 'Augury', level: 77, drain: 8, description: '' },
    ];
    const active = new Set<PrayerType>(['piety', 'rigour', 'augury']);
    // 24/10 = 2.4 pure → ×6 DRAIN_SCALE = 14.4 pts/s at the sim layer.
    expect(prayerDrainRate(active, trio, 1, 1)).toBeCloseTo(2.4);
    // Clarity of Thought maxed (−45%): 2.4 × 0.55 = 1.32 pure → 7.92 pts/s.
    expect(prayerDrainRate(active, trio, 0.55, 1)).toBeCloseTo(1.32);
  });
});

describe('isPrayerUnlocked', () => {
  it('unlocks tier-1 prayers from the first wave', () => {
    expect(isPrayerUnlocked(4, 1)).toBe(true); // Burst of Strength
    expect(isPrayerUnlocked(8, 1)).toBe(false); // Sharp Eye not yet
    expect(isPrayerUnlocked(8, 2)).toBe(true); // 4 + 1*4 = 8
  });

  it('gates the strongest prayers to later waves', () => {
    expect(isPrayerUnlocked(74, 18)).toBe(false); // Rigour: 4 + 17*4 = 72 < 74
    expect(isPrayerUnlocked(74, 19)).toBe(true); // 4 + 18*4 = 76 >= 74
  });
});

describe('prayerUnlockWave', () => {
  it('returns the first wave a prayer is available', () => {
    expect(prayerUnlockWave(4)).toBe(1); // Burst of Strength
    expect(prayerUnlockWave(8)).toBe(2); // Sharp Eye
    expect(prayerUnlockWave(44)).toBe(11); // Eagle Eye
    expect(prayerUnlockWave(74)).toBe(19); // Rigour
    expect(prayerUnlockWave(77)).toBe(20); // Augury
  });

  it('agrees with isPrayerUnlocked at the boundary', () => {
    for (const level of [4, 8, 9, 26, 44, 70, 74, 77]) {
      const w = prayerUnlockWave(level);
      expect(isPrayerUnlocked(level, w)).toBe(true);
      expect(isPrayerUnlocked(level, w - 1)).toBe(false);
    }
  });
});

describe('prayerMaxForWave', () => {
  it('steps up by 15 every 3 waves from a base of 10', () => {
    expect(prayerMaxForWave(1)).toBe(10);
    expect(prayerMaxForWave(2)).toBe(10);
    expect(prayerMaxForWave(4)).toBe(25);
    expect(prayerMaxForWave(7)).toBe(40);
    expect(prayerMaxForWave(10)).toBe(55);
  });

  it('caps at 99', () => {
    expect(prayerMaxForWave(19)).toBe(99); // 10 + 6*15 = 100 -> capped
    expect(prayerMaxForWave(50)).toBe(99);
  });
});

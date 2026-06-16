import { describe, it, expect } from 'vitest';
import type { PrayerDef, PrayerType } from '../types';
import { prayerDrainRate } from './prayer';

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
});

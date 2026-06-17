import { describe, it, expect } from 'vitest';
import { goldForKill, waveClearBonus } from './rewards';

describe('goldForKill', () => {
  it('scales with the enemy hp', () => {
    expect(goldForKill(100)).toBe(41); // round(100 * 0.4) + 1
    expect(goldForKill(250)).toBe(101);
  });
  it('has a minimum payout for tiny enemies', () => {
    expect(goldForKill(1)).toBe(2);
    expect(goldForKill(0)).toBe(2);
  });
  it('grows monotonically with hp', () => {
    expect(goldForKill(500)).toBeGreaterThan(goldForKill(100));
  });
});

describe('waveClearBonus', () => {
  it('grows with the wave number', () => {
    expect(waveClearBonus(1)).toBe(30);
    expect(waveClearBonus(10)).toBe(120);
  });
  it('is strictly increasing', () => {
    expect(waveClearBonus(5)).toBeGreaterThan(waveClearBonus(4));
  });
});

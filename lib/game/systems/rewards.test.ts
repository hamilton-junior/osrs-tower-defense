import { describe, it, expect } from 'vitest';
import { goldForKill, waveClearBonus, goldLateGameDamp } from './rewards';

describe('goldForKill (fixed per type)', () => {
  it('is a flat function of base hp', () => {
    expect(goldForKill(100)).toBe(41); // round(100 * 0.4) + 1
    expect(goldForKill(250)).toBe(101);
  });
  it('has a minimum payout for tiny enemies', () => {
    expect(goldForKill(1)).toBe(2);
    expect(goldForKill(0)).toBe(2);
  });
  it('grows monotonically with base hp', () => {
    expect(goldForKill(500)).toBeGreaterThan(goldForKill(100));
  });
  it('is deterministic — the same base hp always pays the same (no wave scaling)', () => {
    expect(goldForKill(80)).toBe(goldForKill(80));
  });
});

describe('goldLateGameDamp', () => {
  it('is 1 through wave 12, then shrinks', () => {
    expect(goldLateGameDamp(12)).toBe(1);
    expect(goldLateGameDamp(20)).toBeLessThan(1);
    expect(goldLateGameDamp(30)).toBeLessThan(goldLateGameDamp(20));
  });
});

describe('waveClearBonus', () => {
  it('grows with the wave number early on', () => {
    expect(waveClearBonus(1)).toBe(30);
    expect(waveClearBonus(10)).toBe(120);
  });
  it('is strictly increasing early', () => {
    expect(waveClearBonus(5)).toBeGreaterThan(waveClearBonus(4));
  });
});

import { describe, it, expect } from 'vitest';
import { playerXpForLevel, towerXpForLevel, applyXpGain } from './leveling';

describe('xp curves', () => {
  it('player curve is level^2 * 100', () => {
    expect(playerXpForLevel(1)).toBe(100);
    expect(playerXpForLevel(5)).toBe(2500);
  });
  it('tower curve is floor(level^1.8 * 80)', () => {
    expect(towerXpForLevel(1)).toBe(80);
    expect(towerXpForLevel(10)).toBe(Math.floor(Math.pow(10, 1.8) * 80));
  });
});

describe('applyXpGain', () => {
  it('accumulates xp without levelling below the threshold', () => {
    const r = applyXpGain({ level: 1, xp: 0 }, 50, playerXpForLevel);
    expect(r).toEqual({ level: 1, xp: 50, leveledUp: false });
  });

  it('levels up and carries the remainder once the threshold is met', () => {
    const r = applyXpGain({ level: 1, xp: 60 }, 50, playerXpForLevel);
    // 110 total, threshold 100 -> level 2 with 10 carried over.
    expect(r).toEqual({ level: 2, xp: 10, leveledUp: true });
  });

  it('advances at most one level per call', () => {
    const r = applyXpGain({ level: 1, xp: 0 }, 10_000, playerXpForLevel);
    expect(r.level).toBe(2);
    expect(r.leveledUp).toBe(true);
  });
});

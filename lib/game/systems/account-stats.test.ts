import { describe, it, expect } from 'vitest';
import { EMPTY_DIFFICULTY, EMPTY_VICTORIES } from './account-save';
import { accountStats } from './account-stats';

const base = {
  victories: EMPTY_VICTORIES,
  killCounts: {},
  bossesSeen: {},
  achievements: [] as string[],
  diaries: [] as string[],
  difficulty: EMPTY_DIFFICULTY,
};

describe('accountStats', () => {
  it('reads zeroes off a fresh account', () => {
    expect(accountStats(base)).toEqual({
      wins: 0, winsClassic: 0, winsRoguelite: 0, fastestSeconds: null, bestEndlessWave: 0,
      kills: 0, killKinds: 0, bossKinds: 0, achievements: 0, diaries: 0, bestTier: -1,
    });
  });

  it('sums kills and counts the kinds behind them', () => {
    const s = accountStats({ ...base, killCounts: { goblin: 400, imp: 12, zulrah: 3 } });
    expect(s.kills).toBe(415);
    expect(s.killKinds).toBe(3);
  });

  // A tally written by an older build can carry a zero or a corrupt entry; neither
  // is a kind the player has met.
  it('ignores an id with nothing behind it', () => {
    const s = accountStats({ ...base, killCounts: { goblin: 5, ghost: 0, imp: Number.NaN } });
    expect(s.kills).toBe(5);
    expect(s.killKinds).toBe(1);
  });

  it('carries the victory record through', () => {
    const s = accountStats({
      ...base,
      victories: { total: 7, fastestSeconds: 1234.5, highestEndlessWave: 88, byMode: { classic: 5, roguelite: 2 } },
    });
    expect([s.wins, s.winsClassic, s.winsRoguelite]).toEqual([7, 5, 2]);
    expect(s.fastestSeconds).toBe(1234.5);
    expect(s.bestEndlessWave).toBe(88);
  });

  it('takes the best tier from whichever mode got further', () => {
    const s = accountStats({
      ...base,
      difficulty: { highestCleared: { classic: 0, roguelite: 3 }, records: {} },
    });
    expect(s.bestTier).toBe(3);
  });

  it('counts bosses met, achievements and diary tasks', () => {
    const s = accountStats({
      ...base,
      bossesSeen: { zulrah: 2, jad: 1 },
      achievements: ['a', 'b', 'c'],
      diaries: ['d'],
    });
    expect([s.bossKinds, s.achievements, s.diaries]).toEqual([2, 3, 1]);
  });
});

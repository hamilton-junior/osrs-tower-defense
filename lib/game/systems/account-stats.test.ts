import { describe, it, expect } from 'vitest';
import { EMPTY_DIFFICULTY, EMPTY_VICTORIES } from './account-save';
import { accountStats } from './account-stats';

const base = {
  victories: EMPTY_VICTORIES,
  killCounts: {},
  diversionsMet: {},
  achievements: [] as string[],
  diaries: [] as string[],
  difficulty: EMPTY_DIFFICULTY,
};

describe('accountStats', () => {
  it('reads zeroes off a fresh account', () => {
    expect(accountStats(base)).toEqual({
      wins: 0, winsClassic: 0, winsRoguelite: 0, fastestSeconds: null, bestEndlessWave: 0,
      kills: 0, bossKills: 0, eventKinds: 0, achievements: 0, diaries: 0, bestTier: -1,
    });
  });

  it('sums kills across every kind', () => {
    const s = accountStats({ ...base, killCounts: { goblin: 400, imp: 12, zulrah: 3 } });
    expect(s.kills).toBe(415);
  });

  // Dusk and Dawn are two lines in the Collection Log, so they count apart. Jad's
  // healers are his escort, not a boss.
  it('counts the bosses among the kills', () => {
    const s = accountStats({ ...base, killCounts: { goblin: 400, zulrah: 3, jad: 1, dusk: 2, dawn: 2, yt_hurkot: 9 } });
    expect(s.bossKills).toBe(8);
  });

  // A tally written by an older build can carry a zero or a corrupt entry; neither
  // is a kind the player has met.
  it('ignores an id with nothing behind it', () => {
    const s = accountStats({
      ...base,
      killCounts: { goblin: 5, ghost: 0, imp: Number.NaN, vorkath: 0, jad: Number.NaN },
      diversionsMet: { genie: 0, drunken_dwarf: Number.NaN, strange_plant: 1 },
    });
    expect(s.kills).toBe(5);
    expect(s.bossKills).toBe(0);
    expect(s.eventKinds).toBe(1);
  });

  // Walkbys and bird nests are diversions too, but no one would call them a random event.
  it('counts only the random events among the diversions met', () => {
    const s = accountStats({
      ...base,
      diversionsMet: { genie: 4, dr_jekyll: 1, hans: 9, party_pete: 2, bird_nest: 3, not_a_diversion: 5 },
    });
    expect(s.eventKinds).toBe(2);
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

  it('counts achievements and diary tasks', () => {
    const s = accountStats({ ...base, achievements: ['a', 'b', 'c'], diaries: ['d'] });
    expect([s.achievements, s.diaries]).toEqual([3, 1]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY_TIERS, MIN_LIVES, MAX_TIER,
  tierMods, highestUnlockedTier, isTierUnlocked, clampTier, effectiveStartLives,
  type DifficultyTier,
} from './difficulty';

const TIERS: DifficultyTier[] = [0, 1, 2, 3, 4, 5, 6];

describe('difficulty tiers', () => {
  it('has one row per tier id, in order, named after CA tiers', () => {
    expect(DIFFICULTY_TIERS.map((t) => t.id)).toEqual(TIERS);
    expect(DIFFICULTY_TIERS.map((t) => t.name)).toEqual([
      'Normal', 'Easy', 'Medium', 'Hard', 'Elite', 'Master', 'Grandmaster',
    ]);
  });

  it('tier 0 is the identity (today\'s game, unchanged)', () => {
    expect(tierMods(0)).toEqual({ enemyHp: 1, enemySpeed: 1, gold: 1, livesDelta: 0 });
  });

  it('is monotonic non-decreasing in difficulty across the ladder', () => {
    for (let i = 1; i < TIERS.length; i++) {
      const prev = tierMods(TIERS[i - 1]);
      const cur = tierMods(TIERS[i]);
      expect(cur.enemyHp).toBeGreaterThanOrEqual(prev.enemyHp);
      expect(cur.enemySpeed).toBeGreaterThanOrEqual(prev.enemySpeed);
      expect(cur.gold).toBeLessThanOrEqual(prev.gold);        // economy only tightens
      expect(cur.livesDelta).toBeLessThanOrEqual(prev.livesDelta); // lives only fall
    }
  });

  it('effectiveStartLives floors the raw table so no tier is unwinnable', () => {
    // START_LIVES is 20 in the engine. The raw table may cut aggressively
    // (Grandmaster −20 → 0), but the clamp keeps effective lives ≥ MIN_LIVES.
    const START_LIVES = 20;
    for (const t of TIERS) {
      expect(effectiveStartLives(START_LIVES, t)).toBeGreaterThanOrEqual(MIN_LIVES);
    }
    expect(effectiveStartLives(20, 0)).toBe(20);  // Normal: no cut
    expect(effectiveStartLives(20, 3)).toBe(15);  // Hard: −5, above the floor
    expect(effectiveStartLives(20, 6)).toBe(5);   // Grandmaster: −20 clamped up to 5
  });

  it('unlock math: nothing cleared exposes only Normal + Easy', () => {
    expect(highestUnlockedTier(-1)).toBe(0);
    expect(isTierUnlocked(0, -1)).toBe(true);
    expect(isTierUnlocked(1, -1)).toBe(false);
    // Clearing Normal (highestCleared 0) unlocks Easy (1).
    expect(highestUnlockedTier(0)).toBe(1);
    expect(isTierUnlocked(1, 0)).toBe(true);
    expect(isTierUnlocked(2, 0)).toBe(false);
  });

  it('unlock math: clearing Master exposes Grandmaster and caps there', () => {
    expect(highestUnlockedTier(5)).toBe(6);
    expect(highestUnlockedTier(6)).toBe(6);   // already maxed, no tier 7
    expect(highestUnlockedTier(99)).toBe(MAX_TIER);
    expect(isTierUnlocked(6, 5)).toBe(true);
  });

  it('clampTier coerces junk to a valid tier id', () => {
    expect(clampTier(-3)).toBe(0);
    expect(clampTier(4)).toBe(4);
    expect(clampTier(42)).toBe(6);
    expect(clampTier(2.9)).toBe(2);
  });
});

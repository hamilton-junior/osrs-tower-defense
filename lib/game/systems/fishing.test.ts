import { describe, it, expect } from 'vitest';
import type { TerrainField } from './terrain-generation';
import {
  buildFishingSpots, spotStage, restockSpots, rollCatch, catchesUnlockedAt,
  catchChance, fishingXpForLevel, gainFishingXp, spotId, parseSpotId, spotAtPoint,
} from './fishing';
import { SPOT_CASTS, SPOT_REST_WAVES, CATCH_CHANCE_MAX, FISHING_MAX_LEVEL } from '../data/fishing';

const GRID = 32;

/** A bare field carrying nothing but the two water spots the tests care about. */
function field(spots: { col: number; row: number }[]): TerrainField {
  return { cols: 10, rows: 10, tiles: new Array(100).fill('open'), decorations: [], patches: [], spots };
}

/** A deterministic stand-in for Math.random: replays the numbers it is given. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('fishing spots', () => {
  it('stands one spot per water spot, at the tile centre', () => {
    const spots = buildFishingSpots(field([{ col: 3, row: 4 }, { col: 7, row: 1 }]), GRID);
    expect(spots).toHaveLength(2);
    expect(spots[0].id).toBe('s3_4');
    expect(spots[0].x).toBe(3 * GRID + GRID / 2);
    expect(spots[0].y).toBe(4 * GRID + GRID / 2);
    expect(spots[0].casts).toBe(0);
    expect(spots[0].rested).toBe(0);
  });

  it('round-trips a spot id', () => {
    expect(parseSpotId(spotId(12, 5))).toEqual({ col: 12, row: 5 });
    expect(parseSpotId('p3_4')).toBeNull();
    expect(parseSpotId('sX_4')).toBeNull();
  });

  it('is ready until its casts are spent, then rests exactly SPOT_REST_WAVES waves', () => {
    const [spot] = buildFishingSpots(field([{ col: 1, row: 1 }]), GRID);
    for (let i = 0; i < SPOT_CASTS; i++) {
      expect(spotStage(spot)).toBe('ready');
      spot.casts++;
    }
    expect(spotStage(spot)).toBe('spent');

    for (let w = 0; w < SPOT_REST_WAVES - 1; w++) {
      restockSpots([spot]);
      expect(spotStage(spot)).toBe('spent');
    }
    restockSpots([spot]);
    expect(spotStage(spot)).toBe('ready');
    expect(spot.casts).toBe(0);
    expect(spot.rested).toBe(0);
  });

  it('finds the spot under a click, and nothing outside the tile', () => {
    const spots = buildFishingSpots(field([{ col: 2, row: 2 }]), GRID);
    expect(spotAtPoint(spots, 2 * GRID + 4, 2 * GRID + 4, GRID)?.id).toBe('s2_2');
    expect(spotAtPoint(spots, 5 * GRID, 5 * GRID, GRID)).toBeNull();
  });
});

describe('the catch roll', () => {
  it('only ever offers fish the level has unlocked', () => {
    expect(catchesUnlockedAt(1).map(f => f.id)).toEqual(['shrimps']);
    expect(catchesUnlockedAt(40).map(f => f.id)).toEqual(['shrimps', 'trout', 'lobster']);
    expect(catchesUnlockedAt(99)).toHaveLength(5);
  });

  it('comes up empty when the chance roll misses', () => {
    expect(rollCatch(1, seq([0.99]))).toBeNull();
  });

  it('never lands a fish above the level, however the weight roll falls', () => {
    for (const level of [1, 19, 20, 39, 75, 80, 99]) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const fish = rollCatch(level, seq([0, r]));
        expect(fish, `level ${level} roll ${r}`).not.toBeNull();
        expect(fish!.level, `level ${level} roll ${r}`).toBeLessThanOrEqual(level);
      }
    }
  });

  it('caps the catch chance below certainty', () => {
    expect(catchChance(1)).toBeCloseTo(0.553, 3);
    expect(catchChance(FISHING_MAX_LEVEL)).toBeLessThanOrEqual(CATCH_CHANCE_MAX);
    expect(catchChance(500)).toBe(CATCH_CHANCE_MAX);
  });
});

describe('fishing xp', () => {
  it('costs more per level as the level climbs', () => {
    expect(fishingXpForLevel(10)).toBeLessThan(fishingXpForLevel(50));
    expect(fishingXpForLevel(50)).toBeLessThan(fishingXpForLevel(90));
  });

  it('banks xp without levelling when the bank is short', () => {
    const g = gainFishingXp(1, 0, 5);
    expect(g.level).toBe(1);
    expect(g.xp).toBe(5);
    expect(g.levels).toBe(0);
  });

  it('crosses as many levels as the gain pays for, and counts them', () => {
    const g = gainFishingXp(1, 0, 5000);
    expect(g.level).toBeGreaterThan(1);
    expect(g.levels).toBe(g.level - 1);
    expect(g.xp).toBeGreaterThanOrEqual(0);
  });

  it('stops at the ladder top and spends nothing further', () => {
    const g = gainFishingXp(FISHING_MAX_LEVEL, 0, 10_000_000);
    expect(g.level).toBe(FISHING_MAX_LEVEL);
    expect(g.xp).toBe(0);
    expect(g.levels).toBe(0);
  });
});

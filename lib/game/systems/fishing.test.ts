import { describe, it, expect } from 'vitest';
import type { TerrainField } from './terrain-generation';
import {
  buildFishingSpots, castSeconds, spotStage, restockSpots, rollCatch, catchesUnlockedAt,
  catchChance, fishingXpForLevel, gainFishingXp, spotId, parseSpotId, spotAtPoint,
  wavesUntilRestock, poolTiles, placeSpot, moveSpot,
} from './fishing';
import {
  SPOT_CASTS, SPOT_REST_WAVES, CATCH_CHANCE_MAX, FISHING_MAX_LEVEL, CAST_XP,
  CAST_SECONDS, CAST_SECONDS_AT_MAX,
} from '../data/fishing';

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
  it('never stands a spot on a tile an allotment already holds', () => {
    const f = field([{ col: 3, row: 4 }, { col: 7, row: 1 }]);
    f.tiles[4 * f.cols + 3] = 'farming';
    const spots = buildFishingSpots(f, GRID);
    expect(spots.map(s => s.id)).toEqual(['s7_1']);
  });

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
      restockSpots([spot], GRID, () => 0);
      expect(spotStage(spot)).toBe('spent');
    }
    restockSpots([spot], GRID, () => 0);
    expect(spotStage(spot)).toBe('ready');
    expect(spot.casts).toBe(0);
    expect(spot.rested).toBe(0);
  });

  it('counts down the waves left to restock, and bottoms out at zero', () => {
    const [spot] = buildFishingSpots(field([{ col: 1, row: 1 }]), GRID);
    expect(wavesUntilRestock(spot)).toBe(0); // ready — nothing to wait for

    spot.casts = SPOT_CASTS; // spent, no rest banked yet
    expect(wavesUntilRestock(spot)).toBe(SPOT_REST_WAVES);

    spot.rested = SPOT_REST_WAVES - 1; // mid-rest
    expect(wavesUntilRestock(spot)).toBe(1);

    spot.rested = SPOT_REST_WAVES; // its last resting wave, about to flip back
    expect(wavesUntilRestock(spot)).toBe(0);
  });

  it('finds the spot under a click, and nothing outside the tile', () => {
    const spots = buildFishingSpots(field([{ col: 2, row: 2 }]), GRID);
    expect(spotAtPoint(spots, 2 * GRID + 4, 2 * GRID + 4, GRID)?.id).toBe('s2_2');
    expect(spotAtPoint(spots, 5 * GRID, 5 * GRID, GRID)).toBeNull();
  });
});

/** A field whose listed tiles are water, so a pool has somewhere to wander. */
function pool(water: { col: number; row: number }[], spots = [water[0]]): TerrainField {
  const f = field(spots);
  for (const t of water) f.tiles[t.row * f.cols + t.col] = 'water';
  return f;
}

describe('a pool the spot roams', () => {
  it('walks the whole four-connected blob of water, and stops at its edge', () => {
    // An L of four water tiles, plus one water tile a diagonal away that is not
    // part of the blob, plus dry ground either side.
    const f = pool([{ col: 2, row: 2 }, { col: 3, row: 2 }, { col: 3, row: 3 }, { col: 3, row: 4 }, { col: 5, row: 5 }]);
    const tiles = poolTiles(f, 2, 2);
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toEqual({ col: 2, row: 2 }); // the seed leads
    expect(tiles).toContainEqual({ col: 3, row: 4 });
    expect(tiles).not.toContainEqual({ col: 5, row: 5 });
  });

  it('keeps the seed even when the seed tile is not flagged water', () => {
    expect(poolTiles(field([{ col: 1, row: 1 }]), 1, 1)).toEqual([{ col: 1, row: 1 }]);
  });

  it('hands every spot its own pool', () => {
    const f = pool([{ col: 2, row: 2 }, { col: 2, row: 3 }]);
    const [spot] = buildFishingSpots(f, GRID);
    expect(spot.tiles).toHaveLength(2);
    expect(spot.col).toBe(2);
    expect(spot.row).toBe(2);
  });

  it('moves the fish to another tile of the pool when they come back', () => {
    const f = pool([{ col: 2, row: 2 }, { col: 2, row: 3 }]);
    const [spot] = buildFishingSpots(f, GRID);
    spot.casts = SPOT_CASTS;
    for (let w = 0; w < SPOT_REST_WAVES; w++) restockSpots([spot], GRID, () => 0.9);

    expect(spot.id).toBe('s2_2');      // the id names the pool, not the square
    expect(spot.row).toBe(3);          // 0.9 of two tiles is the second one
    expect(spot.y).toBe(3 * GRID + GRID / 2);
  });

  it('never leaves the pool, whatever the roll', () => {
    const f = pool([{ col: 2, row: 2 }, { col: 2, row: 3 }, { col: 3, row: 3 }]);
    const [spot] = buildFishingSpots(f, GRID);
    for (const r of [0, 0.34, 0.67, 0.999999, 1]) {
      moveSpot(spot, GRID, () => r);
      expect(spot.tiles).toContainEqual({ col: spot.col, row: spot.row });
    }
  });

  it('leaves a one-tile pool where it is', () => {
    const [spot] = buildFishingSpots(field([{ col: 4, row: 4 }]), GRID);
    moveSpot(spot, GRID, () => 0.99);
    expect({ col: spot.col, row: spot.row }).toEqual({ col: 4, row: 4 });
  });

  it('refuses to stand on a tile outside the pool', () => {
    const f = pool([{ col: 2, row: 2 }, { col: 2, row: 3 }]);
    const [spot] = buildFishingSpots(f, GRID);
    expect(placeSpot(spot, 9, 9, GRID)).toBe(false);
    expect({ col: spot.col, row: spot.row }).toEqual({ col: 2, row: 2 });
    expect(placeSpot(spot, 2, 3, GRID)).toBe(true);
    expect(spot.x).toBe(2 * GRID + GRID / 2);
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

describe('how long a cast takes', () => {
  it('is the whole bar at level one', () => {
    expect(castSeconds(1)).toBe(CAST_SECONDS);
  });

  it('is half the bar at 99', () => {
    expect(castSeconds(FISHING_MAX_LEVEL)).toBeCloseTo(CAST_SECONDS / 2, 10);
    expect(castSeconds(FISHING_MAX_LEVEL)).toBeCloseTo(CAST_SECONDS_AT_MAX, 10);
  });

  // Straight between the two ends, so halfway up the ladder is halfway down the
  // bar: level 50 is 49 of the 98 levels, and 2.25s is 0.75s off 3.
  it('runs straight between the two ends', () => {
    expect(castSeconds(50)).toBeCloseTo(2.25, 10);
    expect(castSeconds(25)).toBeCloseTo(3 - 1.5 * (24 / 98), 10);
  });

  it('clamps at both ends of the ladder', () => {
    expect(castSeconds(0)).toBe(CAST_SECONDS);
    expect(castSeconds(-20)).toBe(CAST_SECONDS);
    expect(castSeconds(FISHING_MAX_LEVEL + 40)).toBeCloseTo(CAST_SECONDS_AT_MAX, 10);
  });
});

describe('fishing xp', () => {
  it('costs more per level as the level climbs', () => {
    expect(fishingXpForLevel(10)).toBeLessThan(fishingXpForLevel(50));
    expect(fishingXpForLevel(50)).toBeLessThan(fishingXpForLevel(90));
  });

  it('pins the curve itself, so the tuned exponent cannot drift silently', () => {
    expect(fishingXpForLevel(1)).toBeCloseTo(70, 3);
    expect(fishingXpForLevel(40)).toBeCloseTo(70, 3); // still on the floor
    expect(fishingXpForLevel(60)).toBeCloseTo(117, 3);
    expect(fishingXpForLevel(FISHING_MAX_LEVEL)).toBeCloseTo(260, 3);
  });

  it('paces the fish ladder against the casts a run actually deals', () => {
    // A pool is worth 33 casts over forty waves and a map deals one or two of
    // them, so these counts are the whole balance: manta ray has to cost most of
    // a two-pool run, and a one-pool map has to fall short of it.
    const castsToReach = (target: number) => {
      let level = 1;
      let xp = 0;
      let casts = 0;
      while (level < target && casts < 1000) {
        casts++;
        ({ level, xp } = gainFishingXp(level, xp, CAST_XP));
      }
      return casts;
    };
    expect(castsToReach(20)).toBe(8);  // trout
    expect(castsToReach(40)).toBe(16); // lobster
    expect(castsToReach(76)).toBe(39); // shark
    expect(castsToReach(81)).toBe(44); // manta ray
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

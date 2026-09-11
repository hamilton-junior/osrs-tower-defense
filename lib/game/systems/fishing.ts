import {
  FISH, type FishDef, SPOT_CASTS, SPOT_REST_WAVES,
  CATCH_CHANCE_BASE, CATCH_CHANCE_PER_LEVEL, CATCH_CHANCE_MAX, FISHING_MAX_LEVEL,
} from '../data/fishing';
import type { TerrainField } from './terrain-generation';

/**
 * **Fishing spots** — the water's half of the skill.
 *
 * A spot is a tile, the same way an allotment is, and carries its tile in its id
 * so a save can name it without storing coordinates. It holds a few casts; when
 * they are spent the fish move on, and they come back after a set number of
 * *waves* — not seconds and not wave numbers, because the debug wave control
 * jumps the counter and a spot that read it would restock for free.
 */
export interface FishingSpot {
  /** `s<col>_<row>`, mirroring farming's plot id. */
  id: string;
  col: number;
  row: number;
  /** Board coordinates, derived once from the grid. */
  x: number;
  y: number;
  /** Casts spent, up to `SPOT_CASTS`. */
  casts: number;
  /** Waves survived since the spot was spent. */
  rested: number;
}

export const spotId = (col: number, row: number): string => `s${col}_${row}`;

export function parseSpotId(id: string): { col: number; row: number } | null {
  const m = /^s(\d+)_(\d+)$/.exec(id);
  if (!m) return null;
  return { col: Number(m[1]), row: Number(m[2]) };
}

export function makeSpot(col: number, row: number, grid: number): FishingSpot {
  return {
    id: spotId(col, row),
    col, row,
    x: col * grid + grid / 2,
    y: row * grid + grid / 2,
    casts: 0,
    rested: 0,
  };
}

/** Every spot the map dealt, in the order the terrain listed them. */
export function buildFishingSpots(field: TerrainField, grid: number): FishingSpot[] {
  return field.spots.map(s => makeSpot(s.col, s.row, grid));
}

export function spotStage(spot: FishingSpot): 'ready' | 'spent' {
  return spot.casts >= SPOT_CASTS ? 'spent' : 'ready';
}

/** The spot under a board click, or null. A spot owns its whole tile. */
export function spotAtPoint(
  spots: FishingSpot[], x: number, y: number, grid: number,
): FishingSpot | null {
  const col = Math.floor(x / grid);
  const row = Math.floor(y / grid);
  return spots.find(s => s.col === col && s.row === row) ?? null;
}

/** How many more waves a spent spot needs. Zero for a ready one. */
export function wavesUntilRestock(spot: FishingSpot): number {
  if (spotStage(spot) === 'ready') return 0;
  return Math.max(0, SPOT_REST_WAVES - spot.rested);
}

/** One wave went by. Called from `checkWaveEnd`, beside `ripenPatches`. */
export function restockSpots(spots: FishingSpot[]): void {
  for (const spot of spots) {
    if (spotStage(spot) === 'ready') continue;
    spot.rested++;
    if (spot.rested >= SPOT_REST_WAVES) {
      spot.casts = 0;
      spot.rested = 0;
    }
  }
}

/** Every fish this level can land — the table widens as the level climbs. */
export function catchesUnlockedAt(level: number): FishDef[] {
  return FISH.filter(f => f.level <= Math.max(1, level));
}

/** The share of casts that land anything, capped short of certainty. */
export function catchChance(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.min(CATCH_CHANCE_MAX, CATCH_CHANCE_BASE + lv * CATCH_CHANCE_PER_LEVEL);
}

/**
 * One cast's fish, or null for a cast that came up empty. Two rolls: the first
 * decides whether anything bit, the second picks which of the unlocked fish it
 * was, by weight. The weights halve up the ladder, so the fish you unlocked
 * first stays the one you pull most.
 */
export function rollCatch(level: number, rng: () => number): FishDef | null {
  if (rng() >= catchChance(level)) return null;
  const pool = catchesUnlockedAt(level);
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, f) => sum + f.weight, 0);
  let roll = rng() * total;
  for (const fish of pool) {
    roll -= fish.weight;
    if (roll < 0) return fish;
  }
  return pool[pool.length - 1];
}

/**
 * The XP one level costs. Deliberately flatter than Hunter's curve: a run is
 * forty waves and a pool is worth a few casts a wave, so the top rungs have to
 * be reachable inside one run or they are decoration.
 */
export function fishingXpForLevel(level: number): number {
  return Math.max(12, Math.round(Math.pow(Math.max(1, level), 1.6) / 6));
}

export interface FishingGain {
  level: number;
  xp: number;
  /** How many levels this gain crossed — the engine turns any number above zero
   *  into one level-up notice. */
  levels: number;
}

export function gainFishingXp(level: number, xp: number, gain: number): FishingGain {
  let lv = Math.min(FISHING_MAX_LEVEL, Math.max(1, Math.floor(level)));
  let bank = Math.max(0, xp) + Math.max(0, gain);
  let crossed = 0;
  while (lv < FISHING_MAX_LEVEL) {
    const need = fishingXpForLevel(lv);
    if (bank < need) break;
    bank -= need;
    lv++;
    crossed++;
  }
  if (lv >= FISHING_MAX_LEVEL) bank = 0; // nothing left to spend it on
  return { level: lv, xp: bank, levels: crossed };
}

import {
  FISH, type FishDef, SPOT_CASTS, SPOT_REST_WAVES,
  CATCH_CHANCE_BASE, CATCH_CHANCE_PER_LEVEL, CATCH_CHANCE_MAX, FISHING_MAX_LEVEL,
} from '../data/fishing';
import type { TerrainField } from './terrain-generation';

/**
 * **Fishing spots** — the water's half of the skill.
 *
 * A spot is a pool, named in its id after the tile the terrain seeded it on. It
 * holds a few casts; when they are spent the fish move on, and they come back
 * after a set number of *waves* — not seconds and not wave numbers, because the
 * debug wave control jumps the counter and a spot that read it would restock for
 * free. They also come back somewhere else: the spot hops between the pool's own
 * water tiles, and never onto a square the map did not flood.
 */
export interface FishingSpot {
  /** `s<col>_<row>` of the tile the pool was seeded on, mirroring farming's plot
   *  id. It names the pool, not the square the fish are in this wave, so it
   *  survives the spot moving. */
  id: string;
  col: number;
  row: number;
  /** Board coordinates of the tile the spot is standing on right now. */
  x: number;
  y: number;
  /** Casts spent, up to `SPOT_CASTS`. */
  casts: number;
  /** Waves survived since the spot was spent. */
  rested: number;
  /** Every water tile the pool is made of, its seed first. The spot moves between
   *  these and nowhere else. */
  tiles: SpotTile[];
}

/** One tile of a pool. */
export interface SpotTile {
  col: number;
  row: number;
}

export const spotId = (col: number, row: number): string => `s${col}_${row}`;

export function parseSpotId(id: string): { col: number; row: number } | null {
  const m = /^s(\d+)_(\d+)$/.exec(id);
  if (!m) return null;
  return { col: Number(m[1]), row: Number(m[2]) };
}

export function makeSpot(col: number, row: number, grid: number, tiles?: SpotTile[]): FishingSpot {
  return {
    id: spotId(col, row),
    col, row,
    x: col * grid + grid / 2,
    y: row * grid + grid / 2,
    casts: 0,
    rested: 0,
    tiles: tiles && tiles.length > 0 ? tiles : [{ col, row }],
  };
}

/**
 * The water tiles one pool is made of, four-connected out from the tile the
 * terrain seeded it on.
 *
 * The generator records only that seed, so the rest of the blob has to be walked
 * back out of `tiles` — and walking it is also the guarantee the spot asks for:
 * it can only ever stand somewhere this fill returned, which is water the map
 * already dealt. The seed itself is always in the list, whatever it is flagged,
 * because that is where the spot starts.
 */
export function poolTiles(field: TerrainField, col: number, row: number): SpotTile[] {
  const seen = new Set<number>([row * field.cols + col]);
  const out: SpotTile[] = [{ col, row }];
  const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < out.length; i++) {
    const here = out[i];
    for (const [dc, dr] of steps) {
      const nc = here.col + dc;
      const nr = here.row + dr;
      if (nc < 0 || nr < 0 || nc >= field.cols || nr >= field.rows) continue;
      const idx = nr * field.cols + nc;
      if (seen.has(idx)) continue;
      seen.add(idx);
      if (field.tiles[idx] !== 'water') continue;
      out.push({ col: nc, row: nr });
    }
  }
  return out;
}

/** Stand a spot on one of its own pool's tiles, refusing anything else. The id
 *  does not travel with it — it names the pool. */
export function placeSpot(spot: FishingSpot, col: number, row: number, grid: number): boolean {
  if (!spot.tiles.some(t => t.col === col && t.row === row)) return false;
  spot.col = col;
  spot.row = row;
  spot.x = col * grid + grid / 2;
  spot.y = row * grid + grid / 2;
  return true;
}

/** The fish surface somewhere else in the same pool. A plain uniform roll, so a
 *  small pool sometimes deals the tile it was already on — that is the water
 *  being water rather than the spot being stuck. */
export function moveSpot(spot: FishingSpot, grid: number, rng: () => number): void {
  if (spot.tiles.length < 2) return;
  const i = Math.min(spot.tiles.length - 1, Math.max(0, Math.floor(rng() * spot.tiles.length)));
  const pick = spot.tiles[i];
  placeSpot(spot, pick.col, pick.row, grid);
}

/** Every spot the map dealt, in the order the terrain listed them. A tile an
 *  allotment already holds is skipped: farming and fishing share the board and
 *  never a square, and the plot was there first. */
export function buildFishingSpots(field: TerrainField, grid: number): FishingSpot[] {
  return field.spots
    .filter(s => field.tiles[s.row * field.cols + s.col] !== 'farming')
    .map(s => makeSpot(s.col, s.row, grid, poolTiles(field, s.col, s.row)));
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

/** One wave went by. Called from `checkWaveEnd`, beside `ripenPatches`. A pool
 *  that comes back also moves: the fish left this square and surfaced on another
 *  of the pool's own tiles. */
export function restockSpots(spots: FishingSpot[], grid: number, rng: () => number): void {
  for (const spot of spots) {
    if (spotStage(spot) === 'ready') continue;
    spot.rested++;
    if (spot.rested >= SPOT_REST_WAVES) {
      spot.casts = 0;
      spot.rested = 0;
      moveSpot(spot, grid, rng);
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
 * The XP one level costs, cut to the casts a run actually deals rather than to
 * OSRS's own curve. A map holds one or two pools and a pool is worth 33 casts
 * over forty waves, so the whole ladder has to fit inside roughly 33-66 casts.
 *
 * The floor is what makes it a climb. Below level 44 the power term is smaller
 * than 70, so every early level costs the same 70 xp — a hair over two casts —
 * instead of being crossed for free on the first one. Trout lands around cast 8,
 * lobster 16, shark 39 and manta ray 44: the top of the ladder is most of a
 * two-pool run, and a one-pool map tops out short of it.
 */
export function fishingXpForLevel(level: number): number {
  return Math.max(70, Math.round(Math.pow(Math.max(1, level), 1.6) / 6));
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

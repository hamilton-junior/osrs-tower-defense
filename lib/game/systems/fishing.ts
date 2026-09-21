import {
  FISH, type FishDef, SPOT_CASTS, SPOT_REST_WAVES,
  CAST_SECONDS, CAST_SECONDS_AT_MAX,
  CATCH_CHANCE_BASE, CATCH_CHANCE_PER_LEVEL, CATCH_CHANCE_MAX, FISHING_MAX_LEVEL,
} from '../data/fishing';
import type { LiquidKind, TerrainField } from './terrain-generation';
import type { BiomeId } from '../data/biomes';

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
  /** What this pool is filled with. Rolled per pool by the terrain, so one map can
   *  hold water in one corner and lava in the other, and each deals its own fish. */
  liquid: LiquidKind;
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

export function makeSpot(
  col: number, row: number, grid: number, tiles?: SpotTile[], liquid: LiquidKind = 'water',
): FishingSpot {
  return {
    id: spotId(col, row),
    col, row,
    x: col * grid + grid / 2,
    y: row * grid + grid / 2,
    casts: 0,
    rested: 0,
    tiles: tiles && tiles.length > 0 ? tiles : [{ col, row }],
    liquid,
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
    .map(s => makeSpot(
      s.col, s.row, grid,
      poolTiles(field, s.col, s.row),
      field.liquid[s.row * field.cols + s.col] ?? 'water',
    ));
}

/**
 * Re-roll what every pool on the board is filled with, against the region the run
 * now stands in.
 *
 * Travelling keeps the map — the road, the ground beside it and the towers on it are
 * the board the player has been building for a whole leg. The *liquid* is not part of
 * that board: a pond is water because the region it sits in holds water, so marching
 * into Mor Ul Rek has to turn it to lava, and marching back out has to turn it back.
 * Without this a run that started in Lumbridge fishes trout in the middle of the
 * TzHaar city, and the infernal eel it travelled for can never be caught.
 *
 * One roll per pool, the same rule the terrain generator uses: a body of water is
 * water or it is lava, never a mix. Both halves are written — `field.liquid`, which
 * the background bake paints from, and the spot's own `liquid`, which decides the
 * sprite that breaks the surface and the ladder of fish it deals. Pools the terrain
 * dealt but that carry no spot (a bought plot landed on the seed tile) are re-rolled
 * too, so nothing on the board is left the colour of the region the run has left.
 *
 * Pure but for the two it is handed. Seed the rng off the run's map seed and the
 * region so a save resumed in TzHaar comes back to the same pools it left.
 */
export function relightPools(
  field: TerrainField, spots: FishingSpot[], lavaChance: number, rng: () => number,
): void {
  const byId = new Map(spots.map(s => [s.id, s]));
  for (const seed of field.spots) {
    const kind: LiquidKind = rng() < lavaChance ? 'lava' : 'water';
    for (const t of poolTiles(field, seed.col, seed.row)) {
      field.liquid[t.row * field.cols + t.col] = kind;
    }
    const spot = byId.get(spotId(seed.col, seed.row));
    if (spot) spot.liquid = kind;
  }
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

/**
 * Every fish this level can land out of *this* pool — the table widens as the level
 * climbs, and it is a different table over lava than over water.
 *
 * Three gates, all of them hard: the Fishing level, the liquid the pool holds, and
 * the region, for the one catch that belongs to a single region. A lava pool
 * outside TzHaar therefore tops out at the lava eel however high the level goes.
 */
export function catchesUnlockedAt(
  level: number, liquid: LiquidKind = 'water', biome?: BiomeId,
): FishDef[] {
  return FISH.filter(f =>
    f.level <= Math.max(1, level)
    && f.liquid === liquid
    && (f.biome === undefined || f.biome === biome));
}

/** The share of casts that land anything, capped short of certainty. */
export function catchChance(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.min(CATCH_CHANCE_MAX, CATCH_CHANCE_BASE + lv * CATCH_CHANCE_PER_LEVEL);
}

/**
 * How long one cast takes at this level, in wall-clock seconds.
 *
 * Straight from `CAST_SECONDS` at level 1 to `CAST_SECONDS_AT_MAX` at 99, the
 * same shape the catch chance already climbs on. Every level shortens the bar by
 * about fifteen milliseconds — too little to notice one at a time, which is the
 * point: the reward for the ladder is that a late run fishes at twice the rate an
 * early one does, not that any single level feels like a threshold.
 */
export function castSeconds(level: number): number {
  const lv = Math.min(FISHING_MAX_LEVEL, Math.max(1, Math.floor(level)));
  const climbed = (lv - 1) / (FISHING_MAX_LEVEL - 1);
  return CAST_SECONDS + (CAST_SECONDS_AT_MAX - CAST_SECONDS) * climbed;
}

/**
 * One cast's fish, or null for a cast that came up empty. Two rolls: the first
 * decides whether anything bit, the second picks which of the unlocked fish it
 * was, by weight. The weights halve up the ladder, so the fish you unlocked
 * first stays the one you pull most.
 */
export function rollCatch(
  level: number, rng: () => number, liquid: LiquidKind = 'water', biome?: BiomeId,
): FishDef | null {
  if (rng() >= catchChance(level)) return null;
  const pool = catchesUnlockedAt(level, liquid, biome);
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

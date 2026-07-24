/**
 * Procedural **terrain field** — a pure, seeded companion to `map-generation`.
 * Where the road generator draws the *path*, this fills the surrounding field with
 * per-run **obstacles** (hard, block building) and **non-buildable zones** (soft),
 * plus cosmetic **decorations**, so the empty space becomes a fresh placement puzzle
 * each run.
 *
 * The one hard guarantee is **defensibility**: obstacles never sit on the road, a
 * two-tile *build corridor* hugging the road is always left open, and a final repair
 * pass ensures every road tile keeps enough open ground nearby to actually defend
 * it. No retries — clusters are placed, then repaired, deterministically.
 *
 * All coordinates are tile indices on the board's fixed grid (54×24). The engine
 * consults `tiles` in `isValidPlacement`; the renderer draws `tiles` + `decorations`
 * with the active biome palette (no sprites, no external assets).
 */

import type { Point } from '../types';
import { pointToSegmentDistance } from './geometry';
import { makeRng } from './map-generation';

export type TileFlag = 'open' | 'blocked' | 'unbuildable';

/** A cosmetic prop placed on an open tile (no gameplay effect). `kind` selects the
 *  shape/palette slot the renderer draws. */
export interface TerrainDecoration {
  col: number;
  row: number;
  kind: number;
}

export interface TerrainField {
  cols: number;
  rows: number;
  /** Row-major, length `cols * rows`. */
  tiles: TileFlag[];
  decorations: TerrainDecoration[];
}

/** A tile counts as *road* if its centre is within this many px of the road
 *  polyline — the road runs along grid lines, so this is the pair of tiles
 *  straddling it. Obstacles never land on a road tile. */
const ROAD_TILE_DIST_FACTOR = 1; // × grid
/** Tiles within this Chebyshev distance of a road tile stay open — the build lane. */
export const CORRIDOR_RADIUS = 2;
/** Defensibility check radius and floor: every road tile must keep at least this
 *  many open, non-road tiles within this Chebyshev radius. */
export const REPAIR_RADIUS = 3;
export const MIN_OPEN_NEAR = 6;
/** Obstacle/zone coverage cap, as a fraction of eligible (non-corridor) tiles. */
const MAX_COVERAGE = 0.22;
/** Chance an eligible open tile gets a cosmetic decoration. */
const DECOR_PROB = 0.12;
/** Seed offset so terrain varies independently of the road, still per-run stable. */
const TERRAIN_SEED_XOR = 0x9e3779b9;

/** Which tiles the road occupies (centre within ~1 tile of the polyline). Exported
 *  so both the generator and its tests share one definition of "road tile". */
export function computeRoadTiles(
  path: readonly Point[],
  cols: number,
  rows: number,
  grid: number,
): boolean[] {
  const road = new Array<boolean>(cols * rows).fill(false);
  const thresh = grid * ROAD_TILE_DIST_FACTOR;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * grid;
      const cy = (r + 0.5) * grid;
      let min = Infinity;
      for (let i = 0; i < path.length - 1; i++) {
        const d = pointToSegmentDistance(cx, cy, path[i], path[i + 1]);
        if (d < min) min = d;
        if (min < thresh) break;
      }
      if (min < thresh) road[r * cols + c] = true;
    }
  }
  return road;
}

/** Chebyshev dilation: tiles within `radius` of any set tile. */
function dilate(mask: boolean[], cols: number, rows: number, radius: number): boolean[] {
  const out = new Array<boolean>(cols * rows).fill(false);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let hit = false;
      for (let dr = -radius; dr <= radius && !hit; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (mask[nr * cols + nc]) { hit = true; break; }
        }
      }
      out[r * cols + c] = hit;
    }
  }
  return out;
}

/** Count open, non-road tiles within Chebyshev `radius` of `(c, r)`. */
function openNear(
  flags: TileFlag[], road: boolean[], cols: number, rows: number,
  c: number, r: number, radius: number,
): number {
  let n = 0;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const idx = nr * cols + nc;
      if (!road[idx] && flags[idx] === 'open') n++;
    }
  }
  return n;
}

/**
 * Build the terrain field for a run. `path` is the built road polyline (logic px);
 * `seed` is the run's map seed (terrain derives its own stream from it).
 */
export function generateTerrain(
  seed: number,
  path: readonly Point[],
  cols: number,
  rows: number,
  grid: number,
): TerrainField {
  const rng = makeRng((seed ^ TERRAIN_SEED_XOR) >>> 0);
  const road = computeRoadTiles(path, cols, rows, grid);
  const corridor = dilate(road, cols, rows, CORRIDOR_RADIUS); // includes the road itself

  const flags: TileFlag[] = new Array<TileFlag>(cols * rows).fill('open');
  const eligible: number[] = [];
  for (let i = 0; i < flags.length; i++) if (!corridor[i]) eligible.push(i);

  // ── seeded cluster placement up to the coverage cap ──
  const cap = Math.floor(eligible.length * MAX_COVERAGE);
  let placed = 0;
  let guard = 0;
  while (placed < cap && guard++ < 20000) {
    const start = eligible[Math.floor(rng() * eligible.length)];
    if (flags[start] !== 'open') continue;
    const kind: TileFlag = rng() < 0.6 ? 'blocked' : 'unbuildable';
    const blobSize = 2 + Math.floor(rng() * 4); // 2..5 tiles
    const stack = [start];
    let grown = 0;
    while (stack.length > 0 && grown < blobSize && placed < cap) {
      const pick = Math.floor(rng() * stack.length);
      const idx = stack.splice(pick, 1)[0];
      if (corridor[idx] || flags[idx] !== 'open') continue;
      flags[idx] = kind;
      placed++;
      grown++;
      const c = idx % cols;
      const r = (idx / cols) | 0;
      if (c + 1 < cols) stack.push(r * cols + c + 1);
      if (c - 1 >= 0) stack.push(r * cols + c - 1);
      if (r + 1 < rows) stack.push((r + 1) * cols + c);
      if (r - 1 >= 0) stack.push((r - 1) * cols + c);
    }
  }

  // ── defensibility repair: every road tile keeps ≥ MIN_OPEN_NEAR open neighbours.
  // Flipping only ever adds open tiles, so one pass over all road tiles suffices. ──
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!road[r * cols + c]) continue;
      let count = openNear(flags, road, cols, rows, c, r, REPAIR_RADIUS);
      if (count >= MIN_OPEN_NEAR) continue;
      // Gather obstacle tiles in radius, nearest first, and open them until satisfied.
      const obstacles: { idx: number; d: number }[] = [];
      for (let dr = -REPAIR_RADIUS; dr <= REPAIR_RADIUS; dr++) {
        for (let dc = -REPAIR_RADIUS; dc <= REPAIR_RADIUS; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const idx = nr * cols + nc;
          if (!road[idx] && flags[idx] !== 'open') {
            obstacles.push({ idx, d: Math.max(Math.abs(dr), Math.abs(dc)) });
          }
        }
      }
      obstacles.sort((a, b) => a.d - b.d);
      for (const o of obstacles) {
        if (count >= MIN_OPEN_NEAR) break;
        flags[o.idx] = 'open';
        count++;
      }
    }
  }

  // ── cosmetic decorations on open, non-corridor tiles ──
  const decorations: TerrainDecoration[] = [];
  for (const idx of eligible) {
    if (flags[idx] !== 'open') continue;
    if (rng() < DECOR_PROB) {
      decorations.push({ col: idx % cols, row: (idx / cols) | 0, kind: Math.floor(rng() * 5) });
    }
  }

  return { cols, rows, tiles: flags, decorations };
}

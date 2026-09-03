import type { Point } from '../types';

/** Euclidean distance between two points. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Squared distance — cheaper than {@link distance} because it skips the
 * `sqrt`. Prefer this for range/radius comparisons (`distSq <= r * r`).
 */
export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Shortest distance from point `(px, py)` to the segment `a → b`. */
export function pointToSegmentDistance(
  px: number,
  py: number,
  a: Point,
  b: Point,
): number {
  const C = b.x - a.x;
  const D = b.y - a.y;
  const lenSq = C * C + D * D;

  // Degenerate (zero-length) segment: distance to the single point.
  let param = -1;
  if (lenSq !== 0) {
    param = ((px - a.x) * C + (py - a.y) * D) / lenSq;
  }

  let nx: number;
  let ny: number;
  if (param < 0) {
    nx = a.x;
    ny = a.y;
  } else if (param > 1) {
    nx = b.x;
    ny = b.y;
  } else {
    nx = a.x + param * C;
    ny = a.y + param * D;
  }

  return distance(px, py, nx, ny);
}

/**
 * Half-extent (in px) of a tower's *square* range, snapped to the tile grid so
 * the square's edges line up with grid lines (towers sit on grid intersections).
 * Towers attack in an axis-aligned square — like an OSRS tile range — rather
 * than a circle.
 */
export function squareRange(range: number, grid: number): number {
  return Math.max(grid, Math.round(range / grid) * grid);
}

/**
 * Snap a logic coordinate to the CENTRE of the tile it falls in. This is the
 * lattice towers occupy, so a placed tower sits *inside* a square — aligned with
 * the map's tile-centred scenery (bushes, rocks, obstacles) — rather than on the
 * intersection between four tiles. Snapped values sit on a `grid`-spaced lattice,
 * so any two of them differ by a whole number of tiles (what group move / paste
 * translations rely on to stay on-grid).
 */
export function snapToTileCenter(v: number, grid: number): number {
  return (Math.floor(v / grid) + 0.5) * grid;
}

/**
 * Chebyshev (square) range test: is `(ex, ey)` within `half` px of `(tx, ty)`
 * on *both* axes? Pairs with {@link squareRange}.
 */
export function inSquareRange(
  ex: number,
  ey: number,
  tx: number,
  ty: number,
  half: number,
): boolean {
  return Math.abs(ex - tx) <= half && Math.abs(ey - ty) <= half;
}

/** One knockback shove: move (x,y) toward the waypoint (tx,ty) by up to `dist`,
 *  clamped at the waypoint. Returns the new position and the distance moved —
 *  the pure core of the engine's knockback, extracted so the shove is testable. */
export function knockbackStep(
  x: number, y: number,
  tx: number, ty: number,
  dist: number,
): { x: number; y: number; moved: number } {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d < 1 || dist <= 0) return { x, y, moved: 0 };
  const step = Math.min(dist, d);
  return { x: x + (dx / d) * step, y: y + (dy / d) * step, moved: step };
}

// ─────────────────────────── walking the road itself ───────────────────────
// An enemy's position on the road is a waypoint index plus a point part-way along
// the segment that leaves it. These three walk that polyline in *distance*, which is
// the only unit that means anything across procedurally generated maps: a map may be
// 7 waypoints or 20, so "three waypoints on" is a different journey on every board,
// while "a tenth of the road" is the same one everywhere.

/** Total length of the road, in logic pixels. */
export function pathTotalLength(path: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += distance(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
  return total;
}

/** Road left to walk from `(x, y)` — which sits on the segment leaving `pathIndex` —
 *  to the far end. */
export function remainingPathDistance(path: readonly Point[], pathIndex: number, x: number, y: number): number {
  const next = path[pathIndex + 1];
  if (!next) return 0; // already at the end
  let total = distance(x, y, next.x, next.y);
  for (let i = pathIndex + 1; i < path.length - 1; i++) {
    total += distance(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
  }
  return total;
}

/**
 * Slide `dist` pixels forward along the road from `(x, y)` on segment `pathIndex`,
 * returning where that lands — a point *within* a segment, not snapped to a waypoint.
 * Walking past the end clamps to the final waypoint.
 */
export function advanceAlongPath(
  path: readonly Point[], pathIndex: number, x: number, y: number, dist: number,
): { pathIndex: number; x: number; y: number } {
  let i = pathIndex;
  let cx = x;
  let cy = y;
  let left = Math.max(0, dist);
  while (left > 0) {
    const next = path[i + 1];
    if (!next) break; // end of the road
    const seg = distance(cx, cy, next.x, next.y);
    if (seg > left) {
      // The step ends inside this segment.
      const t = left / seg;
      return { pathIndex: i, x: cx + (next.x - cx) * t, y: cy + (next.y - cy) * t };
    }
    // Step over the waypoint and keep going from there.
    left -= seg;
    cx = next.x;
    cy = next.y;
    i += 1;
  }
  return { pathIndex: i, x: cx, y: cy };
}

/**
 * Snap `(x, y)` to the tile grid and clamp it a tile in from each board edge —
 * the landing tile for the keyboard placement cursor (M8). Keeping a one-tile
 * margin stops the cursor from parking half-off the board where nothing can be
 * built anyway. Pure so the arrow-key stepping stays testable.
 */
export function clampCursorToBoard(
  x: number, y: number, grid: number, width: number, height: number,
): Point {
  const sx = Math.round(x / grid) * grid;
  const sy = Math.round(y / grid) * grid;
  return {
    x: Math.max(grid, Math.min(width - grid, sx)),
    y: Math.max(grid, Math.min(height - grid, sy)),
  };
}

/**
 * Whether `(x, y)` is far enough from every path segment and existing tower
 * to host a new tower. `towers` only needs `x`/`y`, so any placed entity works.
 * `isBlockedTile`, when given, additionally rejects spots on terrain the run's
 * field marks unbuildable (obstacles / non-buildable zones).
 */
export function isValidPlacement(
  x: number,
  y: number,
  path: Point[],
  towers: ReadonlyArray<{ x: number; y: number }>,
  pathClearance = 40, // pathWidth (25) + tower radius (15)
  towerClearance = 30, // two tower radii
  isBlockedTile?: (x: number, y: number) => boolean,
): boolean {
  if (isBlockedTile?.(x, y)) return false;
  for (let i = 0; i < path.length - 1; i++) {
    if (pointToSegmentDistance(x, y, path[i], path[i + 1]) < pathClearance) {
      return false;
    }
  }
  for (const tower of towers) {
    if (distance(x, y, tower.x, tower.y) < towerClearance) {
      return false;
    }
  }
  return true;
}

/**
 * One straight run of road, as a player sees it.
 *
 * The path is a list of waypoints, but a waypoint is not a bend: the road editor
 * and the notch tool both insert points along a run that is still visually dead
 * straight, and a generated map can carry a couple of near-collinear points from
 * its own smoothing. Counting those as corners would make "how many bends away"
 * a property of how the road happens to be stored rather than of what is drawn.
 *
 * So a stretch merges consecutive segments while the road does not really turn —
 * `minTurn` radians away from the heading the stretch *started* on. Measuring
 * against the start (not against the previous segment) is what stops a long
 * sweeping curve, made of many tiny turns, from swallowing the whole road.
 *
 * `from`/`to` are inclusive segment indices, which is the same index an enemy
 * carries as `pathIndex` — so "which stretch is this enemy on" is a comparison,
 * not a projection. Stretches tile the road exactly and never overlap.
 */
export interface RoadStretch {
  /** First segment index in the run. */
  from: number;
  /** Last segment index in the run, inclusive. */
  to: number;
  /** Where the run starts — `path[from]`. */
  a: Point;
  /** Where the run ends — `path[to + 1]`. */
  b: Point;
}

/** Signed angle difference wrapped into (-PI, PI]. */
function angleDelta(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Split a road into its straight runs. See {@link RoadStretch}.
 *
 * `minTurn` is in radians; the default (~14 degrees) is loose enough to absorb a
 * waypoint dropped on a straight run and tight enough that any turn a player
 * would call a corner splits the road.
 */
export function roadStretches(path: Point[], minTurn = 0.25): RoadStretch[] {
  const segs = path.length - 1;
  if (segs <= 0) return [];

  const out: RoadStretch[] = [];
  let from = 0;
  let heading = Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x);

  for (let i = 1; i < segs; i++) {
    const dx = path[i + 1].x - path[i].x;
    const dy = path[i + 1].y - path[i].y;
    // A zero-length segment has no heading of its own; it belongs to whatever
    // run it sits in rather than starting a phantom bend.
    if (dx === 0 && dy === 0) continue;
    const h = Math.atan2(dy, dx);
    if (Math.abs(angleDelta(heading, h)) >= minTurn) {
      out.push({ from, to: i - 1, a: path[from], b: path[i] });
      from = i;
      heading = h;
    }
  }
  out.push({ from, to: segs - 1, a: path[from], b: path[segs] });
  return out;
}

/** The stretch holding segment `seg`, or `-1` if it is off the road. */
export function stretchAt(stretches: RoadStretch[], seg: number): number {
  for (let i = 0; i < stretches.length; i++) {
    if (seg >= stretches[i].from && seg <= stretches[i].to) return i;
  }
  return -1;
}

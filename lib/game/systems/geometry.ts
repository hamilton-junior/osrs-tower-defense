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

/**
 * Whether `(x, y)` is far enough from every path segment and existing tower
 * to host a new tower. `towers` only needs `x`/`y`, so any placed entity works.
 */
export function isValidPlacement(
  x: number,
  y: number,
  path: Point[],
  towers: ReadonlyArray<{ x: number; y: number }>,
  pathClearance = 40, // pathWidth (25) + tower radius (15)
  towerClearance = 30, // two tower radii
): boolean {
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

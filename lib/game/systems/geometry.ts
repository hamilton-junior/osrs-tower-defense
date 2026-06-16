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

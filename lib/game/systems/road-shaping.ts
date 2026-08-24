/**
 * **Shaping the road** — the player's half of the map generator.
 *
 * The road is a polyline of axis-aligned legs (see `map-generation.ts`: every
 * archetype is built from horizontal and vertical runs, and the dihedral
 * orientation applied on top is an isometry, so it stays axis-aligned). That is the
 * whole reason this mechanic can exist cheaply: a *leg* — one straight stretch —
 * can be shoved one tile sideways by moving its two endpoints together, and the
 * road remains a legal orthogonal polyline. No pathfinder, no grid rewrite, and
 * enemies keep walking the same `pathIndex` polyline they always did.
 *
 * What the shove is worth depends on the shape it sits in, and that is the whole
 * decision:
 *
 * - a leg with both neighbours on the same side (the top of a serpentine's U)
 *   pushed **outward** stretches both neighbours: **+2 tiles** of road, which is
 *   two more tiles of walking under fire;
 * - a staircase step moved sideways lengthens one neighbour and shortens the
 *   other: **±0 tiles**, but it re-cuts the board — different ground opens up to
 *   build on, and towers that could not reach the road now can;
 * - the same U pushed **inward** is −2 tiles, which is a bad move the player is
 *   still allowed to make, because that is what makes it an undo.
 *
 * Everything here is pure so the legality rules are testable: the engine owns the
 * gold, the road and the UI, and asks this module what is allowed.
 */

import type { Point } from '../types';
import { pathTotalLength, pointToSegmentDistance } from './geometry';

/** Which way a leg is being shoved. Always perpendicular to the leg itself —
 *  a parallel shove would slide it along its own line and bend its neighbours
 *  into diagonals. */
export type BendDir = 'up' | 'down' | 'left' | 'right';

/** One legal shove, ready to be drawn as an arrow and paid for. */
export interface RoadMove {
  /** The leg is the segment `seg → seg + 1` of the current path. */
  seg: number;
  dir: BendDir;
  /** Midpoint of the leg *after* the shove — where the arrow points. */
  x: number;
  y: number;
  /** Road length change in tiles: +2, 0 or −2. The reason to pick one arrow
   *  over another, so the UI shows it rather than explaining it. */
  deltaTiles: number;
}

export interface RoadContext {
  grid: number;
  width: number;
  height: number;
  /** Anything with a position — towers. A shove that would run the road over one
   *  is refused; the alternative is a tower stranded in the middle of the road. */
  towers: ReadonlyArray<{ x: number; y: number }>;
  /** The run's terrain, so the road cannot be shoved into a boulder. */
  isBlockedTile?: (x: number, y: number) => boolean;
}

/** Clearance the road keeps from a tower, in px — the same figure
 *  `isValidPlacement` uses to stop a tower being built on the road, applied from
 *  the other side. */
export const ROAD_TOWER_CLEARANCE = 40;
/** Minimum separation between two legs that are not neighbours, in tiles. Without
 *  it a shove could press two parallel legs together until there is no room to
 *  build between them — or fuse them into one road. */
export const ROAD_LEG_GAP_TILES = 2;

const DIR_OFFSET: Record<BendDir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Whether a leg runs horizontally or vertically — `null` for anything else, which
 * covers both a zero-length segment and the diagonal this module refuses to create.
 */
export function legAxis(path: readonly Point[], seg: number): 'h' | 'v' | null {
  const a = path[seg];
  const b = path[seg + 1];
  if (!a || !b) return null;
  if (a.y === b.y && a.x !== b.x) return 'h';
  if (a.x === b.x && a.y !== b.y) return 'v';
  return null;
}

/**
 * Which legs the player may shove.
 *
 * The two ends of the path are off-board stubs that carry the portal and the exit,
 * so the outermost legs stay put — their endpoints are what {@link fixStubs} reads
 * to keep the stubs square to their border.
 */
export function movableLegs(path: readonly Point[]): number[] {
  const out: number[] = [];
  for (let i = 1; i <= path.length - 3; i++) {
    if (legAxis(path, i) !== null) out.push(i);
  }
  return out;
}

/**
 * Re-square the two off-board stubs against the (possibly moved) first and last
 * interior waypoints.
 *
 * A stub differs from its neighbour on exactly one axis — that axis is the border
 * it runs off — so the *other* coordinate simply follows the waypoint. Reading the
 * edge off the existing geometry rather than being told it keeps this module
 * independent of `MapEdge`.
 */
function fixStubs(next: Point[], original: readonly Point[]): void {
  const last = next.length - 1;
  if (last < 2) return;
  if (original[0].x !== original[1].x) next[0] = { x: next[0].x, y: next[1].y };
  else next[0] = { x: next[1].x, y: next[0].y };
  if (original[last].x !== original[last - 1].x) next[last] = { x: next[last].x, y: next[last - 1].y };
  else next[last] = { x: next[last - 1].x, y: next[last].y };
}

/**
 * The path that shoving leg `seg` one tile `dir` would produce — geometry only,
 * with no view on whether it is a *legal* road. `null` when the leg is not a
 * straight run, or the shove is along the leg rather than across it.
 */
export function shovedPath(
  path: readonly Point[],
  seg: number,
  dir: BendDir,
  grid: number,
): Point[] | null {
  const axis = legAxis(path, seg);
  if (axis === null) return null;
  const off = DIR_OFFSET[dir];
  // Perpendicular only: a horizontal leg moves in y, a vertical leg in x.
  if (axis === 'h' && off.dy === 0) return null;
  if (axis === 'v' && off.dx === 0) return null;

  const next = path.map(p => ({ x: p.x, y: p.y }));
  for (const i of [seg, seg + 1]) {
    next[i] = { x: next[i].x + off.dx * grid, y: next[i].y + off.dy * grid };
  }
  fixStubs(next, path);
  return next;
}

/** Shortest distance between two segments. Zero when they cross, so a legality
 *  check can treat "touching" and "overlapping" as the same failure. */
function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const d1 = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (d1 !== 0) {
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / d1;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / d1;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0; // they cross
  }
  return Math.min(
    pointToSegmentDistance(a.x, a.y, c, d),
    pointToSegmentDistance(b.x, b.y, c, d),
    pointToSegmentDistance(c.x, c.y, a, b),
    pointToSegmentDistance(d.x, d.y, a, b),
  );
}

/** Walk a segment at half-tile steps, asking the terrain about each sample. Half a
 *  tile is fine enough that no whole obstacle tile can hide between two samples. */
function crossesBlocked(a: Point, b: Point, ctx: RoadContext): boolean {
  if (!ctx.isBlockedTile) return false;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(len / (ctx.grid / 2)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (ctx.isBlockedTile(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return true;
  }
  return false;
}

/**
 * Is the shoved road a road the game can still be played on?
 *
 * The three segments the shove touches (the leg and the two that hinge off it) are
 * the only ones that can have broken anything, so they are the only ones checked —
 * checking the whole path would also re-judge geometry the generator produced,
 * and a map that was born a tile tight would then refuse every shove forever.
 */
export function isShoveLegal(path: readonly Point[], next: readonly Point[], ctx: RoadContext, seg: number): boolean {
  const { grid, width, height } = ctx;
  if (next.length !== path.length) return false;

  // Stay on the board, a tile in from the edge, so the road never runs off the
  // side of the world or hugs it too tightly to build beside.
  for (const i of [seg, seg + 1]) {
    const p = next[i];
    if (p.x < grid || p.x > width - grid || p.y < grid || p.y > height - grid) return false;
  }

  // Touched segments: the leg plus its two hinges, clipped to what exists.
  const touched: number[] = [];
  for (let i = seg - 1; i <= seg + 1; i++) if (i >= 0 && i < next.length - 1) touched.push(i);

  for (const i of touched) {
    const a = next[i];
    const b = next[i + 1];
    // A hinge collapsing to nothing means the leg has swallowed its neighbour —
    // the road would lose a turn, and a shove must never redraw the map's shape.
    if (a.x === b.x && a.y === b.y) return false;
    if (crossesBlocked(a, b, ctx)) return false;
    for (const t of ctx.towers) {
      if (pointToSegmentDistance(t.x, t.y, a, b) < ROAD_TOWER_CLEARANCE) return false;
    }
    // Keep room between legs that are not neighbours: two apart or more, so the
    // build lane between them survives.
    for (let j = 0; j < next.length - 1; j++) {
      if (Math.abs(j - i) <= 1) continue;
      if (segmentDistance(a, b, next[j], next[j + 1]) < ROAD_LEG_GAP_TILES * grid) return false;
    }
  }
  return true;
}

/**
 * Every shove the player could pay for right now, with what each is worth. Legs
 * usually offer both directions; the rules above quietly drop the ones that would
 * run over a tower, a boulder or another leg.
 */
export function roadMoveOptions(path: readonly Point[], ctx: RoadContext): RoadMove[] {
  const out: RoadMove[] = [];
  const before = pathTotalLength(path);
  for (const seg of movableLegs(path)) {
    const dirs: BendDir[] = legAxis(path, seg) === 'h' ? ['up', 'down'] : ['left', 'right'];
    for (const dir of dirs) {
      const next = shovedPath(path, seg, dir, ctx.grid);
      if (!next || !isShoveLegal(path, next, ctx, seg)) continue;
      const a = next[seg];
      const b = next[seg + 1];
      out.push({
        seg,
        dir,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        deltaTiles: Math.round((pathTotalLength(next) - before) / ctx.grid),
      });
    }
  }
  return out;
}

/**
 * What the next shove costs, given how many have been bought this run.
 *
 * It climbs steeply on purpose. One or two shoves are a shaping decision the player
 * makes early and lives with; a tenth would be a treadmill, and a road stretched
 * without limit is the mazing this game deliberately does not have.
 */
export function roadBendCost(bought: number): number {
  return Math.round((120 * Math.pow(1.55, Math.max(0, bought))) / 10) * 10;
}

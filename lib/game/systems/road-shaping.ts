/**
 * **Shaping the road** — the player's half of the map generator.
 *
 * The road is a polyline of axis-aligned legs (see `map-generation.ts`: every
 * archetype is built from horizontal and vertical runs, and the dihedral orientation
 * applied on top is an isometry, so it stays axis-aligned). That is the whole reason
 * this mechanic can exist cheaply: the road can be re-cut with pure geometry, no
 * pathfinder and no grid rewrite, and enemies keep walking the same `pathIndex`
 * polyline they always did.
 *
 * What the player buys is a **notch**: one tile of road pulled a tile aside, with the
 * road stepping out to meet it and stepping straight back — a little detour around a
 * single square, not a whole stretch of road sliding sideways. It is worth **+2 tiles**
 * of walking every time (the step out and the step back), and it is always local: the
 * leg keeps both its ends, so nothing else on the map moves and a second notch further
 * along the same leg is still on the table.
 *
 * A notch can also be **taken back**. The gold is spent for good — the digging was done
 * — but the run is one modification lighter, so the *next* notch is priced as if this
 * one had never been bought. That is what makes the arrows safe to press.
 *
 * Everything here is pure so the rules are testable: the engine owns the gold, the road
 * and the interface, and asks this module what is allowed.
 */

import type { Point } from '../types';
import { pointToSegmentDistance } from './geometry';

/** Which way a tile is being pulled. Always perpendicular to the leg it sits on — a
 *  parallel pull would slide it along its own line and bend the road into diagonals. */
export type BendDir = 'up' | 'down' | 'left' | 'right';

/** One notch the player owns: the road tile that was pulled, and the way it went.
 *  Stored in board pixels rather than as a leg index, because a leg's index shifts as
 *  soon as another notch is cut into the road ahead of it — a position does not. */
export interface RoadNotch {
  x: number;
  y: number;
  dir: BendDir;
}

/** One legal pull of one tile, ready to be drawn as an arrow and paid for. */
export interface RoadMove {
  dir: BendDir;
  /** Where the tile would land — where the arrow points. */
  x: number;
  y: number;
  /** Road length change in tiles. Always +2: out and back. Shown rather than
   *  explained, the way the arrows have always shown theirs. */
  deltaTiles: number;
}

/** A road tile the player may pull, snapped to the road's own lattice. */
export interface RoadTile {
  /** The leg it sits on — segment `seg -> seg + 1` of the current path. */
  seg: number;
  x: number;
  y: number;
}

export interface RoadContext {
  grid: number;
  width: number;
  height: number;
  /** Anything with a position — towers. A notch that would run the road over one is
   *  refused; the alternative is a tower stranded in the middle of the road. */
  towers: ReadonlyArray<{ x: number; y: number }>;
  /** The run's terrain, so the road cannot be notched into a boulder. */
  isBlockedTile?: (x: number, y: number) => boolean;
}

/** Clearance the road keeps from a tower, in px — the same figure `isValidPlacement`
 *  uses to stop a tower being built on the road, applied from the other side. */
export const ROAD_TOWER_CLEARANCE = 40;
/** Minimum separation between two legs that are not neighbours, in tiles. Without it a
 *  notch could press two parallel legs together until there is no room to build
 *  between them — or fuse them into one road. */
export const ROAD_LEG_GAP_TILES = 2;
/** How far from a corner a notch has to stay, in tiles. The detour is three tiles wide,
 *  so a tile any closer would put one of its own corners on top of the leg's corner and
 *  quietly delete a turn. */
export const NOTCH_END_MARGIN_TILES = 2;

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
 * Which legs a notch may be cut into.
 *
 * The two ends of the path are off-board stubs carrying the portal and the exit, so
 * they stay put — a notch in a stub would be dug outside the world.
 */
export function notchableLegs(path: readonly Point[]): number[] {
  const out: number[] = [];
  for (let i = 1; i <= path.length - 3; i++) {
    if (legAxis(path, i) !== null) out.push(i);
  }
  return out;
}

/** Where the raised tile of a notch sits — the square the road was pulled onto, and
 *  the handle that takes it back. */
export function notchHead(n: RoadNotch, grid: number): Point {
  const off = DIR_OFFSET[n.dir];
  return { x: n.x + off.dx * grid, y: n.y + off.dy * grid };
}

/**
 * The road tile under a point, snapped to the road's own lattice — or `null` if the
 * point is off the road, on a stub, or too near a corner to notch.
 */
export function roadTileAt(path: readonly Point[], x: number, y: number, grid: number): RoadTile | null {
  for (const seg of notchableLegs(path)) {
    const a = path[seg];
    const b = path[seg + 1];
    const horizontal = a.y === b.y;
    const across = horizontal ? y - a.y : x - a.x;
    if (Math.abs(across) > grid / 2) continue;
    const along = horizontal ? x : y;
    const lo = Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y);
    const hi = Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y);
    // Snap onto the lattice the road's own waypoints sit on.
    const snapped = lo + Math.round((along - lo) / grid) * grid;
    const margin = NOTCH_END_MARGIN_TILES * grid;
    if (snapped < lo + margin || snapped > hi - margin) continue;
    return horizontal ? { seg, x: snapped, y: a.y } : { seg, x: a.x, y: snapped };
  }
  return null;
}

/** Which leg a notch belongs to on this path, or -1 when it no longer fits one. */
function segForNotch(path: readonly Point[], n: RoadNotch, grid: number): number {
  const tile = roadTileAt(path, n.x, n.y, grid);
  if (!tile || tile.x !== n.x || tile.y !== n.y) return -1;
  const axis = legAxis(path, tile.seg);
  const off = DIR_OFFSET[n.dir];
  // Perpendicular only: a horizontal leg is pulled in y, a vertical leg in x.
  if (axis === 'h' && off.dy === 0) return -1;
  if (axis === 'v' && off.dx === 0) return -1;
  return tile.seg;
}

/**
 * The path one notch would produce — geometry only, with no view on whether it is a
 * *legal* road. `null` when the tile is not on a notchable leg, or the pull runs along
 * the leg rather than across it.
 *
 * Four waypoints go in and none come out: the leg becomes `A -> near -> out -> back ->
 * far -> B`, a three-tile-wide detour whose middle square is the one that was pulled.
 */
export function notchedPath(path: readonly Point[], n: RoadNotch, grid: number): Point[] | null {
  const seg = segForNotch(path, n, grid);
  if (seg < 0) return null;
  const a = path[seg];
  const b = path[seg + 1];
  const off = DIR_OFFSET[n.dir];
  // Along the leg, pointing from A to B: the two shoulders sit one tile either side.
  const ux = a.y === b.y ? Math.sign(b.x - a.x) : 0;
  const uy = a.y === b.y ? 0 : Math.sign(b.y - a.y);
  const near = { x: n.x - ux * grid, y: n.y - uy * grid };
  const far = { x: n.x + ux * grid, y: n.y + uy * grid };
  const out = { x: near.x + off.dx * grid, y: near.y + off.dy * grid };
  const back = { x: far.x + off.dx * grid, y: far.y + off.dy * grid };

  const next = path.map(p => ({ x: p.x, y: p.y }));
  next.splice(seg + 1, 0, near, out, back, far);
  return next;
}

/** Shortest distance between two segments. Zero when they cross, so a legality check
 *  can treat "touching" and "overlapping" as the same failure. */
function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (denom !== 0) {
    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0; // they cross
  }
  return Math.min(
    pointToSegmentDistance(a.x, a.y, c, d),
    pointToSegmentDistance(b.x, b.y, c, d),
    pointToSegmentDistance(c.x, c.y, a, b),
    pointToSegmentDistance(d.x, d.y, a, b),
  );
}

/** Walk a segment at half-tile steps, asking the terrain about each sample. Half a tile
 *  is fine enough that no whole obstacle tile can hide between two samples. */
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
 * Is the notched road a road the game can still be played on?
 *
 * Only the detour itself can have broken anything, so it is the only stretch checked —
 * judging the whole path would also re-judge geometry the generator produced, and a map
 * that was born a tile tight would then refuse every notch forever. `seg` is where the
 * detour starts: the five segments `seg … seg + 4`.
 */
export function isNotchLegal(next: readonly Point[], ctx: RoadContext, seg: number): boolean {
  const { grid, width, height } = ctx;
  const last = seg + 4;

  // The detour stays on the board, a tile in from the edge, so the road never runs off
  // the side of the world or hugs it too tightly to build beside.
  for (let i = seg + 1; i <= last; i++) {
    const p = next[i];
    if (!p) return false;
    if (p.x < grid || p.x > width - grid || p.y < grid || p.y > height - grid) return false;
  }

  for (let i = seg; i <= last; i++) {
    const a = next[i];
    const b = next[i + 1];
    if (!a || !b) return false;
    if (a.x === b.x && a.y === b.y) return false;
    if (crossesBlocked(a, b, ctx)) return false;
    for (const t of ctx.towers) {
      if (pointToSegmentDistance(t.x, t.y, a, b) < ROAD_TOWER_CLEARANCE) return false;
    }
    // Keep room between the detour and the rest of the road. Only the three segments
    // that step off the leg are asked: the two stubs at either end still lie *on* the
    // leg, exactly where the road already ran, so they cannot press against anything
    // that was not already being pressed. Asking them would also make a leg refuse a
    // second notch forever — a stub on the leg is always one tile from the crossbar of
    // the detour beside it, by construction.
    if (i > seg && i < last) {
      for (let j = 0; j < next.length - 1; j++) {
        if (j >= seg && j <= last) continue;
        if (Math.abs(j - i) <= 1) continue;
        if (segmentDistance(a, b, next[j], next[j + 1]) < ROAD_LEG_GAP_TILES * grid) return false;
      }
    }
  }
  return true;
}

/** Both ways one road tile could be pulled, minus the ones the rules refuse. */
export function notchOptions(path: readonly Point[], tile: RoadTile, ctx: RoadContext): RoadMove[] {
  const axis = legAxis(path, tile.seg);
  if (axis === null) return [];
  const dirs: BendDir[] = axis === 'h' ? ['up', 'down'] : ['left', 'right'];
  const out: RoadMove[] = [];
  for (const dir of dirs) {
    const notch: RoadNotch = { x: tile.x, y: tile.y, dir };
    const next = notchedPath(path, notch, ctx.grid);
    if (!next || !isNotchLegal(next, ctx, tile.seg)) continue;
    const head = notchHead(notch, ctx.grid);
    out.push({ dir, x: head.x, y: head.y, deltaTiles: 2 });
  }
  return out;
}

/**
 * Fold every notch the player owns onto the road the generator dealt.
 *
 * Notches are stored by position, and each one keeps clear of every other, so they
 * never depend on one another: the order is only the order they were bought in, and
 * dropping one from the middle leaves the rest exactly where they were. A notch that no
 * longer finds its leg — a save from a road that has since changed shape — is quietly
 * skipped rather than dragging the road with it.
 */
export function applyNotches(base: readonly Point[], notches: readonly RoadNotch[], grid: number): Point[] {
  let path: Point[] = base.map(p => ({ x: p.x, y: p.y }));
  for (const n of notches) {
    const next = notchedPath(path, n, grid);
    if (next) path = next;
  }
  return path;
}

/** The notch whose raised tile is under a point, or -1. This is the undo handle:
 *  clicking the square the road was pulled onto is how it goes back. */
export function notchAt(notches: readonly RoadNotch[], x: number, y: number, grid: number): number {
  for (let i = 0; i < notches.length; i++) {
    const head = notchHead(notches[i], grid);
    if (Math.abs(head.x - x) <= grid / 2 && Math.abs(head.y - y) <= grid / 2) return i;
  }
  return -1;
}

/**
 * What the next notch costs, given how many the player is currently keeping.
 *
 * It climbs steeply on purpose. One or two notches are a shaping decision made early
 * and lived with; a tenth would be a treadmill, and a road stretched without limit is
 * the mazing this game deliberately does not have. Taking one back lowers the count, so
 * the price is always the price of the notch the player is *about to own* — never a
 * tally of everything they ever tried.
 */
export function roadBendCost(bought: number): number {
  return Math.round((120 * Math.pow(1.55, Math.max(0, bought))) / 10) * 10;
}

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
 * What the player buys is a **notch**: one tile of road pulled aside, with the road
 * stepping out to meet it and stepping straight back — a little detour around a single
 * square, not a whole stretch of road sliding sideways. It is always local: the leg
 * keeps both its ends, so nothing else on the map moves and a second notch further
 * along the same leg is still on the table.
 *
 * A notch has a **depth**: how many tiles out it has been pulled. Every step costs a
 * notch's worth of gold and adds **+2 tiles** of walking (the step out and the step
 * back), and the same square can be pulled again and again — the detour just reaches
 * further, and it is refused the moment it would come within a tile of the rest of the
 * road, a tower, the scenery or the edge of the board. Depth is carried on the notch
 * rather than stacked as notches-on-notches, so every detour stays anchored to a square
 * of the road the generator dealt and the folding never depends on order.
 *
 * A notch can also be **pulled back in**, a tile at a time, until the road is flat
 * again. The gold is spent for good — the digging was done — but the run is one
 * modification lighter, so the *next* step out is priced as if this one had never been
 * bought. That is what makes the arrows safe to press.
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
  /** How many tiles out the road has been pulled here — at least 1. Deepening an
   *  existing notch rather than cutting a new one beside it is what lets the same
   *  square be adjusted over and over without the detours ever nesting. */
  depth: number;
}

/** One legal step of one tile, ready to be drawn as an arrow and paid for. */
export interface RoadMove {
  /** Where the arrow points — the way the square itself would travel. Coming back in
   *  that is the *opposite* of the side the detour is on, which is why it is not the
   *  thing to store on the notch: see {@link RoadMove.side}. */
  dir: BendDir;
  /** Which side of the road the detour is left on afterwards. The same as {@link
   *  RoadMove.dir} while digging out, and its opposite while filling back in — a
   *  retreat walks the square *back* towards the road without ever changing the side
   *  it was pulled to. Meaningless at depth 0, where there is no detour left. */
  side: BendDir;
  /** Where the tile would land — where the arrow points. */
  x: number;
  y: number;
  /** Road length change in tiles: +2 stepping out, −2 coming back in. Shown rather
   *  than explained, the way the arrows have always shown theirs. */
  deltaTiles: number;
  /** The depth the notch would be left at — 0 when the road goes flat again. */
  depth: number;
  /** Whether this step costs gold. Moving away from the road the seed dealt does;
   *  moving back towards it never does, so a player can always retreat out of a shape
   *  they regret. */
  digs: boolean;
  /** For a stretch being slid, the leg it is — so the engine can tell two arrows of
   *  the same compass direction on two different stretches apart. */
  seg?: number;
}

/** A road tile the player may pull, snapped to the road's own lattice. */
export interface RoadTile {
  /** The leg it sits on — segment `seg -> seg + 1` of the current path. */
  seg: number;
  x: number;
  y: number;
}

/**
 * What the player has picked up: one square, whether it is still flat road or a notch
 * already dug. The two cases differ only in where the grip sits and which arrows are on
 * offer, so the interface handles them as one thing.
 */
export interface RoadGrab {
  /** What is in hand: a single square being pulled aside, or a whole stretch of road
   *  being slid across. The two are the same gesture with different geometry behind
   *  them, so the interface carries them in one shape. */
  kind: 'notch' | 'leg';
  /** For a `leg` grab, which stretch of the generator's road is in hand — its leg
   *  index into the base path, which no amount of shaping ever renumbers. −1 for a
   *  notch grab. */
  seg: number;
  /** The square of the generator's road the detour is anchored to — where filling it
   *  back in returns to. */
  x: number;
  y: number;
  /** Where the grip sits: the anchor while the road is still flat, the raised tile at
   *  the far end of the detour once it has been pulled. */
  hx: number;
  hy: number;
  /** Tiles it is already pulled out. 0 while the square is still flat road. */
  depth: number;
  /** The way it is already pulled — `null` at depth 0, where both sides are open. */
  dir: BendDir | null;
  /** Which way the leg underneath runs, so depth 0 knows its two perpendicular sides. */
  axis: 'h' | 'v';
  /** Its place in the player's notch list, or −1 while the square is still flat road. */
  index: number;
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

/** The way back in, for the arrow that fills a notch a tile at a time. */
const OPPOSITE: Record<BendDir, BendDir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
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
  const d = notchDepth(n);
  return { x: n.x + off.dx * grid * d, y: n.y + off.dy * grid * d };
}

/** A notch's depth, defended against a save written before depth existed and against
 *  anything that would fold the detour back onto its own anchor. */
function notchDepth(n: RoadNotch): number {
  return Math.max(1, Math.round(n.depth || 1));
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
 * Four waypoints go in and none come out, however deep the notch: the leg becomes
 * `A -> near -> out -> back -> far -> B`, a three-tile-wide detour reaching `depth`
 * tiles off the leg, hinged on the square that was pulled.
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
  const d = notchDepth(n);
  const near = { x: n.x - ux * grid, y: n.y - uy * grid };
  const far = { x: n.x + ux * grid, y: n.y + uy * grid };
  const out = { x: near.x + off.dx * grid * d, y: near.y + off.dy * grid * d };
  const back = { x: far.x + off.dx * grid * d, y: far.y + off.dy * grid * d };

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

/**
 * The square under a point, ready to be pulled: a notch already dug if the point is on
 * its raised tile, otherwise a flat square of road.
 *
 * A notch is asked about first. Its raised tile is road like any other now, so it would
 * also answer to {@link roadTileAt} — but what a player wants from a square they have
 * already dug is to dig it further or fill it in, never to start a second detour off the
 * side of the first.
 */
export function roadGrabAt(
  path: readonly Point[],
  notches: readonly RoadNotch[],
  x: number,
  y: number,
  grid: number,
): RoadGrab | null {
  const i = notchAt(notches, x, y, grid);
  if (i >= 0) {
    const n = notches[i];
    const head = notchHead(n, grid);
    const axis: 'h' | 'v' = n.dir === 'up' || n.dir === 'down' ? 'h' : 'v';
    return { kind: 'notch', seg: -1, x: n.x, y: n.y, hx: head.x, hy: head.y, depth: notchDepth(n), dir: n.dir, axis, index: i };
  }
  const tile = roadTileAt(path, x, y, grid);
  if (!tile) return null;
  const axis = legAxis(path, tile.seg);
  if (axis === null) return null;
  return { kind: 'notch', seg: -1, x: tile.x, y: tile.y, hx: tile.x, hy: tile.y, depth: 0, dir: null, axis, index: -1 };
}

/** Fold every notch but one onto the base road, then fold that one last — so the leg it
 *  lands on, and therefore the stretch legality has to judge, is known exactly. Order
 *  never changes the road that comes out, only which notch's index is being reported. */
function foldLast(
  base: readonly Point[],
  notches: readonly RoadNotch[],
  target: RoadNotch,
  grid: number,
): { path: Point[]; seg: number } | null {
  const others = notches.filter(n => n.x !== target.x || n.y !== target.y);
  const path = applyNotches(base, others, grid);
  const seg = segForNotch(path, target, grid);
  if (seg < 0) return null;
  const next = notchedPath(path, target, grid);
  return next ? { path: next, seg } : null;
}

/**
 * Every step the square in hand could take: further out, and — once it has been dug —
 * back in.
 *
 * Stepping out is judged in full, against the road as it would actually be laid, so a
 * deep notch is refused the moment it would crowd anything. Stepping back in never is:
 * the shallower detour lies entirely on ground the deeper one already covered, and no
 * tower can be standing there, because the tile a notch is pulled away from is always
 * within a tower's clearance of the detour's own two sides. Retreating is therefore
 * always safe, which is the whole point — a player can never dig themselves into a
 * shape they cannot get out of.
 */
export function shapeOptions(
  base: readonly Point[],
  notches: readonly RoadNotch[],
  grab: RoadGrab,
  ctx: RoadContext,
): RoadMove[] {
  const { grid } = ctx;
  const out: RoadMove[] = [];

  if (grab.depth === 0) {
    const dirs: BendDir[] = grab.axis === 'h' ? ['up', 'down'] : ['left', 'right'];
    for (const dir of dirs) {
      const target: RoadNotch = { x: grab.x, y: grab.y, dir, depth: 1 };
      const folded = foldLast(base, notches, target, grid);
      if (!folded || !isNotchLegal(folded.path, ctx, folded.seg)) continue;
      const head = notchHead(target, grid);
      out.push({ dir, side: dir, x: head.x, y: head.y, deltaTiles: 2, depth: 1, digs: true });
    }
    return out;
  }

  const dir = grab.dir!;
  const deeper: RoadNotch = { x: grab.x, y: grab.y, dir, depth: grab.depth + 1 };
  const folded = foldLast(base, notches, deeper, grid);
  if (folded && isNotchLegal(folded.path, ctx, folded.seg)) {
    const head = notchHead(deeper, grid);
    out.push({ dir, side: dir, x: head.x, y: head.y, deltaTiles: 2, depth: deeper.depth, digs: true });
  }

  const back = grab.depth - 1;
  const off = DIR_OFFSET[dir];
  out.push({
    dir: OPPOSITE[dir],
    side: dir,
    x: grab.x + off.dx * grid * back,
    y: grab.y + off.dy * grid * back,
    deltaTiles: -2,
    depth: back,
    digs: false,
  });
  return out;
}

/**
 * Fold every notch the player owns onto the road the generator dealt.
 *
 * Notches are stored by position and depth, each anchored to a square of the road the
 * generator dealt, and each keeps clear of every other — so they never depend on one
 * another: the order is only the order they were bought in, and dropping one from the
 * middle, or shaving a tile off its depth, leaves the rest exactly where they were. A
 * notch that no longer finds its leg — a save from a road that has since changed shape
 * — is quietly skipped rather than dragging the road with it.
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
 * It climbs steeply on purpose. One or two steps are a shaping decision made early and
 * lived with; a tenth would be a treadmill, and a road stretched without limit is the
 * mazing this game deliberately does not have. `bought` counts *tiles* of digging, not
 * notches, so pulling one square out three times costs exactly what pulling three
 * squares out once would. Filling one back in lowers the count, so the price is always
 * the price of the step the player is *about to take* — never a tally of everything they
 * ever tried.
 */
export function roadBendCost(bought: number): number {
  return Math.round((120 * Math.pow(1.55, Math.max(0, bought))) / 10) * 10;
}

// ─────────────────────────── sliding a stretch of road ──────────────────────
//
// A notch answers "I want the road to go *around* this square". The other half of
// editing a road is "I want this whole stretch to run one tile over" — the question a
// player asks at a **bend**, where a notch is refused because its three-tile detour
// would land on the corner and quietly delete a turn.
//
// So the tiles a notch will not take — the ones within {@link NOTCH_END_MARGIN_TILES}
// of either end of a stretch — carry the other handle instead, and between them the two
// gestures cover every square of road on the board.
//
// Sliding is not a second kind of detour: it moves the leg itself, across its own run,
// and the two stretches it hangs off simply grow and shrink to meet it. That is why it
// stays orthogonal with no pathfinder — a leg only ever slides *along* the axis its
// neighbours already run on. And it is why sliding is the only thing here that can
// **remove** a bend: push a leg until the stretch beside it is squeezed out of
// existence and the two turns at its ends cancel, leaving one straight run where the
// road used to jog. Sliding back re-cuts them.

/** One stretch of the generator's road, slid across itself.
 *
 *  Held against the **base** path — the road the seed dealt — because that is the one
 *  numbering nothing renumbers: notches splice waypoints in, squeezed-out stretches take
 *  waypoints away, but base leg 7 is base leg 7 for the whole run. Offsets are in whole
 *  tiles and signed, so pushing a stretch out and easing it back are the same arithmetic
 *  and a stretch at (0, 0) is simply not in the list. */
export interface RoadShift {
  /** Leg `seg -> seg + 1` of the base path. */
  seg: number;
  /** Tiles moved, signed. Only the axis across the leg is ever non-zero. */
  dx: number;
  dy: number;
}

/** How far a stretch has been slid, or (0, 0) if it has not been. */
export function shiftOffset(shifts: readonly RoadShift[], seg: number): { dx: number; dy: number } {
  const s = shifts.find(v => v.seg === seg);
  return s ? { dx: Math.round(s.dx), dy: Math.round(s.dy) } : { dx: 0, dy: 0 };
}

/** Tiles of road the player is currently keeping moved — what the price climbs on,
 *  alongside the tiles they have dug. Easing a stretch back lowers it again. */
export function shiftTiles(shifts: readonly RoadShift[]): number {
  return shifts.reduce((sum, s) => sum + Math.abs(Math.round(s.dx)) + Math.abs(Math.round(s.dy)), 0);
}

/** The list with one stretch's offset replaced. A stretch back at (0, 0) drops out
 *  entirely, so "not slid" has exactly one representation. */
export function withShift(shifts: readonly RoadShift[], next: RoadShift): RoadShift[] {
  const out = shifts.filter(s => s.seg !== next.seg).map(s => ({ ...s }));
  if (next.dx !== 0 || next.dy !== 0) out.push({ ...next });
  return out;
}

/** The list with one stretch nudged a tile the given way. */
export function shiftedBy(shifts: readonly RoadShift[], seg: number, dir: BendDir): RoadShift[] {
  const cur = shiftOffset(shifts, seg);
  const off = DIR_OFFSET[dir];
  return withShift(shifts, { seg, dx: cur.dx + off.dx, dy: cur.dy + off.dy });
}

/** Move every slid leg, and let the off-board stubs follow the waypoints they hang
 *  off. No waypoint is added or removed here: this is the road mid-slide, before the
 *  turns that cancelled have been taken out of it. */
function translateLegs(base: readonly Point[], shifts: readonly RoadShift[], grid: number): Point[] {
  const pts = base.map(p => ({ x: p.x, y: p.y }));
  const legs = new Set(notchableLegs(base));
  for (const s of shifts) {
    if (!legs.has(s.seg)) continue;
    const axis = legAxis(base, s.seg);
    // Across the leg only: sliding one along its own line would just renumber its tiles.
    const dx = (axis === 'v' ? Math.round(s.dx) : 0) * grid;
    const dy = (axis === 'h' ? Math.round(s.dy) : 0) * grid;
    for (const i of [s.seg, s.seg + 1]) {
      pts[i].x += dx;
      pts[i].y += dy;
    }
  }
  followStub(base, pts, 0, 1);
  followStub(base, pts, base.length - 1, base.length - 2);
  return pts;
}

/** The entry and exit stubs run off the board perpendicular to their border, so they
 *  are not stretches anyone can slide — but when the waypoint one hangs off moves
 *  sideways, the stub goes with it rather than turning into a diagonal. */
function followStub(base: readonly Point[], pts: Point[], end: number, inner: number) {
  if (!base[end] || !base[inner]) return;
  if (base[end].y === base[inner].y) pts[end].y = pts[inner].y;
  else if (base[end].x === base[inner].x) pts[end].x = pts[inner].x;
}

/** Which waypoints a set of slides is allowed to fold away: the ends of every leg that
 *  moved, and the ones just beyond them. Everywhere else the road is exactly as the
 *  generator drew it, and folding a waypoint there would silently redraw a map nobody
 *  touched — including, on most orientations, the redundant corner where the entry stub
 *  meets the first leg. */
function touchedPoints(base: readonly Point[], shifts: readonly RoadShift[]): Set<number> {
  const out = new Set<number>();
  const legs = new Set(notchableLegs(base));
  for (const s of shifts) {
    if (!legs.has(s.seg) || (s.dx === 0 && s.dy === 0)) continue;
    for (const i of [s.seg - 1, s.seg, s.seg + 1, s.seg + 2]) {
      if (i >= 0 && i < base.length) out.add(i);
    }
  }
  return out;
}

/**
 * Tidy a mid-slide road into one the game can be played on: drop the stretches squeezed
 * to nothing, and merge the pair of turns their ends leave behind into the straight run
 * they have become. `null` when the result is not a road at all — a stretch folded back
 * over itself, or a fold that would need a waypoint the slides are not allowed to touch.
 *
 * `orig` reports where each surviving waypoint came from, so a caller can still find the
 * stretch it moved after the tidying has renumbered everything around it.
 */
function normalizeRoad(
  pts: readonly Point[],
  touched: ReadonlySet<number>,
): { path: Point[]; orig: number[] } | null {
  const path: Point[] = [];
  const orig: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const j = path.length - 1;
    if (j >= 0 && path[j].x === p.x && path[j].y === p.y) {
      // A stretch squeezed to nothing. One of its two ends has to be a waypoint the
      // slide may fold away, or this road cannot be laid.
      if (touched.has(i)) continue;
      if (!touched.has(orig[j])) return null;
      path.pop();
      orig.pop();
    }
    path.push({ x: p.x, y: p.y });
    orig.push(i);
  }

  for (let i = 1; i < path.length - 1; ) {
    const a = path[i - 1];
    const b = path[i];
    const c = path[i + 1];
    const abx = Math.sign(b.x - a.x);
    const aby = Math.sign(b.y - a.y);
    const bcx = Math.sign(c.x - b.x);
    const bcy = Math.sign(c.y - b.y);
    // The road doubles back on itself: two stretches on the same line running opposite
    // ways. Merging them would delete the ground between them, so it is refused instead.
    if (abx === -bcx && aby === -bcy) return null;
    if (abx === bcx && aby === bcy) {
      // A straight run with a waypoint sitting in the middle of it. If the slide made
      // it, fold it away — that is a turn being squeezed out, and the two stretches it
      // separated really have become one. If it was already there, leave it exactly
      // where it is: the generator marks most roads with a redundant corner of its own
      // (the entry stub meeting the first leg), and a spare vertex on a straight run
      // changes nothing about where the road goes. This used to refuse the whole road
      // instead, which — since nearly every map is dealt with one — is why almost no
      // stretch could be slid at all.
      if (!touched.has(orig[i])) { i++; continue; }
      path.splice(i, 1);
      orig.splice(i, 1);
      if (i > 1) i--;
      continue;
    }
    i++;
  }

  if (path.length < 3) return null;
  for (let i = 0; i < path.length - 1; i++) {
    // Orthogonal or nothing — a diagonal would be a road no tile of this game can hold.
    if (path[i].x !== path[i + 1].x && path[i].y !== path[i + 1].y) return null;
  }
  return { path, orig };
}

/** The road with every slide folded in, tidied — or `null` if those slides do not make
 *  a road. */
export function shiftRoad(
  base: readonly Point[],
  shifts: readonly RoadShift[],
  grid: number,
): { path: Point[]; orig: number[] } | null {
  if (base.length < 4) return null;
  return normalizeRoad(translateLegs(base, shifts, grid), touchedPoints(base, shifts));
}

/** The road with every slide folded in. Slides that do not make a road fall back to the
 *  one the seed dealt — only ever reached by a save that has been tampered with, since
 *  nothing illegal is ever stored. */
export function applyShifts(base: readonly Point[], shifts: readonly RoadShift[], grid: number): Point[] {
  const road = shiftRoad(base, shifts, grid);
  return road ? road.path : base.map(p => ({ x: p.x, y: p.y }));
}

/** The whole road the player has made: the seed's, slid, then notched. */
export function buildRoad(
  base: readonly Point[],
  shifts: readonly RoadShift[],
  notches: readonly RoadNotch[],
  grid: number,
): Point[] {
  return applyNotches(applyShifts(base, shifts, grid), notches, grid);
}

/** Where a stretch of the base road currently runs, or `null` if it has been squeezed
 *  out of the road entirely. */
export function legSpan(
  base: readonly Point[],
  shifts: readonly RoadShift[],
  seg: number,
  grid: number,
): [Point, Point] | null {
  if (legAxis(base, seg) === null || seg < 1 || seg > base.length - 3) return null;
  const pts = translateLegs(base, shifts, grid);
  const a = pts[seg];
  const b = pts[seg + 1];
  if (!a || !b || (a.x === b.x && a.y === b.y)) return null;
  return [a, b];
}

/**
 * The grip on a stretch: one tile in from where it starts.
 *
 * That square is always inside the margin a notch refuses, so the two handles never
 * compete for the same click — and it is a square of the stretch itself, so a stretch
 * that has been merged into a longer straight run still wears its own grip and can
 * still be slid back.
 */
export function legHandle(
  base: readonly Point[],
  shifts: readonly RoadShift[],
  seg: number,
  grid: number,
): Point | null {
  const span = legSpan(base, shifts, seg, grid);
  if (!span) return null;
  const [a, b] = span;
  return { x: a.x + Math.sign(b.x - a.x) * grid, y: a.y + Math.sign(b.y - a.y) * grid };
}

/** Every stretch the player could take hold of, with the square its grip sits on. */
export function legHandles(
  base: readonly Point[],
  shifts: readonly RoadShift[],
  grid: number,
): { seg: number; x: number; y: number }[] {
  const out: { seg: number; x: number; y: number }[] = [];
  for (const seg of notchableLegs(base)) {
    const h = legHandle(base, shifts, seg, grid);
    if (h) out.push({ seg, x: h.x, y: h.y });
  }
  return out;
}

/** The stretch whose grip is under a point, ready to be slid. */
export function legGrabAt(
  base: readonly Point[],
  shifts: readonly RoadShift[],
  x: number,
  y: number,
  grid: number,
): RoadGrab | null {
  for (const { seg, x: hx, y: hy } of legHandles(base, shifts, grid)) {
    if (Math.abs(hx - x) > grid / 2 || Math.abs(hy - y) > grid / 2) continue;
    const off = shiftOffset(shifts, seg);
    const dir: BendDir | null =
      off.dx > 0 ? 'right' : off.dx < 0 ? 'left' : off.dy > 0 ? 'down' : off.dy < 0 ? 'up' : null;
    return {
      kind: 'leg',
      seg,
      x: hx,
      y: hy,
      hx,
      hy,
      depth: Math.abs(off.dx) + Math.abs(off.dy),
      dir,
      axis: legAxis(base, seg)!,
      index: -1,
    };
  }
  return null;
}

/** Total walking length of a road, in board pixels. */
function pathLength(pts: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) sum += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return sum;
}

/** Which stretch of a tidied road a base leg ended up inside — `-1` once it has been
 *  squeezed away. */
function normSeg(orig: readonly number[], baseSeg: number): number {
  for (let m = 0; m < orig.length - 1; m++) {
    if (orig[m] <= baseSeg && orig[m + 1] >= baseSeg + 1) return m;
  }
  return -1;
}

/** Does every notch the player owns still find a stretch to sit on? A slide that would
 *  pull the road out from under one is refused rather than pocketing the gold and
 *  dropping the detour. */
function notchesResolve(path: readonly Point[], notches: readonly RoadNotch[], grid: number): boolean {
  let cur: Point[] = path.map(p => ({ x: p.x, y: p.y }));
  for (const n of notches) {
    const next = notchedPath(cur, n, grid);
    if (!next) return false;
    cur = next;
  }
  return true;
}

/**
 * Is the slid road a road the game can still be played on?
 *
 * Only three stretches can have broken anything: the one that moved and the two it
 * pulled on. Judging the whole road would re-judge geometry the generator produced, and
 * a map born a tile tight would then refuse every slide forever — the same reason
 * {@link isNotchLegal} looks only at the detour.
 */
export function isShiftLegal(
  base: readonly Point[],
  shifts: readonly RoadShift[],
  road: { path: Point[]; orig: number[] },
  notches: readonly RoadNotch[],
  ctx: RoadContext,
  seg: number,
): boolean {
  const { grid, width, height } = ctx;
  const pts = road.path;

  // Nothing the player has paid for may be squeezed out of reach: a slid stretch that
  // lost its grip could never be slid back, and the gold would be gone with it.
  for (const s of shifts) {
    if (s.dx === 0 && s.dy === 0) continue;
    if (!legHandle(base, shifts, s.seg, grid)) return false;
  }

  const touched: number[] = [];
  for (const j of [seg - 1, seg, seg + 1]) {
    const m = normSeg(road.orig, j);
    // The two off-board stubs are not judged: they run off the world by design.
    if (m >= 1 && m <= pts.length - 3 && !touched.includes(m)) touched.push(m);
  }

  for (const i of touched) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.x < grid || a.x > width - grid || a.y < grid || a.y > height - grid) return false;
    if (b.x < grid || b.x > width - grid || b.y < grid || b.y > height - grid) return false;
    if (crossesBlocked(a, b, ctx)) return false;
    for (const t of ctx.towers) {
      if (pointToSegmentDistance(t.x, t.y, a, b) < ROAD_TOWER_CLEARANCE) return false;
    }
    for (let j = 0; j < pts.length - 1; j++) {
      if (Math.abs(j - i) <= 1) continue;
      // A stretch and the one just past the turn from it are not the road running
      // alongside itself — they are that turn's two arms, and squeezing the turn out is
      // exactly the act of closing them together. Refusing it would make straightening a
      // curve impossible, because the tile before two arms become one straight run is
      // always the tile where they are one tile apart.
      const link = Math.min(i, j) + 1;
      if (Math.abs(j - i) === 2
        && Math.hypot(pts[link + 1].x - pts[link].x, pts[link + 1].y - pts[link].y)
          < ROAD_LEG_GAP_TILES * grid) continue;
      if (segmentDistance(a, b, pts[j], pts[j + 1]) < ROAD_LEG_GAP_TILES * grid) return false;
    }
  }

  return notchesResolve(pts, notches, grid);
}

/**
 * The two ways the stretch in hand could go, each one tile across.
 *
 * Both are judged in full, unlike a notch's retreat: the ground a stretch vacated is
 * ordinary buildable land the moment it is vacated, so a tower can be standing in the
 * way back. The arrow is simply not offered then, and selling the tower brings it back.
 */
export function legOptions(
  base: readonly Point[],
  shifts: readonly RoadShift[],
  notches: readonly RoadNotch[],
  seg: number,
  ctx: RoadContext,
): RoadMove[] {
  const { grid } = ctx;
  const axis = legAxis(base, seg);
  if (axis === null || seg < 1 || seg > base.length - 3) return [];
  const cur = shiftOffset(shifts, seg);
  const was = pathLength(buildRoad(base, shifts, notches, grid));
  const out: RoadMove[] = [];

  for (const dir of (axis === 'h' ? ['up', 'down'] : ['left', 'right']) as BendDir[]) {
    const cand = shiftedBy(shifts, seg, dir);
    const road = shiftRoad(base, cand, grid);
    if (!road || !isShiftLegal(base, cand, road, notches, ctx, seg)) continue;
    const handle = legHandle(base, cand, seg, grid);
    if (!handle) continue;
    const next = shiftOffset(cand, seg);
    const reach = Math.abs(next.dx) + Math.abs(next.dy);
    out.push({
      dir,
      side: dir,
      x: handle.x,
      y: handle.y,
      deltaTiles: Math.round((pathLength(applyNotches(road.path, notches, grid)) - was) / grid),
      depth: reach,
      digs: reach > Math.abs(cur.dx) + Math.abs(cur.dy),
      seg,
    });
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import type { Point } from '../types';
import {
  applyNotches,
  isNotchLegal,
  legAxis,
  notchAt,
  notchHead,
  notchOptions,
  notchableLegs,
  notchedPath,
  roadBendCost,
  roadTileAt,
  type RoadContext,
  type RoadNotch,
} from './road-shaping';

const GRID = 32;
const W = 1440;
const H = 640;

/**
 * A road shaped like one the generator makes: an off-board stub on the left, a
 * serpentine of alternating horizontal and vertical legs, an off-board stub on the
 * right. Legs 1–5 are the interior ones a player may dig into.
 */
const road = (): Point[] => [
  { x: -32, y: 320 }, // entry stub, collinear with the first leg
  { x: 160, y: 320 },
  { x: 160, y: 160 },
  { x: 480, y: 160 },
  { x: 480, y: 480 },
  { x: 800, y: 480 },
  { x: 800, y: 320 },
  { x: 1472, y: 320 }, // exit stub
];

/** A road pinned to the top of the board, for the rules that only bite at an edge. */
const edgeRoad = (): Point[] => [
  { x: -32, y: 32 },
  { x: 160, y: 32 },
  { x: 640, y: 32 },
  { x: 640, y: 320 },
  { x: 1472, y: 320 },
];

const ctx = (over: Partial<RoadContext> = {}): RoadContext => ({
  grid: GRID,
  width: W,
  height: H,
  towers: [],
  ...over,
});

const lengthOf = (p: readonly Point[]) => {
  let n = 0;
  for (let i = 0; i < p.length - 1; i++) n += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y);
  return n;
};

const dirsOf = (path: readonly Point[], x: number, y: number, c = ctx()) => {
  const tile = roadTileAt(path, x, y, GRID);
  if (!tile) return null;
  return notchOptions(path, tile, c).map(o => o.dir).sort();
};

describe('legAxis', () => {
  it('names the run of a straight leg', () => {
    expect(legAxis(road(), 2)).toBe('h');
    expect(legAxis(road(), 3)).toBe('v');
  });

  it('refuses a diagonal or a zero-length leg', () => {
    expect(legAxis([{ x: 0, y: 0 }, { x: 32, y: 32 }], 0)).toBeNull();
    expect(legAxis([{ x: 0, y: 0 }, { x: 0, y: 0 }], 0)).toBeNull();
    expect(legAxis(road(), 99)).toBeNull();
  });
});

describe('notchableLegs', () => {
  it('leaves the two off-board stubs alone', () => {
    expect(notchableLegs(road())).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('roadTileAt', () => {
  it('snaps a point near the road onto the road’s own lattice', () => {
    // Eleven px off the centre line, six px off the lattice: still that tile.
    expect(roadTileAt(road(), 314, 171, GRID)).toEqual({ seg: 2, x: 320, y: 160 });
  });

  it('finds nothing off the road', () => {
    expect(roadTileAt(road(), 320, 300, GRID)).toBeNull();
  });

  it('keeps clear of the corners, where a detour would eat a turn', () => {
    // Leg 2 runs x 160 → 480; the first two tiles at either end are out of bounds.
    expect(roadTileAt(road(), 192, 160, GRID)).toBeNull();
    expect(roadTileAt(road(), 448, 160, GRID)).toBeNull();
    expect(roadTileAt(road(), 224, 160, GRID)).toEqual({ seg: 2, x: 224, y: 160 });
    expect(roadTileAt(road(), 416, 160, GRID)).toEqual({ seg: 2, x: 416, y: 160 });
  });

  it('finds nothing on a stub', () => {
    expect(roadTileAt(road(), 0, 320, GRID)).toBeNull();
    expect(roadTileAt(road(), 1440, 320, GRID)).toBeNull();
  });
});

describe('notchedPath', () => {
  const notch: RoadNotch = { x: 320, y: 160, dir: 'up' };

  it('steps the road out around one square and straight back', () => {
    const next = notchedPath(road(), notch, GRID)!;
    expect(next).not.toBeNull();
    expect(next.length).toBe(road().length + 4);
    // A → near → out → back → far → B, spliced into leg 2.
    expect(next.slice(2, 8)).toEqual([
      { x: 160, y: 160 },
      { x: 288, y: 160 },
      { x: 288, y: 128 },
      { x: 352, y: 128 },
      { x: 352, y: 160 },
      { x: 480, y: 160 },
    ]);
  });

  it('costs exactly two tiles of walking — the step out and the step back', () => {
    const next = notchedPath(road(), notch, GRID)!;
    expect(lengthOf(next) - lengthOf(road())).toBeCloseTo(2 * GRID, 6);
  });

  it('leaves the rest of the road exactly where it was', () => {
    const next = notchedPath(road(), notch, GRID)!;
    expect(next.slice(0, 3)).toEqual(road().slice(0, 3));
    expect(next.slice(7)).toEqual(road().slice(3));
  });

  it('refuses a pull along the leg rather than across it', () => {
    expect(notchedPath(road(), { x: 320, y: 160, dir: 'left' }, GRID)).toBeNull();
    expect(notchedPath(road(), { x: 320, y: 160, dir: 'right' }, GRID)).toBeNull();
  });

  it('refuses a tile that is not on the road at all', () => {
    expect(notchedPath(road(), { x: 320, y: 300, dir: 'up' }, GRID)).toBeNull();
    expect(notchedPath(road(), { x: 192, y: 160, dir: 'up' }, GRID)).toBeNull();
  });

  it('is legal on an empty board', () => {
    const next = notchedPath(road(), notch, GRID)!;
    expect(isNotchLegal(next, ctx(), 2)).toBe(true);
  });
});

describe('notchOptions', () => {
  it('offers both sides of a clear leg, and only the two perpendicular ones', () => {
    expect(dirsOf(road(), 320, 160)).toEqual(['down', 'up']);
    expect(dirsOf(road(), 480, 320)).toEqual(['left', 'right']);
  });

  it('names where the tile would land', () => {
    const tile = roadTileAt(road(), 320, 160, GRID)!;
    const up = notchOptions(road(), tile, ctx()).find(o => o.dir === 'up')!;
    expect(up).toMatchObject({ x: 320, y: 128, deltaTiles: 2 });
    expect(notchHead({ x: 320, y: 160, dir: 'up' }, GRID)).toEqual({ x: 320, y: 128 });
  });

  it('will not run the road over a tower', () => {
    expect(dirsOf(road(), 320, 160, ctx({ towers: [{ x: 320, y: 128 }] }))).toEqual(['down']);
  });

  it('will not dig into blocked terrain', () => {
    expect(dirsOf(road(), 320, 160, ctx({ isBlockedTile: (_x, y) => y < 160 }))).toEqual(['down']);
  });

  it('will not push the road off the edge of the board', () => {
    expect(dirsOf(edgeRoad(), 320, 32)).toEqual(['down']);
  });

  it('keeps its distance from the rest of the road', () => {
    // The last tile before leg 2's corner can be picked up, but its detour would run
    // within a tile of the leg turning down at x = 480, so neither side is offered.
    expect(dirsOf(road(), 416, 160)).toEqual([]);
    // One tile further from the corner there is room again.
    expect(dirsOf(road(), 384, 160)).toEqual(['down', 'up']);
  });
});

describe('applyNotches', () => {
  const first: RoadNotch = { x: 320, y: 160, dir: 'up' };
  const second: RoadNotch = { x: 640, y: 480, dir: 'down' };

  it('folds every notch onto the road the generator dealt', () => {
    const both = applyNotches(road(), [first, second], GRID);
    expect(lengthOf(both) - lengthOf(road())).toBeCloseTo(4 * GRID, 6);
    expect(both.length).toBe(road().length + 8);
  });

  it('does not mind which order they were bought in', () => {
    expect(applyNotches(road(), [first, second], GRID)).toEqual(
      applyNotches(road(), [second, first], GRID),
    );
  });

  it('never touches the road it was handed', () => {
    const base = road();
    applyNotches(base, [first, second], GRID);
    expect(base).toEqual(road());
  });

  it('undoes by dropping one entry — the rest stay exactly where they were', () => {
    const kept = applyNotches(road(), [first, second], GRID).length;
    expect(kept).toBeGreaterThan(0);
    expect(applyNotches(road(), [first], GRID)).toEqual(notchedPath(road(), first, GRID));
    expect(applyNotches(road(), [second], GRID)).toEqual(notchedPath(road(), second, GRID));
    expect(applyNotches(road(), [], GRID)).toEqual(road());
  });

  it('takes a second notch further along the same leg', () => {
    const one = applyNotches(road(), [{ x: 576, y: 480, dir: 'down' }], GRID);
    expect(dirsOf(one, 704, 480)).toContain('down');
    const two = applyNotches(
      road(),
      [{ x: 576, y: 480, dir: 'down' }, { x: 704, y: 480, dir: 'down' }],
      GRID,
    );
    expect(lengthOf(two) - lengthOf(road())).toBeCloseTo(4 * GRID, 6);
  });

  it('quietly skips a notch that no longer finds its leg', () => {
    const stale: RoadNotch = { x: 320, y: 300, dir: 'up' };
    expect(applyNotches(road(), [stale], GRID)).toEqual(road());
    expect(applyNotches(road(), [first, stale], GRID)).toEqual(notchedPath(road(), first, GRID));
  });
});

describe('notchAt', () => {
  const notches: RoadNotch[] = [
    { x: 320, y: 160, dir: 'up' },
    { x: 640, y: 480, dir: 'down' },
  ];

  it('finds the notch whose raised tile is under the point', () => {
    expect(notchAt(notches, 320, 128, GRID)).toBe(0);
    expect(notchAt(notches, 330, 138, GRID)).toBe(0);
    expect(notchAt(notches, 640, 512, GRID)).toBe(1);
  });

  it('does not answer for the road the notch was dug from', () => {
    expect(notchAt(notches, 320, 160, GRID)).toBe(-1);
    expect(notchAt(notches, 900, 300, GRID)).toBe(-1);
    expect(notchAt([], 320, 128, GRID)).toBe(-1);
  });
});

describe('roadBendCost', () => {
  it('climbs with every notch the player is keeping', () => {
    expect(roadBendCost(0)).toBe(120);
    expect(roadBendCost(1)).toBeGreaterThan(roadBendCost(0));
    expect(roadBendCost(3)).toBeGreaterThan(roadBendCost(2));
  });

  it('falls back again when one is filled in, so a mistake costs gold only once', () => {
    expect(roadBendCost(2 - 1)).toBe(roadBendCost(1));
    expect(roadBendCost(1)).toBeLessThan(roadBendCost(2));
  });

  it('never goes below the first price', () => {
    expect(roadBendCost(-3)).toBe(roadBendCost(0));
  });
});

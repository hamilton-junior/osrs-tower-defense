import { describe, expect, it } from 'vitest';
import type { Point } from '../types';
import {
  ROAD_LEG_GAP_TILES,
  ROAD_TOWER_CLEARANCE,
  isShoveLegal,
  legAxis,
  movableLegs,
  roadBendCost,
  roadMoveOptions,
  shovedPath,
  type RoadContext,
} from './road-shaping';

const GRID = 32;
const W = 1440;
const H = 640;

/**
 * A road shaped like one the generator makes: an off-board stub on the left, a
 * serpentine of alternating horizontal and vertical legs, an off-board stub on the
 * right. Legs 1–5 are the interior ones a player may shove.
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

describe('movableLegs', () => {
  it('offers every interior leg and neither stub', () => {
    expect(movableLegs(road())).toEqual([1, 2, 3, 4, 5]);
  });

  it('has nothing to offer on a path too short to have an interior', () => {
    expect(movableLegs([{ x: 0, y: 0 }, { x: 32, y: 0 }])).toEqual([]);
  });
});

describe('shovedPath', () => {
  it('moves both ends of the leg together, so the leg keeps its direction', () => {
    const next = shovedPath(road(), 2, 'up', GRID)!;
    expect(next[2]).toEqual({ x: 160, y: 128 });
    expect(next[3]).toEqual({ x: 480, y: 128 });
  });

  it('leaves every other waypoint where it was', () => {
    const before = road();
    const next = shovedPath(before, 2, 'up', GRID)!;
    for (const i of [0, 1, 4, 5, 6, 7]) expect(next[i]).toEqual(before[i]);
  });

  it('refuses to shove a leg along its own line', () => {
    expect(shovedPath(road(), 2, 'left', GRID)).toBeNull(); // horizontal leg
    expect(shovedPath(road(), 3, 'up', GRID)).toBeNull(); // vertical leg
  });

  it('keeps the road orthogonal — every segment stays axis-aligned', () => {
    for (const seg of movableLegs(road())) {
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const next = shovedPath(road(), seg, dir, GRID);
        if (!next) continue;
        for (let i = 0; i < next.length - 1; i++) {
          const a = next[i];
          const b = next[i + 1];
          expect(a.x === b.x || a.y === b.y).toBe(true);
        }
      }
    }
  });

  it('drags a stub that shares its neighbour\'s column, so the entry stays square', () => {
    // Entry from the top: the stub sits directly above the first waypoint.
    const top: Point[] = [
      { x: 320, y: -32 },
      { x: 320, y: 64 },
      { x: 320, y: 320 },
      { x: 800, y: 320 },
      { x: 1472, y: 320 },
    ];
    const next = shovedPath(top, 1, 'left', GRID)!;
    expect(next[1]).toEqual({ x: 288, y: 64 });
    expect(next[0]).toEqual({ x: 288, y: -32 }); // followed its waypoint
  });

  it('leaves a stub that only shares its neighbour\'s row alone', () => {
    const next = shovedPath(road(), 1, 'right', GRID)!;
    expect(next[1]).toEqual({ x: 192, y: 320 });
    expect(next[0]).toEqual({ x: -32, y: 320 }); // still off the left edge, still square
  });
});

describe('what a shove is worth', () => {
  it('adds two tiles when a U is pushed outward', () => {
    const next = shovedPath(road(), 2, 'up', GRID)!;
    expect(lengthOf(next) - lengthOf(road())).toBeCloseTo(2 * GRID);
  });

  it('takes two tiles back when the same U is pushed inward', () => {
    const next = shovedPath(road(), 2, 'down', GRID)!;
    expect(lengthOf(next) - lengthOf(road())).toBeCloseTo(-2 * GRID);
  });

  it('is length-neutral for a staircase step, which only re-cuts the board', () => {
    const next = shovedPath(road(), 3, 'right', GRID)!;
    expect(lengthOf(next) - lengthOf(road())).toBeCloseTo(0);
  });
});

describe('isShoveLegal', () => {
  const legal = (seg: number, dir: 'up' | 'down' | 'left' | 'right', c = ctx()) => {
    const next = shovedPath(road(), seg, dir, c.grid);
    return next !== null && isShoveLegal(road(), next, c, seg);
  };

  it('allows an ordinary shove on empty ground', () => {
    expect(legal(2, 'up')).toBe(true);
  });

  it('refuses to run the road over a tower', () => {
    const onTheNewLeg = ctx({ towers: [{ x: 300, y: 128 }] });
    expect(legal(2, 'up', onTheNewLeg)).toBe(false);
  });

  it('refuses a tower that is merely too close, by the same clearance a build uses', () => {
    const justInside = ctx({ towers: [{ x: 300, y: 128 + ROAD_TOWER_CLEARANCE - 1 }] });
    const justOutside = ctx({ towers: [{ x: 300, y: 128 + ROAD_TOWER_CLEARANCE }] });
    expect(legal(2, 'up', justInside)).toBe(false);
    expect(legal(2, 'up', justOutside)).toBe(true);
  });

  it('judges only the ground the shove actually touches', () => {
    // Hard against leg 5 — which this shove never moves, so it is none of its
    // business. Judging the whole road would let one tight corner of the generated
    // map veto every shove for the rest of the run.
    expect(legal(2, 'up', ctx({ towers: [{ x: 800, y: 400 }] }))).toBe(true);
    // The same tower does block a shove of the leg it is standing on.
    const next5 = shovedPath(road(), 5, 'left', GRID)!;
    expect(isShoveLegal(road(), next5, ctx({ towers: [{ x: 800, y: 400 }] }), 5)).toBe(false);
  });

  it('refuses to shove the road into an obstacle', () => {
    const boulder = ctx({ isBlockedTile: (x, y) => y < 140 && x > 200 && x < 260 });
    expect(legal(2, 'up', boulder)).toBe(false);
    expect(legal(2, 'down', boulder)).toBe(true); // the other way is clear
  });

  it('keeps the road a tile in from the edge of the board', () => {
    const hugging: Point[] = [
      { x: -32, y: 320 },
      { x: 160, y: 320 },
      { x: 160, y: 32 },
      { x: 480, y: 32 },
      { x: 480, y: 480 },
      { x: 1472, y: 480 },
    ];
    const next = shovedPath(hugging, 2, 'up', GRID)!;
    expect(isShoveLegal(hugging, next, ctx(), 2)).toBe(false);
  });

  it('keeps a build lane between legs that are not neighbours', () => {
    // Legs 1 and 3 stand two tiles apart; shoving 1 toward 3 would close the gap.
    const tight: Point[] = [
      { x: -32, y: 320 },
      { x: 160, y: 320 },
      { x: 160, y: 160 },
      { x: 160 + ROAD_LEG_GAP_TILES * GRID, y: 160 },
      { x: 160 + ROAD_LEG_GAP_TILES * GRID, y: 480 },
      { x: 1472, y: 480 },
    ];
    const closer = shovedPath(tight, 1, 'right', GRID)!;
    expect(isShoveLegal(tight, closer, ctx(), 1)).toBe(false);
    const further = shovedPath(tight, 1, 'left', GRID)!;
    expect(isShoveLegal(tight, further, ctx(), 1)).toBe(true);
  });

  it('refuses a shove that would swallow a neighbouring leg whole', () => {
    // Leg 2's hinge into leg 1 is exactly one tile long, so shoving up erases it.
    const shallow: Point[] = [
      { x: -32, y: 320 },
      { x: 160, y: 320 },
      { x: 160, y: 288 },
      { x: 480, y: 288 },
      { x: 480, y: 480 },
      { x: 1472, y: 480 },
    ];
    const next = shovedPath(shallow, 2, 'down', GRID)!;
    expect(next[2]).toEqual({ x: 160, y: 320 }); // landed on its own hinge
    expect(isShoveLegal(shallow, next, ctx(), 2)).toBe(false);
  });
});

describe('roadMoveOptions', () => {
  it('offers both directions of every clear leg, and says what each is worth', () => {
    const opts = roadMoveOptions(road(), ctx());
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(movableLegs(road())).toContain(o.seg);
      expect([-2, 0, 2]).toContain(o.deltaTiles);
    }
    const leg2 = opts.filter(o => o.seg === 2);
    expect(leg2.map(o => o.dir).sort()).toEqual(['down', 'up']);
    expect(leg2.find(o => o.dir === 'up')!.deltaTiles).toBe(2);
    expect(leg2.find(o => o.dir === 'down')!.deltaTiles).toBe(-2);
  });

  it('points the arrow at where the leg would land, not where it is', () => {
    const up = roadMoveOptions(road(), ctx()).find(o => o.seg === 2 && o.dir === 'up')!;
    expect(up).toMatchObject({ x: 320, y: 128 });
  });

  it('quietly drops the shoves that are not allowed', () => {
    const blocked = ctx({ towers: [{ x: 300, y: 128 }] });
    const opts = roadMoveOptions(road(), blocked);
    expect(opts.some(o => o.seg === 2 && o.dir === 'up')).toBe(false);
    expect(opts.some(o => o.seg === 2 && o.dir === 'down')).toBe(true);
  });

  it('can be applied again to its own result, so shoves compound', () => {
    const once = shovedPath(road(), 2, 'up', GRID)!;
    const opts = roadMoveOptions(once, ctx());
    const again = opts.find(o => o.seg === 2 && o.dir === 'up');
    expect(again).toBeDefined();
    const twice = shovedPath(once, 2, 'up', GRID)!;
    expect(lengthOf(twice) - lengthOf(road())).toBeCloseTo(4 * GRID);
    expect(twice.length).toBe(road().length); // still the same road, just bent
  });
});

describe('roadBendCost', () => {
  it('starts affordable and climbs, so the road cannot be stretched forever', () => {
    expect(roadBendCost(0)).toBe(120);
    for (let i = 1; i < 8; i++) expect(roadBendCost(i)).toBeGreaterThan(roadBendCost(i - 1));
    expect(roadBendCost(5)).toBeGreaterThan(1000);
  });

  it('treats a nonsense count as the first purchase', () => {
    expect(roadBendCost(-3)).toBe(roadBendCost(0));
  });
});

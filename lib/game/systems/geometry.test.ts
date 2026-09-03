import { describe, it, expect } from 'vitest';
import {
  distance, distanceSq, pointToSegmentDistance, isValidPlacement, squareRange, inSquareRange, knockbackStep,
  pathTotalLength, remainingPathDistance, advanceAlongPath, clampCursorToBoard, snapToTileCenter,
  roadStretches, stretchAt,
} from './geometry';

describe('snapToTileCenter', () => {
  const GRID = 32;
  it('snaps to the centre of the tile the point falls in', () => {
    expect(snapToTileCenter(0, GRID)).toBe(16);
    expect(snapToTileCenter(31, GRID)).toBe(16);
    expect(snapToTileCenter(32, GRID)).toBe(48);
    expect(snapToTileCenter(50, GRID)).toBe(48);
  });
  it('lands on a grid-spaced lattice, so any two snaps differ by whole tiles', () => {
    const a = snapToTileCenter(10, GRID);
    const b = snapToTileCenter(200, GRID);
    expect((b - a) % GRID).toBe(0);
  });
  it('never lands on a grid intersection (always a half-tile offset)', () => {
    for (const v of [0, 5, 33, 100, 517]) {
      expect(snapToTileCenter(v, GRID) % GRID).toBe(GRID / 2);
    }
  });
});

describe('distance', () => {
  it('computes Euclidean distance', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });
  it('is zero for identical points', () => {
    expect(distance(7, 7, 7, 7)).toBe(0);
  });
});

describe('distanceSq', () => {
  it('is the square of distance', () => {
    expect(distanceSq(0, 0, 3, 4)).toBe(25);
  });
});

describe('pointToSegmentDistance', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it('measures perpendicular distance to the segment body', () => {
    expect(pointToSegmentDistance(5, 3, a, b)).toBe(3);
  });
  it('clamps to the start endpoint when projecting before it', () => {
    expect(pointToSegmentDistance(-4, 0, a, b)).toBe(4);
  });
  it('clamps to the end endpoint when projecting past it', () => {
    expect(pointToSegmentDistance(13, 4, a, b)).toBe(5);
  });
  it('treats a zero-length segment as a point', () => {
    expect(pointToSegmentDistance(3, 4, a, a)).toBe(5);
  });
});

describe('squareRange', () => {
  it('snaps a range to the nearest whole tile', () => {
    expect(squareRange(100, 32)).toBe(96); // 100/32 ≈ 3.1 → 3 tiles
    expect(squareRange(112, 32)).toBe(128); // 112/32 = 3.5 → rounds to 4 tiles
  });
  it('never returns less than one tile', () => {
    expect(squareRange(5, 32)).toBe(32);
  });
});

describe('inSquareRange', () => {
  it('accepts points within the square on both axes', () => {
    expect(inSquareRange(60, 60, 0, 0, 64)).toBe(true);
  });
  it('rejects points outside on either axis', () => {
    expect(inSquareRange(70, 10, 0, 0, 64)).toBe(false);
    expect(inSquareRange(10, 70, 0, 0, 64)).toBe(false);
  });
  it('includes points exactly on the edge', () => {
    expect(inSquareRange(64, 64, 0, 0, 64)).toBe(true);
  });
  it('accepts a far diagonal corner a circle would reject', () => {
    // (45,45) is ~63.6px away — outside a 50px radius but inside a 64px square.
    expect(inSquareRange(45, 45, 0, 0, 64)).toBe(true);
  });
});

describe('isValidPlacement', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it('rejects positions too close to the path', () => {
    expect(isValidPlacement(50, 10, path, [])).toBe(false);
  });
  it('accepts positions clear of the path and towers', () => {
    expect(isValidPlacement(50, 80, path, [])).toBe(true);
  });
  it('rejects positions overlapping an existing tower', () => {
    expect(isValidPlacement(50, 80, path, [{ x: 55, y: 80 }])).toBe(false);
  });
  it('accepts positions far from an existing tower', () => {
    expect(isValidPlacement(50, 80, path, [{ x: 200, y: 200 }])).toBe(true);
  });
  it('rejects an otherwise-valid spot the terrain marks blocked', () => {
    const blocked = (x: number, y: number) => x === 50 && y === 80;
    expect(isValidPlacement(50, 80, path, [], 40, 30, blocked)).toBe(false);
    // a clear tile with the same predicate still passes
    expect(isValidPlacement(50, 200, path, [], 40, 30, blocked)).toBe(true);
  });
});

describe('knockbackStep', () => {
  it('moves the point toward the target by dist', () => {
    const r = knockbackStep(100, 0, 0, 0, 28);
    expect(r.x).toBeCloseTo(72);
    expect(r.y).toBeCloseTo(0);
    expect(r.moved).toBeCloseTo(28);
  });
  it('clamps at the target waypoint instead of overshooting', () => {
    const r = knockbackStep(10, 0, 0, 0, 28);
    expect(r.x).toBeCloseTo(0);
    expect(r.moved).toBeCloseTo(10);
  });
  it('no-ops when already on the waypoint or dist <= 0', () => {
    expect(knockbackStep(0.5, 0, 0, 0, 28).moved).toBe(0);
    expect(knockbackStep(100, 0, 0, 0, 0).moved).toBe(0);
  });
});

describe('walking the road', () => {
  // An L: 300px right, then 400px down. Total 700.
  const road = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }];

  it('measures the whole road', () => {
    expect(pathTotalLength(road)).toBe(700);
    expect(pathTotalLength([{ x: 0, y: 0 }])).toBe(0);
    expect(pathTotalLength([])).toBe(0);
  });

  it('measures what is left from a point part-way along a segment', () => {
    expect(remainingPathDistance(road, 0, 0, 0)).toBe(700);
    expect(remainingPathDistance(road, 0, 100, 0)).toBe(600); // 200 left in seg 0, + 400
    expect(remainingPathDistance(road, 1, 300, 100)).toBe(300);
    expect(remainingPathDistance(road, 2, 300, 400)).toBe(0); // at the end
  });

  it('advances within a segment without touching the waypoint index', () => {
    expect(advanceAlongPath(road, 0, 0, 0, 100)).toEqual({ pathIndex: 0, x: 100, y: 0 });
  });

  it('carries the index forward when it steps over a waypoint, and turns the corner', () => {
    // 350px from the start: 300 along the first leg, then 50 down the second.
    const t = advanceAlongPath(road, 0, 0, 0, 350);
    expect(t.pathIndex).toBe(1);
    expect(t.x).toBeCloseTo(300);
    expect(t.y).toBeCloseTo(50);
  });

  it('clamps at the end of the road instead of running off it', () => {
    const t = advanceAlongPath(road, 0, 0, 0, 9999);
    expect(t).toEqual({ pathIndex: 2, x: 300, y: 400 });
  });

  it('stands still for a zero or negative step', () => {
    expect(advanceAlongPath(road, 0, 50, 0, 0)).toEqual({ pathIndex: 0, x: 50, y: 0 });
    expect(advanceAlongPath(road, 0, 50, 0, -10)).toEqual({ pathIndex: 0, x: 50, y: 0 });
  });
});

describe('clampCursorToBoard', () => {
  const G = 32, W = 1440, H = 640; // the fixed board, one tower tile = 32px

  it('snaps a loose point to the nearest tile', () => {
    expect(clampCursorToBoard(100, 100, G, W, H)).toEqual({ x: 96, y: 96 });   // 100 → 96
    expect(clampCursorToBoard(112, 80, G, W, H)).toEqual({ x: 128, y: 96 });   // 112 → 128 (3.5 rounds up), 80 → 96
  });

  it('keeps a one-tile margin in from every edge', () => {
    expect(clampCursorToBoard(0, 0, G, W, H)).toEqual({ x: G, y: G });         // top-left corner
    expect(clampCursorToBoard(-500, -500, G, W, H)).toEqual({ x: G, y: G });   // way off top-left
    expect(clampCursorToBoard(9999, 9999, G, W, H)).toEqual({ x: W - G, y: H - G }); // off bottom-right
  });

  it('leaves an already-valid interior tile where it is', () => {
    expect(clampCursorToBoard(320, 320, G, W, H)).toEqual({ x: 320, y: 320 });
  });
});

describe('roadStretches', () => {
  const p = (x: number, y: number) => ({ x, y });

  it('reads a straight road as one stretch, however many points it is made of', () => {
    // The road editor and the notch spade both insert waypoints on straight runs;
    // a waypoint the road does not turn at is not a bend.
    const s = roadStretches([p(0, 0), p(100, 0), p(200, 0), p(300, 0)]);
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({ from: 0, to: 2, a: p(0, 0), b: p(300, 0) });
  });

  it('splits an L into the two runs that meet at the corner', () => {
    const s = roadStretches([p(0, 0), p(100, 0), p(100, 100)]);
    expect(s.length).toBe(2);
    expect(s[0]).toMatchObject({ from: 0, to: 0, a: p(0, 0), b: p(100, 0) });
    expect(s[1]).toMatchObject({ from: 1, to: 1, a: p(100, 0), b: p(100, 100) });
  });

  it('does not let a long sweeping curve pass as one straight run', () => {
    // Every step turns by less than the threshold, but they all turn the same way:
    // measured against the run's *start* the curve breaks, as it should.
    const path = [p(0, 0)];
    let x = 0, y = 0, h = 0;
    for (let i = 0; i < 12; i++) {
      h += 0.2;
      x += Math.cos(h) * 40; y += Math.sin(h) * 40;
      path.push(p(x, y));
    }
    expect(roadStretches(path).length).toBeGreaterThan(1);
  });

  it('covers every segment exactly once, in order', () => {
    const s = roadStretches([p(0, 0), p(100, 0), p(100, 100), p(200, 100), p(200, 0)]);
    expect(s[0].from).toBe(0);
    expect(s[s.length - 1].to).toBe(3);
    for (let i = 1; i < s.length; i++) expect(s[i].from).toBe(s[i - 1].to + 1);
  });

  it('has nothing to say about a road with no segments', () => {
    expect(roadStretches([])).toEqual([]);
    expect(roadStretches([p(0, 0)])).toEqual([]);
  });
});

describe('stretchAt', () => {
  const p = (x: number, y: number) => ({ x, y });
  const s = roadStretches([p(0, 0), p(100, 0), p(100, 100), p(200, 100)]);

  it('finds the run a segment belongs to', () => {
    expect(stretchAt(s, 0)).toBe(0);
    expect(stretchAt(s, 1)).toBe(1);
    expect(stretchAt(s, 2)).toBe(2);
  });

  it('answers -1 for a segment that is not on the road', () => {
    expect(stretchAt(s, -1)).toBe(-1);
    expect(stretchAt(s, 99)).toBe(-1);
  });
});

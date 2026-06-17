import { describe, it, expect } from 'vitest';
import { distance, distanceSq, pointToSegmentDistance, isValidPlacement, squareRange, inSquareRange } from './geometry';

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
});

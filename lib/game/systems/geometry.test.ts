import { describe, it, expect } from 'vitest';
import { distance, distanceSq, pointToSegmentDistance, isValidPlacement } from './geometry';

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

import { describe, it, expect } from 'vitest';
import type { Enemy, Point } from '../types';
import { selectTarget } from './targeting';

// Minimal Enemy stub — only the fields targeting reads.
function enemy(id: string, x: number, y: number, pathIndex: number, hp: number): Enemy {
  return { id, x, y, pathIndex, hp } as Enemy;
}

const path: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 200, y: 0 },
];

describe('selectTarget', () => {
  it('returns null for an empty list', () => {
    expect(selectTarget([], 0, 0, path, 'first')).toBeNull();
  });

  it('"first" picks the enemy furthest along the path', () => {
    const a = enemy('a', 10, 0, 0, 100);
    const b = enemy('b', 110, 0, 1, 100);
    expect(selectTarget([a, b], 0, 0, path, 'first')!.id).toBe('b');
  });

  it('"last" picks the enemy least far along the path', () => {
    const a = enemy('a', 10, 0, 0, 100);
    const b = enemy('b', 110, 0, 1, 100);
    expect(selectTarget([a, b], 0, 0, path, 'last')!.id).toBe('a');
  });

  it('"strongest" picks the highest hp', () => {
    const a = enemy('a', 10, 0, 0, 50);
    const b = enemy('b', 20, 0, 0, 200);
    expect(selectTarget([a, b], 0, 0, path, 'strongest')!.id).toBe('b');
  });

  it('"weakest" picks the lowest hp', () => {
    const a = enemy('a', 10, 0, 0, 50);
    const b = enemy('b', 20, 0, 0, 200);
    expect(selectTarget([a, b], 0, 0, path, 'weakest')!.id).toBe('a');
  });

  it('"closest" picks the nearest to the tower', () => {
    const a = enemy('a', 10, 0, 0, 100);
    const b = enemy('b', 90, 0, 0, 100);
    expect(selectTarget([a, b], 100, 0, path, 'closest')!.id).toBe('b');
  });

  it('breaks "first" ties by proximity to the next path node', () => {
    const a = enemy('a', 10, 0, 1, 100); // further from node[2] at x=200
    const b = enemy('b', 90, 0, 1, 100); // closer to node[2]
    expect(selectTarget([a, b], 0, 0, path, 'first')!.id).toBe('b');
  });
});

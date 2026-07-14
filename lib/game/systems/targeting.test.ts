import { describe, it, expect } from 'vitest';
import type { Enemy, Point } from '../types';
import { selectTarget, isMarked } from './targeting';

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

describe('isMarked', () => {
  it('is false for a clean enemy', () => {
    expect(isMarked(enemy('a', 0, 0, 0, 100))).toBe(false);
  });

  it('reads a slow, a stun and the Water amp as marks', () => {
    expect(isMarked({ ...enemy('a', 0, 0, 0, 100), slowTimer: 2 } as Enemy)).toBe(true);
    expect(isMarked({ ...enemy('a', 0, 0, 0, 100), stunTimer: 1 } as Enemy)).toBe(true);
    expect(isMarked({ ...enemy('a', 0, 0, 0, 100), vulnTimer: 3 } as Enemy)).toBe(true);
  });

  it('reads a live DoT as a mark, but an expired one as clean', () => {
    const dot = (timer: number) => ({ timer, dps: 5, accum: 0, tickTimer: 0 });
    expect(isMarked({ ...enemy('a', 0, 0, 0, 100), dots: { poison: dot(4) } } as Enemy)).toBe(true);
    expect(isMarked({ ...enemy('a', 0, 0, 0, 100), dots: { poison: dot(0) } } as Enemy)).toBe(false);
  });
});

describe('selectTarget — "unmarked"', () => {
  const marked = (id: string, x: number, pathIndex: number): Enemy =>
    ({ ...enemy(id, x, 0, pathIndex, 100), poisonTimer: 0, slowTimer: 3 }) as Enemy;

  it('skips a marked enemy that is further along for a clean one behind it', () => {
    const lead = marked('lead', 110, 1); // furthest along, but already slowed
    const clean = enemy('clean', 10, 0, 0, 100);
    expect(selectTarget([lead, clean], 0, 0, path, 'unmarked')!.id).toBe('clean');
  });

  it('picks the furthest-along enemy among the clean ones', () => {
    const back = enemy('back', 10, 0, 0, 100);
    const front = enemy('front', 110, 0, 1, 100);
    expect(selectTarget([back, front], 0, 0, path, 'unmarked')!.id).toBe('front');
  });

  it('falls back to "first" when everything in range is already marked — never idles', () => {
    const a = marked('a', 10, 0);
    const b = marked('b', 110, 1);
    expect(selectTarget([a, b], 0, 0, path, 'unmarked')!.id).toBe('b');
  });
});

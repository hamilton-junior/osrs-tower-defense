import { describe, it, expect } from 'vitest';
import type { Enemy, Point } from '../types';
import { selectTarget, hasMark } from './targeting';

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

describe('hasMark', () => {
  it('is false for a clean enemy, whatever the kind', () => {
    const clean = enemy('a', 0, 0, 0, 100);
    for (const k of ['slow', 'stun', 'vuln', 'burn', 'poison', 'venom', 'none'] as const) {
      expect(hasMark(clean, k)).toBe(false);
    }
  });

  it('reads a slow, a stun and the Water amp for their own kinds', () => {
    expect(hasMark({ ...enemy('a', 0, 0, 0, 100), slowTimer: 2 } as Enemy, 'slow')).toBe(true);
    expect(hasMark({ ...enemy('a', 0, 0, 0, 100), stunTimer: 1 } as Enemy, 'stun')).toBe(true);
    expect(hasMark({ ...enemy('a', 0, 0, 0, 100), vulnTimer: 3 } as Enemy, 'vuln')).toBe(true);
  });

  it('is per-effect: one tower\'s mark is not seen by another\'s kind', () => {
    const slowed = { ...enemy('a', 0, 0, 0, 100), slowTimer: 2 } as Enemy;
    expect(hasMark(slowed, 'slow')).toBe(true);
    expect(hasMark(slowed, 'stun')).toBe(false); // a stun tower ignores someone else's slow
    expect(hasMark(slowed, 'venom')).toBe(false);
  });

  it('reads a live DoT as a mark of its own kind, but an expired one as clean', () => {
    const dot = (timer: number) => ({ timer, dps: 5, accum: 0, tickTimer: 0 });
    expect(hasMark({ ...enemy('a', 0, 0, 0, 100), dots: { poison: dot(4) } } as Enemy, 'poison')).toBe(true);
    expect(hasMark({ ...enemy('a', 0, 0, 0, 100), dots: { poison: dot(0) } } as Enemy, 'poison')).toBe(false);
    // A poison DoT is not a venom mark: a venom tower still treats it as clean.
    expect(hasMark({ ...enemy('a', 0, 0, 0, 100), dots: { poison: dot(4) } } as Enemy, 'venom')).toBe(false);
  });

  it('never marks for a tower with no lingering status (kind "none")', () => {
    const loaded = { ...enemy('a', 0, 0, 0, 100), slowTimer: 5, stunTimer: 5, vulnTimer: 5 } as Enemy;
    expect(hasMark(loaded, 'none')).toBe(false);
  });
});

describe('selectTarget — "unmarked"', () => {
  // A venom-marked enemy (only the venom DoT is set).
  const venomed = (id: string, x: number, pathIndex: number): Enemy => {
    const dot = { timer: 4, dps: 5, accum: 0, tickTimer: 0 };
    return { ...enemy(id, x, 0, pathIndex, 100), dots: { venom: dot } } as Enemy;
  };

  it('skips an enemy already carrying THIS tower\'s mark for a clean one behind it', () => {
    const lead = venomed('lead', 110, 1); // furthest along, but already envenomed
    const clean = enemy('clean', 10, 0, 0, 100);
    expect(selectTarget([lead, clean], 0, 0, path, 'unmarked', 'venom')!.id).toBe('clean');
  });

  it('ignores marks laid by OTHER towers (only its own kind counts)', () => {
    const lead = venomed('lead', 110, 1); // envenomed by a toxic tower...
    const back = enemy('back', 10, 0, 0, 100);
    // ...but a slow (Ice) tower doesn't see venom as a mark, so it takes `first`.
    expect(selectTarget([lead, back], 0, 0, path, 'unmarked', 'slow')!.id).toBe('lead');
  });

  it('behaves as "first" for a tower with no lingering status (kind "none")', () => {
    const lead = venomed('lead', 110, 1);
    const back = enemy('back', 10, 0, 0, 100);
    expect(selectTarget([lead, back], 0, 0, path, 'unmarked', 'none')!.id).toBe('lead');
  });

  it('picks the furthest-along enemy among the clean ones', () => {
    const back = enemy('back', 10, 0, 0, 100);
    const front = enemy('front', 110, 0, 1, 100);
    expect(selectTarget([back, front], 0, 0, path, 'unmarked', 'venom')!.id).toBe('front');
  });

  it('falls back to "first" when everything in range is already marked — never idles', () => {
    const a = venomed('a', 10, 0);
    const b = venomed('b', 110, 1);
    expect(selectTarget([a, b], 0, 0, path, 'unmarked', 'venom')!.id).toBe('b');
  });
});

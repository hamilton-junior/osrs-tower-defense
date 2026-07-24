import { describe, it, expect } from 'vitest';
import {
  generateMapLayout,
  makeRng,
  orientPoint,
  edgeOf,
  type MapPoint,
  type MapEdge,
} from './map-generation';

// Box the archetypes are built in (symmetric so orientation stays in range).
const LO = 0.16;
const HI = 0.84;
const MIN_GAP = 0.15;
const EPS = 1e-6;

const SEEDS = [0, 1, 7, 42, 1337, 99999, 0xdeadbeef, 2 ** 31];
// A wide sweep so every archetype × several orientations get exercised.
const SWEEP = Array.from({ length: 600 }, (_, i) => i * 2654435761);

// ── axis-aligned segment helpers (every leg is horizontal or vertical) ──
type Seg = { a: MapPoint; b: MapPoint; horiz: boolean; vert: boolean };
function seg(a: MapPoint, b: MapPoint): Seg {
  return { a, b, horiz: Math.abs(a.fy - b.fy) < 1e-9, vert: Math.abs(a.fx - b.fx) < 1e-9 };
}
function segs(pts: MapPoint[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push(seg(pts[i], pts[i + 1]));
  return out;
}
const between = (v: number, a: number, b: number) =>
  v >= Math.min(a, b) - 1e-9 && v <= Math.max(a, b) + 1e-9;
const overlapLen = (a1: number, a2: number, b1: number, b2: number) =>
  Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2));

/** Do two axis-aligned segments touch or cross (inclusive)? */
function intersects(s: Seg, t: Seg): boolean {
  if (s.horiz && t.horiz) {
    return Math.abs(s.a.fy - t.a.fy) < 1e-9 && overlapLen(s.a.fx, s.b.fx, t.a.fx, t.b.fx) >= -1e-9;
  }
  if (s.vert && t.vert) {
    return Math.abs(s.a.fx - t.a.fx) < 1e-9 && overlapLen(s.a.fy, s.b.fy, t.a.fy, t.b.fy) >= -1e-9;
  }
  const h = s.horiz ? s : t;
  const v = s.horiz ? t : s;
  return between(v.a.fx, h.a.fx, h.b.fx) && between(h.a.fy, v.a.fy, v.b.fy);
}

describe('makeRng', () => {
  it('is deterministic per seed and stays in [0,1)', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('orientPoint', () => {
  it('is the identity at k=0', () => {
    expect(orientPoint(0.2, 0.3, 0)).toEqual({ fx: 0.2, fy: 0.3 });
  });

  it('rotates +90° about the centre at k=1', () => {
    // (x,y) → (1-y, x)
    const p = orientPoint(0.2, 0.3, 1);
    expect(p.fx).toBeCloseTo(0.7, 10);
    expect(p.fy).toBeCloseTo(0.2, 10);
  });

  it('keeps the symmetric box [LO,HI]² inside [LO,HI]² for every k', () => {
    for (let k = 0; k < 8; k++) {
      for (const [fx, fy] of [[LO, LO], [HI, HI], [LO, HI], [HI, LO], [0.5, LO], [HI, 0.5]]) {
        const p = orientPoint(fx, fy, k);
        expect(p.fx).toBeGreaterThanOrEqual(LO - EPS);
        expect(p.fx).toBeLessThanOrEqual(HI + EPS);
        expect(p.fy).toBeGreaterThanOrEqual(LO - EPS);
        expect(p.fy).toBeLessThanOrEqual(HI + EPS);
      }
    }
  });
});

describe('edgeOf', () => {
  it('names the nearest border, ties preferring x-edges', () => {
    expect(edgeOf({ fx: 0.16, fy: 0.5 })).toBe('left');
    expect(edgeOf({ fx: 0.84, fy: 0.5 })).toBe('right');
    expect(edgeOf({ fx: 0.5, fy: 0.16 })).toBe('top');
    expect(edgeOf({ fx: 0.5, fy: 0.84 })).toBe('bottom');
    expect(edgeOf({ fx: 0.16, fy: 0.16 })).toBe('left'); // corner tie → x wins
  });
});

describe('generateMapLayout', () => {
  it('is deterministic for a given seed', () => {
    for (const s of SEEDS) {
      expect(generateMapLayout(s)).toEqual(generateMapLayout(s));
    }
  });

  it('varies across seeds (not one fixed map)', () => {
    const shapes = new Set(SWEEP.slice(0, 40).map(s => JSON.stringify(generateMapLayout(s).points)));
    expect(shapes.size).toBeGreaterThan(5);
  });

  it('exercises every archetype and multiple orientations across seeds', () => {
    const archetypes = new Set<string>();
    const orientations = new Set<number>();
    for (const s of SWEEP) {
      const l = generateMapLayout(s);
      archetypes.add(l.archetype);
      orientations.add(l.orientation);
    }
    expect([...archetypes].sort()).toEqual(['detour', 'loop', 'serpentine', 'staircase']);
    expect(orientations.size).toBe(8);
  });

  it('keeps every waypoint inside the symmetric play box', () => {
    for (const s of SWEEP) {
      for (const p of generateMapLayout(s).points) {
        expect(p.fx, `fx seed ${s}`).toBeGreaterThanOrEqual(LO - EPS);
        expect(p.fx, `fx seed ${s}`).toBeLessThanOrEqual(HI + EPS);
        expect(p.fy, `fy seed ${s}`).toBeGreaterThanOrEqual(LO - EPS);
        expect(p.fy, `fy seed ${s}`).toBeLessThanOrEqual(HI + EPS);
      }
    }
  });

  it('never self-crosses (no two non-adjacent legs touch)', () => {
    for (const s of SWEEP) {
      const ss = segs(generateMapLayout(s).points);
      for (let i = 0; i < ss.length; i++) {
        for (let j = i + 2; j < ss.length; j++) {
          expect(intersects(ss[i], ss[j]), `seed ${s} segs ${i}/${j}`).toBe(false);
        }
      }
    }
  });

  it('keeps parallel legs at least MIN_GAP apart where they run alongside', () => {
    for (const s of SWEEP) {
      const ss = segs(generateMapLayout(s).points);
      for (let i = 0; i < ss.length; i++) {
        for (let j = i + 2; j < ss.length; j++) {
          const a = ss[i];
          const b = ss[j];
          if (a.horiz && b.horiz && overlapLen(a.a.fx, a.b.fx, b.a.fx, b.b.fx) > EPS) {
            expect(Math.abs(a.a.fy - b.a.fy), `H seed ${s} ${i}/${j}`).toBeGreaterThanOrEqual(MIN_GAP - EPS);
          }
          if (a.vert && b.vert && overlapLen(a.a.fy, a.b.fy, b.a.fy, b.b.fy) > EPS) {
            expect(Math.abs(a.a.fx - b.a.fx), `V seed ${s} ${i}/${j}`).toBeGreaterThanOrEqual(MIN_GAP - EPS);
          }
        }
      }
    }
  });

  it('has no zero-length legs', () => {
    for (const s of SWEEP) {
      const pts = generateMapLayout(s).points;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.abs(pts[i].fx - pts[i - 1].fx) + Math.abs(pts[i].fy - pts[i - 1].fy);
        expect(d, `seed ${s} @${i}`).toBeGreaterThan(1e-6);
      }
    }
  });

  it('places entry/exit on a real border, matching the endpoints', () => {
    const dist: Record<MapEdge, (p: MapPoint) => number> = {
      left: p => p.fx,
      right: p => 1 - p.fx,
      top: p => p.fy,
      bottom: p => 1 - p.fy,
    };
    for (const s of SWEEP) {
      const l = generateMapLayout(s);
      expect(l.entry).toBe(edgeOf(l.points[0]));
      expect(l.exit).toBe(edgeOf(l.points[l.points.length - 1]));
      // an endpoint sits within the margin band of its named border
      expect(dist[l.entry](l.points[0])).toBeLessThanOrEqual(LO + EPS);
      expect(dist[l.exit](l.points[l.points.length - 1])).toBeLessThanOrEqual(LO + EPS);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { generateMapLayout, makeRng } from './map-generation';

const SEEDS = [0, 1, 7, 42, 1337, 99999, 0xdeadbeef, 2 ** 31];

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

describe('generateMapLayout', () => {
  it('is deterministic for a given seed', () => {
    for (const s of SEEDS) {
      expect(generateMapLayout(s)).toEqual(generateMapLayout(s));
    }
  });

  it('varies across seeds (not one fixed map)', () => {
    const shapes = new Set(SEEDS.map(s => JSON.stringify(generateMapLayout(s).points)));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('uses 3–5 columns', () => {
    for (const s of SEEDS) {
      const { columns } = generateMapLayout(s);
      expect(columns).toBeGreaterThanOrEqual(3);
      expect(columns).toBeLessThanOrEqual(5);
    }
  });

  it('keeps every waypoint inside the play-field margins', () => {
    for (const s of SEEDS) {
      for (const p of generateMapLayout(s).points) {
        expect(p.fx, `fx seed ${s}`).toBeGreaterThanOrEqual(0.16 - 1e-9);
        expect(p.fx, `fx seed ${s}`).toBeLessThanOrEqual(0.84 + 1e-9);
        expect(p.fy, `fy seed ${s}`).toBeGreaterThanOrEqual(0.14 - 1e-9);
        expect(p.fy, `fy seed ${s}`).toBeLessThanOrEqual(0.86 + 1e-9);
      }
    }
  });

  it('marches strictly left→right (x never decreases, columns well-separated)', () => {
    for (const s of SEEDS) {
      const pts = generateMapLayout(s).points;
      for (let i = 1; i < pts.length; i++) {
        expect(pts[i].fx, `seed ${s} @${i}`).toBeGreaterThanOrEqual(pts[i - 1].fx - 1e-9);
      }
      // distinct column x's are at least ~MIN_COL_GAP apart → room to build between legs
      const cols = [...new Set(pts.map(p => Math.round(p.fx * 1e4) / 1e4))].sort((a, b) => a - b);
      for (let i = 1; i < cols.length; i++) {
        expect(cols[i] - cols[i - 1], `col gap seed ${s}`).toBeGreaterThanOrEqual(0.15 - 1e-6);
      }
    }
  });

  it('every vertical leg is a substantial up/down (no degenerate turns)', () => {
    for (const s of SEEDS) {
      const pts = generateMapLayout(s).points;
      for (let i = 1; i < pts.length; i++) {
        const dx = Math.abs(pts[i].fx - pts[i - 1].fx);
        const dy = Math.abs(pts[i].fy - pts[i - 1].fy);
        // a leg is either horizontal (dx>0, dy≈0) or vertical (dy≥MIN_ROW_GAP)
        if (dx < 1e-6) expect(dy, `vert leg seed ${s} @${i}`).toBeGreaterThanOrEqual(0.22 - 1e-6);
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import type { Point } from '../types';
import { generateMapLayout, type MapLayout, type MapEdge } from './map-generation';
import {
  generateTerrain,
  computeRoadTiles,
  CORRIDOR_RADIUS,
  REPAIR_RADIUS,
  MIN_OPEN_NEAR,
  MAX_PATCHES,
} from './terrain-generation';

// The board's fixed resolution (mirrors the engine constants).
const W = 1728;
const H = 768;
const GRID = 32;
const COLS = W / GRID; // 54
const ROWS = H / GRID; // 24

// Build the road polyline the way the engine's buildPath does, so terrain sees a
// realistic path (snapped vertices + off-screen entry/exit stubs).
function toPath(layout: MapLayout): Point[] {
  const tx = Math.floor(W / GRID);
  const ty = Math.floor(H / GRID);
  const pts = layout.points.map(p => ({ x: Math.round(tx * p.fx) * GRID, y: Math.round(ty * p.fy) * GRID }));
  const stub = (p: Point, edge: MapEdge): Point => {
    switch (edge) {
      case 'right': return { x: W + GRID, y: p.y };
      case 'top': return { x: p.x, y: -GRID };
      case 'bottom': return { x: p.x, y: H + GRID };
      default: return { x: -GRID, y: p.y };
    }
  };
  return [stub(pts[0], layout.entry), ...pts, stub(pts[pts.length - 1], layout.exit)];
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 2654435761);
const PATHS = SEEDS.map(s => ({ seed: s, path: toPath(generateMapLayout(s)) }));

describe('generateTerrain', () => {
  it('is deterministic for a given seed + path', () => {
    for (const { seed, path } of PATHS.slice(0, 8)) {
      const a = generateTerrain(seed, path, COLS, ROWS, GRID);
      const b = generateTerrain(seed, path, COLS, ROWS, GRID);
      expect(a).toEqual(b);
    }
  });

  it('produces a well-formed field of valid flags', () => {
    for (const { seed, path } of PATHS) {
      const t = generateTerrain(seed, path, COLS, ROWS, GRID);
      expect(t.cols).toBe(COLS);
      expect(t.rows).toBe(ROWS);
      expect(t.tiles).toHaveLength(COLS * ROWS);
      for (const f of t.tiles) expect(['open', 'blocked', 'unbuildable', 'farming']).toContain(f);
    }
  });

  it('never puts an obstacle or zone on a road tile', () => {
    for (const { seed, path } of PATHS) {
      const t = generateTerrain(seed, path, COLS, ROWS, GRID);
      const road = computeRoadTiles(path, COLS, ROWS, GRID);
      for (let i = 0; i < t.tiles.length; i++) {
        if (road[i]) expect(t.tiles[i], `seed ${seed} tile ${i}`).toBe('open');
      }
    }
  });

  it('keeps the build corridor (≤ CORRIDOR_RADIUS from road) open', () => {
    for (const { seed, path } of PATHS) {
      const t = generateTerrain(seed, path, COLS, ROWS, GRID);
      const road = computeRoadTiles(path, COLS, ROWS, GRID);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          // is this tile within CORRIDOR_RADIUS of a road tile?
          let near = false;
          for (let dr = -CORRIDOR_RADIUS; dr <= CORRIDOR_RADIUS && !near; dr++) {
            for (let dc = -CORRIDOR_RADIUS; dc <= CORRIDOR_RADIUS; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
              if (road[nr * COLS + nc]) { near = true; break; }
            }
          }
          if (near) expect(t.tiles[r * COLS + c], `seed ${seed} @${c},${r}`).toBe('open');
        }
      }
    }
  });

  it('guarantees defensibility: every road tile has ≥ MIN_OPEN_NEAR open neighbours', () => {
    for (const { seed, path } of PATHS) {
      const t = generateTerrain(seed, path, COLS, ROWS, GRID);
      const road = computeRoadTiles(path, COLS, ROWS, GRID);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!road[r * COLS + c]) continue;
          let open = 0;
          for (let dr = -REPAIR_RADIUS; dr <= REPAIR_RADIUS; dr++) {
            for (let dc = -REPAIR_RADIUS; dc <= REPAIR_RADIUS; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
              const idx = nr * COLS + nc;
              if (!road[idx] && t.tiles[idx] === 'open') open++;
            }
          }
          expect(open, `seed ${seed} road @${c},${r}`).toBeGreaterThanOrEqual(MIN_OPEN_NEAR);
        }
      }
    }
  });

  it('actually places some obstacles, but never floods the board', () => {
    for (const { seed, path } of PATHS) {
      const t = generateTerrain(seed, path, COLS, ROWS, GRID);
      const obstacles = t.tiles.filter(f => f !== 'open').length;
      expect(obstacles, `seed ${seed} has obstacles`).toBeGreaterThan(0);
      expect(obstacles, `seed ${seed} not flooded`).toBeLessThan(t.tiles.length * 0.4);
    }
  });

  it('places decorations only on open, non-road tiles', () => {
    for (const { seed, path } of PATHS.slice(0, 20)) {
      const t = generateTerrain(seed, path, COLS, ROWS, GRID);
      const road = computeRoadTiles(path, COLS, ROWS, GRID);
      for (const d of t.decorations) {
        const idx = d.row * COLS + d.col;
        expect(t.tiles[idx]).toBe('open');
        expect(road[idx]).toBe(false);
      }
    }
  });

  // Farming patches are carved out of ground that was already taken, so every
  // guarantee above (corridor, coverage, defensibility) sees the same field with
  // or without them. These three pin that down.
  describe('farming patches', () => {
    it('deals one or two, and flags each of them on the tile grid', () => {
      for (const { seed, path } of PATHS) {
        const t = generateTerrain(seed, path, COLS, ROWS, GRID);
        expect(t.patches.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
        expect(t.patches.length, `seed ${seed}`).toBeLessThanOrEqual(MAX_PATCHES);
        for (const p of t.patches) {
          expect(t.tiles[p.row * COLS + p.col], `seed ${seed} @${p.col},${p.row}`).toBe('farming');
        }
        expect(t.tiles.filter(f => f === 'farming')).toHaveLength(t.patches.length);
      }
    });

    it('never takes open ground, the road, or the build corridor', () => {
      for (const { seed, path } of PATHS) {
        const t = generateTerrain(seed, path, COLS, ROWS, GRID);
        const road = computeRoadTiles(path, COLS, ROWS, GRID);
        for (const p of t.patches) {
          expect(road[p.row * COLS + p.col], `seed ${seed} on road`).toBe(false);
          // Inside the corridor everything is open, and a patch only ever
          // replaces a tile that was not.
          let nearRoad = false;
          for (let dr = -CORRIDOR_RADIUS; dr <= CORRIDOR_RADIUS && !nearRoad; dr++) {
            for (let dc = -CORRIDOR_RADIUS; dc <= CORRIDOR_RADIUS; dc++) {
              const nr = p.row + dr;
              const nc = p.col + dc;
              if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
              if (road[nr * COLS + nc]) { nearRoad = true; break; }
            }
          }
          expect(nearRoad, `seed ${seed} in corridor`).toBe(false);
        }
      }
    });

    it('keeps a pair apart, so they read as two plots', () => {
      for (const { seed, path } of PATHS) {
        const { patches } = generateTerrain(seed, path, COLS, ROWS, GRID);
        if (patches.length < 2) continue;
        const [a, b] = patches;
        expect(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)), `seed ${seed}`)
          .toBeGreaterThanOrEqual(5);
      }
    });
  });

  it('varies terrain across seeds', () => {
    const fingerprints = new Set(PATHS.slice(0, 30).map(({ seed, path }) =>
      generateTerrain(seed, path, COLS, ROWS, GRID).tiles.join('')));
    expect(fingerprints.size).toBeGreaterThan(10);
  });
});

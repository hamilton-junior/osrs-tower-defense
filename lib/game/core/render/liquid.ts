import { GRID } from './shared';
import { liquidPalette } from './terrain';
import type { LiquidKind } from '../../systems/terrain-generation';
import type { GameRenderer } from '../renderer';

/**
 * **The moving surface of every pool.** Everything else about the board is static
 * and lives in the background bake; water and lava are the exception, because the
 * client animates their textures — it scrolls the u/v of texture 24 and 59 by
 * `animationSpeed` pixels every 20ms engine tick along `animationDirection`.
 *
 * The cost of that has to be O(1) in pool size, not O(tiles): at 5× speed the
 * simulation already runs five times per frame and the render budget is at its
 * tightest. So each liquid kind's tiles are welded once into a single `Path2D`
 * when the background is baked, and a frame is then a clip, a translate and one
 * `fillRect` of a repeating pattern — about six canvas calls no matter how much
 * water the map dealt. The foam rim stays in the bake, where it costs nothing.
 */

/** How much board one liquid-texture square covers, in logic px — the same square
 *  the ground is tiled at, so a shoreline reads at one scale. */
const LIQUID_TILE = 64;

/**
 * Scroll rate in logic px per second, per kind, straight off the cache: texture 24
 * (water) carries `animationSpeed` 2 and texture 59 (lava) carries 1, both on
 * direction 1. The client applies that per 20ms tick over the texture's own 128px,
 * which is `speed * 50` texture-px per second; mapping the square onto
 * `LIQUID_TILE` px of board scales it by `LIQUID_TILE / 128`.
 */
const SCROLL: Record<LiquidKind, number> = {
  water: 2 * 50 * (LIQUID_TILE / 128),
  lava: 1 * 50 * (LIQUID_TILE / 128),
};

interface LiquidBody {
  kind: LiquidKind;
  path: Path2D;
  /** Tile-aligned bounds, so the pattern fill covers the body and nothing else. */
  x0: number; y0: number; x1: number; y1: number;
}

/** Weld each kind's water tiles into one path. Called from the background bake, so
 *  it runs once per map rather than once per frame. */
export function buildLiquidBodies(gr: GameRenderer): LiquidBody[] {
  const t = gr.e.terrain;
  const byKind = new Map<LiquidKind, LiquidBody>();
  for (let i = 0; i < t.tiles.length; i++) {
    if (t.tiles[i] !== 'water') continue;
    const kind = t.liquid[i] ?? 'water';
    const x0 = (i % t.cols) * GRID;
    const y0 = ((i / t.cols) | 0) * GRID;
    let body = byKind.get(kind);
    if (!body) {
      body = { kind, path: new Path2D(), x0, y0, x1: x0 + GRID, y1: y0 + GRID };
      byKind.set(kind, body);
    }
    body.path.rect(x0, y0, GRID, GRID);
    body.x0 = Math.min(body.x0, x0);
    body.y0 = Math.min(body.y0, y0);
    body.x1 = Math.max(body.x1, x0 + GRID);
    body.y1 = Math.max(body.y1, y0 + GRID);
  }
  return [...byKind.values()];
}

export function drawLiquid(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const bodies = gr.liquidBodies;
  if (bodies.length === 0) return;
  // `runSeconds` is the engine's wall clock: it takes the raw frame dt outside the
  // sub-step loop and stops while paused. Driving the scroll from it is what keeps
  // 5× from strobing the lava and what freezes the board when combat is paused.
  const time = gr.e.runSeconds;
  for (const body of bodies) {
    const key = body.kind === 'lava' ? 'liquid_lava' : 'liquid_water';
    if (!gr.e.imageOk(key)) continue;
    const img = gr.e.images.get(key);
    if (!img) continue;
    let pat = gr.liquidPatterns.get(body.kind);
    if (!pat) {
      const made = ctx.createPattern(img, 'repeat');
      if (!made) continue;
      made.setTransform(new DOMMatrix([
        LIQUID_TILE / img.width, 0, 0, LIQUID_TILE / img.height, 0, 0,
      ]));
      pat = made;
      gr.liquidPatterns.set(body.kind, pat);
    }
    const off = (time * SCROLL[body.kind]) % LIQUID_TILE;
    const { deep } = liquidPalette(gr, body.kind);
    ctx.save();
    ctx.clip(body.path);
    ctx.translate(off, 0);
    ctx.fillStyle = pat;
    ctx.fillRect(body.x0 - LIQUID_TILE, body.y0, body.x1 - body.x0 + LIQUID_TILE, body.y1 - body.y0);
    ctx.translate(-off, 0);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = deep;
    ctx.fillRect(body.x0, body.y0, body.x1 - body.x0, body.y1 - body.y0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

import { GRID } from './shared';
import { liquidPalette } from './terrain';
import type { LiquidKind } from '../../systems/terrain-generation';
import type { GameRenderer } from '../renderer';

/**
 * **The surface of every pool.** Water and lava are textures the client animates,
 * scrolling their u/v along a fixed direction — the board does not. The camera
 * here never moves, and a floor that slides under a fixed camera reads as the
 * whole board sliding rather than as water flowing, so both liquids are painted
 * still and baked into the static background with the ground.
 *
 * The cost of that is still worth keeping O(1) in pool size, because the bake runs
 * again on every re-skin: each kind's tiles are welded into a single `Path2D`, and
 * painting it is a clip and two `fillRect`s no matter how much water the map
 * dealt. The foam rim is drawn per tile by the terrain pass, over which this goes.
 */

/** How much board one liquid-texture square covers, in logic px — the same square
 *  the ground is tiled at, so a shoreline reads at one scale. */
const LIQUID_TILE = 64;

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

export function paintLiquid(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const body of gr.liquidBodies) {
    const key = body.kind === 'lava' ? 'liquid_lava' : 'liquid_water';
    if (!gr.e.imageOk(key)) continue;
    const img = gr.e.images.get(key);
    if (!img) continue;
    const pat = ctx.createPattern(img, 'repeat');
    if (!pat) continue;
    pat.setTransform(new DOMMatrix([
      LIQUID_TILE / img.width, 0, 0, LIQUID_TILE / img.height, 0, 0,
    ]));
    const { deep } = liquidPalette(gr, body.kind);
    ctx.save();
    ctx.clip(body.path);
    ctx.fillStyle = pat;
    ctx.fillRect(body.x0, body.y0, body.x1 - body.x0, body.y1 - body.y0);
    // The region's own deep tone over the cache texture, at the same low alpha the
    // ground wears its gradient: it is what makes Morytania's water swamp-green and
    // Trollweiss's meltwater blue out of one texture.
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = deep;
    ctx.fillRect(body.x0, body.y0, body.x1 - body.x0, body.y1 - body.y0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

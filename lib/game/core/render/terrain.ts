import { SPOTANIMS, spotAnimDurationS } from '../../data/spotanims';
import { distance } from '../../systems/geometry';
import type { GameRenderer } from '../renderer';
import { CLUSTERED_SCENERY, LAVA_PALETTE, SCENERY_LIMIT, type SceneryId } from '../../data/biomes';
import { buildLiquidBodies, paintLiquid } from './liquid';
import type { LiquidKind } from '../../systems/terrain-generation';
import { GRID, shade, hash2 } from './shared';
import { drawSpotAnimGfx } from './shot-art';

/** How much board a single ground-texture square covers, in logic px. */
export const GROUND_TILE = 64;
/** How hard the region's gradient is pushed back over its own floor texture. */
const GROUND_TINT = 0.42;
/** How wide one blot of a region's accent floor texture is, in logic px — two
 *  ground squares across, so a patch of it spans a few board tiles. */
const ACCENT_BLOT = GROUND_TILE * 2;

/**
 * **Stand one of the region's props on a tile.**
 *
 * The prop is drawn *bottom-anchored*: the sprite's base sits on the tile's
 * ground line and the rest of it rises into the tile above, the way the client
 * stands a LOC on the ground. Centring it in the square instead made a tree look
 * like it floated over the road behind it, and a tall prop could never overhang.
 *
 * The base is the shadow's line, not the bottom of the image box, and the two are
 * the same thing only because the bakes are trimmed to their painted pixels
 * (`crop` in scripts/render-osrs-objects.mjs). Before that trim a prop stood on
 * the bottom edge of a 256px square holding up to 41% empty below it, which is
 * exactly how far it floated over its own shadow.
 *
 * `pick` chooses which of the region's props this tile gets — the caller hashes
 * the tile's own coordinates for it, so the same seed deals the same board twice.
 * A contact shadow goes down first: the bakes are cut out with no ground under
 * them, and without it every prop looks pasted on.
 *
 * Returns false when the sprite has not loaded, so each caller can fall back to
 * the procedural shape it drew before the bakes existed.
 */
function drawProp(
  gr: GameRenderer,
  ctx: CanvasRenderingContext2D,
  list: readonly SceneryId[],
  pick: number,
  col: number,
  row: number,
  scale: number,
  jx = 0,
  jy = 0,
): boolean {
  if (list.length === 0) return false;
  const idx = pickWithRoom(list, pick);
  if (idx < 0) return false;
  const id = list[idx];
  const key = `scenery_${id}`;
  if (!gr.e.imageOk(key)) return false;
  const img = gr.e.images.get(key);
  if (!img || !img.width) return false;
  let w = GRID * scale;
  let h = w * (img.height / img.width);
  // Nothing stands taller than `MAX_PROP_TILES`. `scale` sets a prop's *width*,
  // so a bake that is narrow and tall — a dead arctic pine is 54×204 — came out
  // five tiles high and swallowed the board behind it. Capping the height and
  // taking the width down with it keeps the model's proportions and cuts the
  // giants roughly in half, while a prop already under the cap is untouched.
  const cap = GRID * MAX_PROP_TILES;
  if (h > cap) {
    w *= cap / h;
    h = cap;
  }
  const cx = col * GRID + GRID / 2 + jx;
  // Where the prop meets the ground: a little above the tile's bottom edge, so it
  // reads as standing *in* its square rather than on the line below it.
  const groundY = (row + 1) * GRID + jy - GRID * 0.12;
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, groundY, w * 0.3, w * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.drawImage(img, cx - w / 2, groundY - h, w, h);
  propUsed.set(id, (propUsed.get(id) ?? 0) + 1);
  return true;
}

/**
 * Copies of each capped prop already standing on this board. `drawTerrain` bakes
 * the whole board in one pass, so counting as we draw and clearing at the start of
 * that pass is the entire bookkeeping — and a prop only counts once it is really
 * on the canvas, never when its sprite was still loading.
 */
const propUsed = new Map<SceneryId, number>();

/**
 * The first prop at or after `pick` the board still has room for, or -1 when the
 * whole list is spent. Walking on rather than giving up keeps the tile furnished:
 * the Wilderness tile that would have been the second chaos altar gets the pillar
 * next to it in the region's list instead (see `SCENERY_LIMIT`).
 */
function pickWithRoom(list: readonly SceneryId[], pick: number): number {
  for (let i = 0; i < list.length; i++) {
    const idx = (pick + i) % list.length;
    const limit = SCENERY_LIMIT[list[idx]];
    if (limit === undefined || (propUsed.get(list[idx]) ?? 0) < limit) return idx;
  }
  return -1;
}

/** The tallest a prop may be drawn, in tiles. See the cap in `drawProp`. */
const MAX_PROP_TILES = 1.75;

/** How wide and how deep one patch of ground is, in tiles. A clustered prop is
 *  dealt once per patch, so a run of fence spans a few tiles across and reads as
 *  a wall rather than as posts someone dropped. */
const PATCH_COLS = 4;
const PATCH_ROWS = 2;

/**
 * **Which of the region's props this tile gets.**
 *
 * `tile` is the caller's own per-tile deal — every tile picks for itself, which is
 * what a mixed wood should look like. Some props are not like that: a fence panel,
 * a grave or a bed of toadstools only reads right with its own kind beside it (see
 * `CLUSTERED_SCENERY`). Those are dealt once per patch of ground instead, so the
 * whole patch agrees.
 *
 * A tile hands its own deal back only when neither deal is a clustered prop —
 * otherwise the patch wins, which is also what keeps a clustered prop from ever
 * standing alone: it can only arrive through a patch, and a patch brings its
 * neighbours with it.
 */
function propPick(
  list: readonly SceneryId[],
  col: number,
  row: number,
  tile: number,
  salt: number,
): number {
  if (list.length === 0) return tile;
  const patch =
    (hash2(Math.floor(col / PATCH_COLS) * 6.7 + salt * 3.1, Math.floor(row / PATCH_ROWS) * 4.3) * 97) | 0;
  if (CLUSTERED_SCENERY.has(list[patch % list.length])) return patch;
  if (CLUSTERED_SCENERY.has(list[tile % list.length])) return patch;
  return tile;
}

/**
 * How many of the active region's props have loaded. The static bake keys on this
 * (see `bgScenery`): the sprites arrive one at a time over the run's first frames,
 * and a board baked halfway through would keep whichever tiles missed out drawn as
 * procedural rock for the rest of the run.
 */
/**
 * The region's floor textures, in the order it lists them, and only the ones that
 * have arrived. A region carries more than one (see `paintGround`), and they load
 * one at a time like every other sprite — the background bake keys on the count.
 */
export function groundImages(gr: GameRenderer): HTMLImageElement[] {
  const out: HTMLImageElement[] = [];
  for (let i = 0; i < 4; i++) {
    const key = `ground_${gr.e.biome.id}_${i}`;
    if (!gr.e.imageOk(key)) break;
    const img = gr.e.images.get(key);
    if (!img) break;
    out.push(img);
  }
  return out;
}

export function sceneryLoaded(gr: GameRenderer): number {
  const { block, rough, prop } = gr.e.biome.scenery;
  let n = 0;
  // Counted with duplicates and no allocation: this runs on every frame, and all
  // the comparison needs is a number that changes as each sprite lands.
  for (const id of block) if (gr.e.imageOk(`scenery_${id}`)) n++;
  for (const id of rough) if (gr.e.imageOk(`scenery_${id}`)) n++;
  for (const id of prop) if (gr.e.imageOk(`scenery_${id}`)) n++;
  return n;
}

/** The palette a pool is drawn with: the region's water, or the one lava wears
 *  everywhere. Both shapes are identical, so nothing downstream branches. */
export function liquidPalette(gr: GameRenderer, kind: LiquidKind) {
  return kind === 'lava' ? LAVA_PALETTE : gr.e.biome.water;
}

/**
 * The board itself: biome ground, terrain features, the road and its gravel, and
 * the spawn portal. The static half is baked into an offscreen canvas once per
 * map (see `bgCache` on the renderer) and blitted every frame.
 */

export function drawBackground(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const w = gr.e.width;
  const h = gr.e.height;
  const scale = gr.e.deviceScale;
  if (
    gr.bgCache === null || gr.bgCtx === null ||
    gr.bgTerrain !== gr.e.terrain || gr.bgTerrainEpoch !== gr.e.terrainEpoch ||
    gr.bgBiome !== gr.e.biome.id ||
    gr.bgW !== w || gr.bgH !== h || gr.bgScale !== scale ||
    gr.bgWater !== gr.e.imageOk('liquid_water') ||
    gr.bgGround !== groundImages(gr).length ||
    gr.bgScenery !== sceneryLoaded(gr)
  ) {
    if (!gr.bgCache) {
      gr.bgCache = document.createElement('canvas');
      gr.bgCtx = gr.bgCache.getContext('2d');
    }
    // Cache at the board's displayed resolution so the static terrain/grid is
    // crisp too, then scale the buffer's context so it still draws in logic units.
    gr.bgCache.width = Math.round(w * scale);
    gr.bgCache.height = Math.round(h * scale);
    // The pools' welded outlines come first: the bake paints their surface, so it
    // needs them. Same invalidation, same moment — they are only ever rebuilt when
    // the map that dealt them changes.
    gr.liquidBodies = buildLiquidBodies(gr);
    if (gr.bgCtx) {
      gr.bgCtx.setTransform(scale, 0, 0, scale, 0, 0);
      renderStaticBackground(gr, gr.bgCtx, w, h);
    }
    gr.bgTerrain = gr.e.terrain;
    gr.bgTerrainEpoch = gr.e.terrainEpoch;
    gr.bgBiome = gr.e.biome.id;
    gr.bgW = w;
    gr.bgH = h;
    gr.bgScale = scale;
    gr.bgWater = gr.e.imageOk('liquid_water');
    gr.bgGround = groundImages(gr).length;
    gr.bgScenery = sceneryLoaded(gr);
  }
  // The parent ctx is already scaled by `deviceScale`; draw the buffer back into
  // the logic rect so it lands 1:1 on the backing store.
  ctx.drawImage(gr.bgCache, 0, 0, w, h);
}

export function renderStaticBackground(gr: GameRenderer, ctx: CanvasRenderingContext2D, w: number, h: number) {
  const biome = gr.e.biome;

  // Ground base with a soft vertical gradient (biome-themed). It is the whole floor
  // until the region's texture arrives, and the lighting over it afterwards.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, biome.bgTop);
  grad.addColorStop(1, biome.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // …then the region's own floor, out of the cache, laid at one texture square per
  // `GROUND_TILE` px of board. OSRS maps one square per game tile, but a game tile
  // is far bigger on screen than our 32px board tile, so a 1:1 mapping squeezed a
  // 128px texture into 32 and turned every ground into noise. Two board tiles per
  // square is the compromise that keeps the grain legible.
  paintGround(gr, ctx, w, h, grad);

  // Texture: scattered ground tufts (two tones) for a less flat field.
  for (let i = 0; i < 220; i++) {
    const x = (i * 137.5) % w;
    const y = (i * 224.7) % h;
    ctx.fillStyle = i % 3 === 0 ? biome.tuft[0] : biome.tuft[1];
    ctx.fillRect(x, y, 2, 2);
    ctx.fillRect(x + 2, y + 2, 2, 4);
  }

  // Faint tile grid (biome-tinted). It is the board's own ruling, so it goes down
  // before anything that stands on a square: the pools have always covered it, and
  // now the props do too.
  ctx.strokeStyle = biome.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += GRID) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += GRID) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Floor before furniture: the pools, and then everything that stands on the
  // board. A prop is bottom-anchored and may be several tiles tall, so it has to
  // be free to hang over the water behind it.
  drawPools(gr, ctx);
  drawTerrain(gr, ctx);
}

/**
 * **The region's floor.** The first of the region's textures fills the whole board
 * as one repeating pattern, and every texture after it is stamped over that as
 * scattered soft-edged blots.
 *
 * The base used to be drawn square by square, each square turned on a hash of its
 * own coordinates, to break the repeat. It broke the repeat and it also left a
 * seam: a turned square lands its edges on fractional device pixels, and on a
 * texture with any direction to it — Al Kharid's sand is ripple lines and nothing
 * else — every one of those edges read as a ruled line across the desert. A
 * pattern fill has no edges at all, so the variation has to come from somewhere
 * that cannot draw one.
 *
 * That is what the blots are for. Two cache textures that both suit a region still
 * differ in brightness far more than two patches of the same ground do, so dealing
 * a second texture square for square paved every region with a quilt — and dropping
 * the odd square to half alpha only made a fainter quilt, because the eye reads the
 * straight edge, not the contrast. Each accent is laid instead as a round blot with
 * a faded rim ({@link accentBrush}), scattered, turned and skipped at random, and a
 * region can carry as many as it has textures: a third one is a third scatter with
 * its own salt, which is how Misthalin gets its trodden dirt and Mor Ul Rek its
 * lava seams.
 *
 * The region's gradient goes back over the top at a low alpha instead of under it:
 * that is what keeps Morytania's silt sickly and Al Kharid's sand sun-bleached,
 * when the same texture would otherwise read as its raw cache colour everywhere.
 *
 * It costs one fill plus ~70 blots per accent, once per bake, and nothing per frame.
 */
function paintGround(
  gr: GameRenderer,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  grad: CanvasGradient,
) {
  const floors = groundImages(gr);
  if (floors.length === 0) return;

  const base = ctx.createPattern(floors[0], 'repeat');
  if (base) {
    base.setTransform(new DOMMatrix([
      GROUND_TILE / floors[0].width, 0, 0, GROUND_TILE / floors[0].height, 0, 0,
    ]));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
  }

  // A region may wash its base floor before anything is scattered over it (see
  // `groundWash`). It goes here and not with the gradient at the end because it is
  // the floor's own colour, not the region's light: Mor Ul Rek's basalt has to go
  // black while its lava stays lit, and anything laid after the accents darkens
  // both together.
  if (gr.e.biome.groundWash) {
    ctx.fillStyle = gr.e.biome.groundWash;
    ctx.fillRect(0, 0, w, h);
  }

  // One scatter per accent texture. A blot per two-tile cell, jittered off its cell
  // so the scatter keeps no grid of its own, skipped on a little over half of them
  // so there is bare ground between the patches, and salted per layer so a region's
  // second and third textures never land on the same cells.
  //
  // Layer 0 is the base texture stamped back over itself. None of the cache floors
  // tiles perfectly, and on the flattest of them — meadow grass, snow — the repeat
  // reads as a faint grid across the whole board. Same texture means no quilt, and
  // the random angle breaks the grid, so it is laid almost everywhere (it skips
  // under a tenth of the cells) where a real accent covers about half.
  const step = ACCENT_BLOT;
  for (let f = 0; f < floors.length; f++) {
    const brush = accentBrush(floors[f]);
    if (!brush) continue;
    const salt = f * 31.7;
    const skip = f === 0 ? 0.08 : 0.46;
    for (let y = -step; y < h + step; y += step) {
      for (let x = -step; x < w + step; x += step) {
        const n = hash2(x * 0.21 + 3.1 + salt, y * 0.17 + 9.4 + salt);
        if (n < skip) continue;
        const jx = (hash2(x * 0.71 + 5.5 + salt, y * 0.31 + 2.2) - 0.5) * step;
        const jy = (hash2(x * 0.13 + 8.8, y * 0.91 + 6.4 + salt) - 0.5) * step;
        ctx.save();
        ctx.globalAlpha = 0.3 + n * 0.3;
        ctx.translate(x + step / 2 + jx, y + step / 2 + jy);
        ctx.rotate(n * Math.PI * 2);
        ctx.drawImage(brush, -step / 2, -step / 2, step, step);
        ctx.restore();
      }
    }
  }

  ctx.globalAlpha = GROUND_TINT;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

/**
 * One blot of a floor texture: the texture tiled across a square, then masked with
 * a radial gradient so it fades to nothing well before the square's edge. Stamped
 * by {@link paintGround} to vary a region's ground without laying an edge anywhere.
 *
 * Built fresh per bake rather than cached: it is two fills of a 128px canvas, and a
 * cache would have to be keyed on the region and invalidated with the background it
 * is drawn into.
 */
function accentBrush(img: HTMLImageElement): HTMLCanvasElement | null {
  const size = ACCENT_BLOT;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const c = cv.getContext('2d');
  if (!c) return null;
  const pat = c.createPattern(img, 'repeat');
  if (!pat) return null;
  pat.setTransform(new DOMMatrix([GROUND_TILE / img.width, 0, 0, GROUND_TILE / img.height, 0, 0]));
  c.fillStyle = pat;
  c.fillRect(0, 0, size, size);
  const mask = c.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = mask;
  c.fillRect(0, 0, size, size);
  return cv;
}

/**
 * One tile's worth of flat colour with its edges faded out, used for the rough-ground
 * wash. Same trick as {@link accentBrush} at tile size: the square is filled, then a
 * radial gradient masks it through `destination-in`.
 */
function softSquare(color: string): HTMLCanvasElement | null {
  const cv = document.createElement('canvas');
  cv.width = GRID;
  cv.height = GRID;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.fillStyle = color;
  c.fillRect(0, 0, GRID, GRID);
  const mask = c.createRadialGradient(GRID / 2, GRID / 2, GRID * 0.2, GRID / 2, GRID / 2, GRID * 0.62);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = mask;
  c.fillRect(0, 0, GRID, GRID);
  return cv;
}

/**
 * **Every pool on the board.** Split out of `drawTerrain` and painted before it,
 * because a pool is floor. The props that stand next to water are taller than
 * their own tile and hang over the tiles above them, and while the pools went
 * down last every one of those overhangs was cut off at the shoreline: a tree on
 * the bank lost the half of its trunk that reached across. Floor first, then
 * everything standing on it.
 *
 * The rim is the tile's own edge tested against its neighbours, so a blob reads
 * as one pool rather than four squares.
 *
 * The surface is the client's own liquid texture — water (24) or lava (59),
 * whichever this pool rolled — laid one texture square per board tile, the same
 * deal the farming allotment gets from its soil sprite. A palette tint goes over
 * the top: Morytania's swamp and Al Kharid's lagoon are the same water lit
 * differently, and the palette is what tells them apart.
 */
export function drawPools(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const t = gr.e.terrain;
  if (t.cols === 0) return;
  const cols = t.cols;
  const isWater = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < cols && r < t.rows && t.tiles[r * cols + c] === 'water';
  for (let i = 0; i < t.tiles.length; i++) {
    if (t.tiles[i] !== 'water') continue;
    const c = i % cols;
    const r = (i / cols) | 0;
    const x0 = c * GRID;
    const y0 = r * GRID;
    const { deep, shallow, foam } = liquidPalette(gr, t.liquid[i]);
    const kindKey = t.liquid[i] === 'lava' ? 'liquid_lava' : 'liquid_water';
    const surface = gr.e.imageOk(kindKey) ? gr.e.images.get(kindKey) : null;
    ctx.globalAlpha = 1;
    if (surface) {
      // The still version of the pool. `render/liquid.ts` scrolls the same texture
      // over the top every frame; this is what the board falls back to on the frames
      // before that layer has a pattern, and it means a pool is never a bare hole.
      ctx.drawImage(surface, x0, y0, GRID, GRID);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = deep;
      ctx.fillRect(x0, y0, GRID, GRID);
    } else {
      // Until the texture loads — and on the frame the board is first dealt — the
      // pool is flat biome colour with a lighter middle, so it still reads as
      // water with depth rather than as a hole in the map.
      ctx.fillStyle = deep;
      ctx.fillRect(x0, y0, GRID, GRID);
      ctx.fillStyle = shallow;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x0 + 5, y0 + 5, GRID - 10, GRID - 10);
    }
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = foam;
    if (!isWater(c, r - 1)) ctx.fillRect(x0, y0, GRID, 2);
    if (!isWater(c, r + 1)) ctx.fillRect(x0, y0 + GRID - 2, GRID, 2);
    if (!isWater(c - 1, r)) ctx.fillRect(x0, y0, 2, GRID);
    if (!isWater(c + 1, r)) ctx.fillRect(x0 + GRID - 2, y0, 2, GRID);
  }
  ctx.globalAlpha = 1;
  // The welded pattern fill goes over the per-tile still fill and its foam — the
  // order those two have always had. Only the whole stack moved, under the props.
  paintLiquid(gr, ctx);
}

/**
 * Draw the run's terrain field (from the engine): non-buildable zones as textured
 * rough ground, hard obstacles as shaded boulders, and cosmetic scenery (bushes /
 * rocks / flowers / grass) on open ground — all derived from the active biome's
 * palette, so obstacles read as impassable while the field re-skins per region.
 * Rendered once per run into the background cache, so it can afford the detail.
 */
export function drawTerrain(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const t = gr.e.terrain;
  if (t.cols === 0) return;
  // One pass over the board is one board's worth of landmarks (see `SCENERY_LIMIT`).
  propUsed.clear();
  const { bush, rock, rockHi, flowers } = gr.e.biome.decor;
  const scenery = gr.e.biome.scenery;
  const rockDark = shade(rock, 0.6);
  const rockCrack = shade(rock, 0.45);
  const bushDark = shade(bush, 0.62);
  const bushLight = shade(bush, 1.28);
  const cols = t.cols;
  // The rough-ground wash, feathered rather than a flat square. A hard-edged tint
  // turned every non-buildable tile into a grid cell you could count on pale ground
  // — Trollweiss snow worst of all. The middle keeps the full tint, so the tile
  // still reads as rough; only its border fades away.
  const roughTint = softSquare(bush);

  // ── Non-buildable zones: rough ground — a soft tint, then one of the region's
  // undergrowth props, so it reads as overgrown terrain you can't build on rather
  // than a flat wash. The tint stays under the prop: it is what marks the tile's
  // full square, and the prop only covers the middle of it. ──
  for (let i = 0; i < t.tiles.length; i++) {
    if (t.tiles[i] !== 'unbuildable') continue;
    const c = i % cols;
    const r = (i / cols) | 0;
    const x0 = c * GRID;
    const y0 = r * GRID;
    ctx.globalAlpha = 0.16;
    if (roughTint) ctx.drawImage(roughTint, x0, y0);
    else {
      ctx.fillStyle = bush;
      ctx.fillRect(x0, y0, GRID, GRID);
    }
    ctx.globalAlpha = 1;
    const roughPick = propPick(scenery.rough, c, r, (hash2(c * 5.1, r * 3.9) * 97) | 0, 0);
    if (drawProp(gr, ctx, scenery.rough, roughPick, c, r, 0.82)) continue;
    // Fallback until the region's bake has loaded: a fan of grass blades.
    ctx.globalAlpha = 0.5;
    for (let b = 0; b < 5; b++) {
      const bx = x0 + hash2(c * 7.1 + b, r * 3.3) * GRID;
      const by = y0 + 6 + hash2(c * 2.7, r * 9.4 + b) * (GRID - 8);
      const len = 4 + hash2(c + b, r) * 4;
      const lean = (hash2(c * 5.5, r * 4.2 + b) - 0.5) * 3;
      ctx.strokeStyle = b % 2 === 0 ? bushDark : bushLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + lean, by - len);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ── Hard obstacles: one of the region's two blockers per tile — a tree in
  // Misthalin, an obsidian statue in Mor Ul Rek. They are drawn a little wider
  // than their tile on purpose: a tree that stops dead at the square's edge reads
  // as a token on a board, not as something standing on the ground. Row-major
  // order means a lower prop overlaps the one behind it. ──
  for (let i = 0; i < t.tiles.length; i++) {
    if (t.tiles[i] !== 'blocked') continue;
    const c = i % cols;
    const r = (i / cols) | 0;
    const blockPick = propPick(scenery.block, c, r, (hash2(c * 1.7, r * 2.3) * 97) | 0, 1);
    if (drawProp(gr, ctx, scenery.block, blockPick, c, r, 1.45)) continue;
    // Fallback until the region's bake has loaded: a shaded procedural boulder.
    const cx = c * GRID + GRID / 2;
    const cy = r * GRID + GRID / 2;
    const s = 0.82 + hash2(c * 1.7, r * 2.3) * 0.24; // per-boulder size
    const rx = GRID * 0.46 * s;
    const ry = GRID * 0.4 * s;

    // cast shadow, offset down-right
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx + 2.5, cy + 3.5, rx, ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // dark base
    ctx.fillStyle = rockDark;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // main body, faceted with a couple of lumps
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    const lumps = 1 + ((c + r) % 2);
    for (let l = 0; l < lumps; l++) {
      const lx = cx + (hash2(c * 3.1 + l, r) - 0.5) * rx;
      const ly = cy - ry * 0.15 + (hash2(c, r * 3.7 + l) - 0.5) * ry * 0.5;
      ctx.beginPath();
      ctx.ellipse(lx, ly, rx * 0.42, ry * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // top-left highlight facet
    ctx.fillStyle = rockHi;
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.3, cy - ry * 0.35, rx * 0.34, ry * 0.26, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // a dark crack and a fleck of moss
    ctx.strokeStyle = rockCrack;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + rx * 0.1, cy - ry * 0.2);
    ctx.lineTo(cx + rx * 0.25, cy + ry * 0.45);
    ctx.stroke();
    if (hash2(c * 8.1, r * 6.3) > 0.55) {
      ctx.fillStyle = bushDark;
      ctx.beginPath();
      ctx.arc(cx - rx * 0.4, cy + ry * 0.35, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Cosmetic decorations on open ground, jittered off the grid. `kind` is what
  // the generator dealt this spot, so it picks the prop: a tile keeps its own
  // dressing when the region re-skins, and the scatter stays varied. ──
  for (const d of t.decorations) {
    const jx = (hash2(d.col * 12.9, d.row * 7.1) - 0.5) * GRID * 0.5;
    const jy = (hash2(d.col * 3.7, d.row * 19.3) - 0.5) * GRID * 0.5;
    const x = d.col * GRID + GRID / 2 + jx;
    const y = d.row * GRID + GRID / 2 + jy;
    // Half a tile back up, because these props are bottom-anchored and the
    // procedural shapes below are drawn around their centre.
    const decorPick = propPick(scenery.prop, d.col, d.row, d.kind, 2);
    if (drawProp(gr, ctx, scenery.prop, decorPick, d.col, d.row, 0.7, jx, jy - GRID * 0.4)) continue;
    if (d.kind === 0 || d.kind === 1) {
      // leafy bush: shaded underside, body, top highlight, a couple of berries
      ctx.fillStyle = bushDark;
      ctx.beginPath();
      ctx.arc(x, y + 2, 7, 0, Math.PI * 2);
      ctx.arc(x + 6, y + 3, 5, 0, Math.PI * 2);
      ctx.arc(x - 5, y + 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bush;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.arc(x + 5, y + 1, 4, 0, Math.PI * 2);
      ctx.arc(x - 4, y + 1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bushLight;
      ctx.beginPath();
      ctx.arc(x - 2, y - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flowers[(d.col + d.row) % flowers.length];
      ctx.beginPath();
      ctx.arc(x + 3, y - 1, 1.3, 0, Math.PI * 2);
      ctx.arc(x - 3, y + 2, 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === 2) {
      // small boulder with shadow + highlight
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + 1.5, y + 2.5, 7, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rockDark;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rockHi;
      ctx.beginPath();
      ctx.ellipse(x - 2, y - 1.5, 2.4, 1.6, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === 3) {
      // flower: stem + petals + centre
      ctx.strokeStyle = bushDark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = flowers[(d.col + d.row) % flowers.length];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = bushLight;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // grass tuft: a fan of blades
      for (let b = 0; b < 5; b++) {
        const lean = (b - 2) * 2.2;
        ctx.strokeStyle = b % 2 === 0 ? bush : bushLight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x + lean, y - 5 - (b % 2));
        ctx.stroke();
      }
    }
  }
}

export function drawPath(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const path = gr.e.path;
  if (path.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  };
  const road = gr.e.biome.road;
  const layers: [number, string][] = [
    [50, road.shadow],   // faint ground shadow rim
    [46, road.border],   // dark border
    [40, road.mid],      // mid surface
    [32, road.walked],   // walked path
  ];
  for (const [width, color] of layers) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    trace();
  }
  // Lighter packed centre where the traffic wears the surface thin.
  ctx.strokeStyle = road.centre;
  ctx.lineWidth = 18;
  trace();
  drawRoadGravel(gr, ctx);
}

/**
 * Grit scattered across the road surface.
 *
 * This used to be a dashed line straight down the centre — which is a *car*
 * road's lane marking, and read as one: nothing in RuneScape paints a stripe on
 * a dirt track. A worn track is scattered gravel instead, spread across the full
 * width rather than lined up along the middle.
 *
 * Placement is hashed off the stone's index, not `Math.random`, so the same road
 * draws identically every frame — grit that danced between frames would be worse
 * than the stripe. Spacing is measured in real arc length, so a corner gets the
 * same stone density as a straight, and the biome's own `road.dash` colour keeps
 * each region's palette.
 */
export function drawRoadGravel(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const path = gr.e.path;
  const hash = (n: number) => {
    const v = Math.sin(n) * 43758.5453;
    return v - Math.floor(v);
  };
  ctx.fillStyle = gr.e.biome.road.dash;
  const STEP = 13;      // arc-length between stones
  const HALF_WIDTH = 15; // keep them on the packed surface, off the border
  let carried = 0;      // leftover distance from the previous segment
  let i = 0;            // stone index — the hash seed, so it never repeats a pattern
  for (let s = 1; s < path.length; s++) {
    const ax = path[s - 1].x, ay = path[s - 1].y;
    const len = distance(ax, ay, path[s].x, path[s].y);
    if (len <= 0) continue;
    const ux = (path[s].x - ax) / len, uy = (path[s].y - ay) / len;
    for (let d = STEP - carried; d < len; d += STEP, i++) {
      // Lateral offset across the road, and a size that varies stone to stone.
      const off = (hash(i * 12.9898) * 2 - 1) * HALF_WIDTH;
      const r = 1 + hash(i * 78.233) * 1.8;
      ctx.beginPath();
      ctx.arc(ax + ux * d - uy * off, ay + uy * d + ux * off, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Carry the remainder so spacing doesn't reset at every path vertex.
    carried = (len + carried) % STEP;
  }
}

/**
 * Spawn portal at the road's entry point. The real OSRS Pest Control void
 * portal (NPC 1739), baked to a looping sprite sheet and played here at the
 * portal point, over a soft procedural halo. Drawn *before* enemies so they
 * materialise out of its glowing face. Falls back to a procedural vortex if
 * the baked sheet hasn't loaded.
 */
export function drawSpawnPortal(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const path = gr.e.path;
  if (path.length < 2) return;
  const t = performance.now() / 1000;
  const pp = gr.e.portalPoint; // on-screen point where enemies materialise
  // The road can now enter from any edge, so face the portal along the road's
  // heading (path[0] → path[1]) instead of always standing it upright. Keep the
  // half-crop on the entry edge (the axis the road crosses) and clamp along the
  // edge so the disc never slides off a corner.
  const a = path[0];
  const b = path[1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const x = horizontal ? pp.x : Math.max(56, Math.min(gr.e.width - 56, pp.x));
  const y = horizontal ? Math.max(56, Math.min(gr.e.height - 56, pp.y)) : pp.y;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);

  ctx.save();
  ctx.translate(x, y);

  // Soft otherworldly halo behind the disc, breathing with the pulse (drawn before
  // the rotation — it's a radial gradient, so orientation doesn't matter).
  const haloR = 64 + pulse * 6;
  const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, haloR);
  halo.addColorStop(0, `rgba(170,90,235,${0.34 + pulse * 0.16})`);
  halo.addColorStop(0.5, `rgba(120,60,190,${0.12 + pulse * 0.07})`);
  halo.addColorStop(1, 'rgba(110,50,180,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Orient the disc/vortex to the road heading. The sprite's default (unrotated)
  // face points along +x, which is the classic left→right entry, so ang=0 leaves
  // those maps exactly as before.
  ctx.rotate(ang);

  const portal = SPOTANIMS.portal;
  if (gr.e.imageOk('spotanim_portal')) {
    // Looping baked void-portal disc — current frame from wall-clock time.
    const img = gr.e.images.get('spotanim_portal')!;
    const total = spotAnimDurationS(portal) * 1000;
    let rem = ((performance.now() % total) + total) % total;
    let fi = 0;
    for (; fi < portal.frames - 1; fi++) {
      if (rem < portal.frameMs[fi]) break;
      rem -= portal.frameMs[fi];
    }
    const s = portal.size + pulse * 4;
    ctx.drawImage(img, fi * portal.frameW, 0, portal.frameW, portal.frameH, -s / 2, -s / 2, s, s);
    ctx.restore();
    return;
  }

  // ---- Fallback: procedural vortex (until the baked sheet loads) ----------
  const RX = 26 + pulse * 2;
  const RY = 50 + pulse * 3;

  // 2) Inward-rippling tunnel: vertical ellipses that continuously march toward
  // the throat (phase wraps over time) and fade at both ends, so the energy
  // reads as being *pulled in* — the classic portal funnel.
  const RINGS = 6;
  for (let i = 0; i < RINGS; i++) {
    const phase = ((i / RINGS) + t * 0.35) % 1; // 0 at rim → 1 at throat
    const k = 1 - phase * 0.85; // radius fraction: rim (1) → throat (~0.15)
    const fade = Math.sin(phase * Math.PI); // fade in at rim, out at throat
    const r = Math.round(150 + 90 * k);
    const g = Math.round(50 + 25 * (1 - k));
    const b = Math.round(180 + 50 * k);
    ctx.save();
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 1.5 + k * 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, RX * k, RY * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 2b) Two spiral arms slowly rotating, to give the swirl a clear direction.
  ctx.save();
  ctx.rotate(t * 0.8);
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#c98bff';
  ctx.lineWidth = 2;
  for (let arm = 0; arm < 2; arm++) {
    ctx.beginPath();
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const ang = arm * Math.PI + s * Math.PI * 1.6;
      const ex = Math.cos(ang) * RX * s;
      const ey = Math.sin(ang) * RY * s;
      if (s === 0) ctx.moveTo(ex, ey);
      else ctx.lineTo(ex, ey);
    }
    ctx.stroke();
  }
  ctx.restore();

  // 3) Bright energy rim around the gateway mouth.
  ctx.save();
  ctx.globalAlpha = 0.55 + pulse * 0.3;
  ctx.strokeStyle = '#d59bff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 4) A couple of bright sparks orbiting the throat (clipped to the mouth).
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let k = 0; k < 5; k++) {
    const a = t * 1.6 + (k * Math.PI * 2) / 5;
    const rr = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.9 + k * 1.7));
    const ex = Math.cos(a) * RX * rr;
    const ey = Math.sin(a) * RY * rr;
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + k);
    ctx.fillStyle = k % 2 ? '#e9c6ff' : '#8be0ff';
    ctx.beginPath();
    ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 5) Dark throat at the centre — the mouth enemies emerge from, drawn last so
  // freshly-spawned (still materialising) mobs read as stepping out of it.
  const mouth = ctx.createRadialGradient(0, 0, 1, 0, 0, RX * 0.85);
  mouth.addColorStop(0, 'rgba(6,2,14,0.95)');
  mouth.addColorStop(0.6, 'rgba(26,11,42,0.6)');
  mouth.addColorStop(1, 'rgba(52,23,72,0)');
  ctx.save();
  ctx.scale(1, RY / RX);
  ctx.fillStyle = mouth;
  ctx.beginPath();
  ctx.arc(0, 0, RX * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * Baked spotanim (GFX) effects — one-shot sprite-sheet animations the engine
 * queues at a point (e.g. the teleport-gem flash as an enemy materialises).
 * Drawn additively ('lighter') for the in-game energy glow, with a short
 * fade-out at the tail so it dissolves rather than cutting off.
 */
export function drawEffects(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const fx of gr.e.spotEffects) {
    // A negative age is an effect still waiting its turn — an impact queued alongside the
    // projectile that causes it, counting up to the moment that projectile lands.
    if (fx.age < 0) continue;
    const meta = SPOTANIMS[fx.slug];
    const key = `spotanim_${fx.slug}`;
    if (!meta || !gr.e.imageOk(key)) continue;
    drawSpotAnimGfx(ctx, gr.e.images.get(key)!, meta, fx.age, fx.x, fx.y, meta.size * (fx.scale ?? 1));
  }
}

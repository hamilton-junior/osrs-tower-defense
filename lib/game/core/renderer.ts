import type { GameEngine } from './engine';
import type { TerrainField } from '../systems/terrain-generation';
import { drawBackground, drawPath, drawSpawnPortal, drawEffects } from './render/terrain';
import { drawDangerZone, drawHoverRange, drawBuildOverlay, drawPlacementGhost } from './render/build-overlay';
import { drawTowers } from './render/towers';
import { drawScorches } from './render/scorch';
import { drawSiphonLinks } from './render/siphon';
import { drawDeaths, drawEnemies } from './render/enemies';
import { drawDiversions } from './render/diversions';
import { drawTraps } from './render/hunter-traps';
import { drawRoadShaping } from './render/road-shaping';
import { drawProjectiles, drawParticles, drawFx, drawHitsplats } from './render/effects';
import { drawVignette, drawBossBar, drawLowHealthWarning, drawLeakFlash } from './render/hud';

/**
 * All Canvas 2D drawing for a frame.
 *
 * The class holds the frame's running order and the few caches a frame carries
 * between calls; every layer lives in its own module under `render/` and takes
 * this renderer as its first argument (`gr`), reading engine state through `e`.
 * The fields are public for that reason — those functions are this class's own
 * methods, written where they can be found rather than in one 2,300-line scroll.
 * The renderer still keeps no *game* state: `e` is the only source of truth.
 */
export class GameRenderer {
  constructor(readonly e: GameEngine) {}

  /** Scratch buffer for alpha-masked sprite tints (hit-flash). Lazily sized. */
  flashBuf?: HTMLCanvasElement;
  flashCtx?: CanvasRenderingContext2D | null;

  /**
   * Where a splat sprite's *painted* blob sits relative to the image's
   * geometric centre, as a fraction of the image box. The OSRS hitsplat
   * sprites carry a couple of transparent rows below the lozenge (its tail),
   * so the coloured blob is top-biased; centring the raw image box would leave
   * the value sitting low in the visible splat. Measured once per sprite key
   * (six of them) from the decoded pixels and memoised — survives a sprite
   * re-extraction without a magic constant.
   */
  splatAnchorCache = new Map<string, { ox: number; oy: number }>();

  // The ground, ground texture, terrain (obstacles / zones / decorations) and grid
  // are all static for a run, so they're rendered once to an offscreen buffer and
  // blitted each frame. This keeps the detailed terrain art off the hot path — it's
  // rebuilt only when the run's terrain, biome or the board size changes.
  bgCache: HTMLCanvasElement | null = null;
  bgCtx: CanvasRenderingContext2D | null = null;
  bgTerrain: TerrainField | null = null;
  bgBiome = '';
  bgW = 0;
  bgH = 0;
  bgScale = 0;

  /** Padding (logic px) around a baked glow sprite so its blurred halo isn't clipped. */
  readonly GLOW_PAD = 12;
  /** Cache of pre-rendered synergy-aura glow sprites, keyed by image+colour+size.
   *  Baking the blurred silhouette once (offscreen) turns the per-frame cost from
   *  "3 shadow-blurred drawImage passes per tower" into a single plain drawImage —
   *  the fix for the frame-rate collapse with many buffed towers. */
  glowCache = new Map<string, HTMLCanvasElement>();

  draw() {
    const { ctx } = this.e;
    if (!ctx || this.e.canvas.width === 0) return;

    ctx.save();
    // Scale the whole frame by the board's logic→backing multiplier: the backing
    // store is the fixed 1440×640 logic space sized to the board's displayed pixels
    // (`deviceScale`), so every draw call below still works in logic units while the
    // board is rasterised at the screen's real resolution — no CSS upscale from 1440.
    ctx.setTransform(this.e.deviceScale, 0, 0, this.e.deviceScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawBackground(this, ctx);
    drawPath(this, ctx);
    drawScorches(this, ctx); // dragonfire on the road — under the towers and enemies that stand in it
    drawDangerZone(this, ctx);
    drawHoverRange(this, ctx);
    drawBuildOverlay(this, ctx);
    drawPlacementGhost(this, ctx);
    drawTowers(this, ctx);
    drawRoadShaping(this, ctx); // road handles — between waves only, over the towers they must not hide behind
    drawDiversions(this, ctx); // the world between waves — always empty during a fight
    drawTraps(this, ctx); // on the road, under the enemies — a trap is walked over, never into
    drawDeaths(this, ctx);
    drawSpawnPortal(this, ctx); // before enemies → they materialise out of its face
    drawEnemies(this, ctx);
    drawSiphonLinks(this, ctx); // over both ends of it: the Beast, and the tower it holds
    drawEffects(this, ctx); // baked spotanims (spawn flash) over the emerging enemy
    drawProjectiles(this, ctx);
    drawParticles(this, ctx);
    drawFx(this, ctx); // procedural roguelite VFX (chain bolts / cleave + shockwave rings)
    drawHitsplats(this, ctx);
    drawVignette(this, ctx);
    drawBossBar(this, ctx);
    drawLowHealthWarning(this, ctx);
    drawLeakFlash(this, ctx);
    ctx.restore();
  }
}

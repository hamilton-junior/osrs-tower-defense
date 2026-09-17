import type { GameEngine } from './engine';
import type { TerrainField } from '../systems/terrain-generation';
import { drawBackground, drawPath, drawSpawnPortal, drawEffects } from './render/terrain';
import { drawLiquid } from './render/liquid';
import { drawDangerZone, drawHoverRange, drawBuildOverlay, drawPlacementGhost } from './render/build-overlay';
import { drawTowers } from './render/towers';
import { drawScorches } from './render/scorch';
import { drawSiphonLinks } from './render/siphon';
import { drawDeaths, drawEnemies } from './render/enemies';
import { drawDiversions } from './render/diversions';
import { drawFarming, drawPlotPlacement } from './render/farming';
import { drawFishing } from './render/fishing';
import { drawTraps } from './render/hunter-traps';
import { drawRoadShaping } from './render/road-shaping';
import { drawProjectiles, drawParticles, drawFx, drawHitsplats } from './render/effects';
import { drawVignette, drawBossBar, drawLowHealthWarning, drawLeakFlash, drawHealFlash } from './render/hud';

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
  /** Whether the water texture had arrived when the buffer was last baked. Pools
   *  are painted with it, and images load after the first frame — without this the
   *  board would keep a run's worth of untextured water. */
  bgWater = false;
  /** Whether the active region's floor texture had arrived when the buffer was last
   *  baked — same reason as `bgWater`, for the ground under it. */
  bgGround = false;
  /** How many of the region's scenery props had arrived when the buffer was last
   *  baked. A count, not a flag: the props load one at a time, so a board baked
   *  with three of seven has to be rebaked when the other four land. */
  bgScenery = -1;

  /** Each pool welded into one outline, by liquid kind (at most two: water and
   *  lava). Rebuilt with the background, so the animated surface costs a clip and a
   *  fill per kind rather than per tile — see `render/liquid.ts`. */
  liquidBodies: ReturnType<typeof import('./render/liquid').buildLiquidBodies> = [];
  /** The repeating pattern each kind is filled with, made once per texture. */
  liquidPatterns = new Map<string, CanvasPattern>();

  /** Padding (logic px) around a baked glow sprite so its blurred halo isn't clipped. */
  readonly GLOW_PAD = 12;
  /** Cache of pre-rendered synergy-aura glow sprites, keyed by image+colour+size.
   *  Baking the blurred silhouette once (offscreen) turns the per-frame cost from
   *  "3 shadow-blurred drawImage passes per tower" into a single plain drawImage —
   *  the fix for the frame-rate collapse with many buffed towers. */
  glowCache = new Map<string, HTMLCanvasElement>();

  /** Which look each fishing spot is wearing, and the one it is fading out of.
   *  Presentation only: the engine's `FishingSpot` already says whether a pool has
   *  fish left in it, and this remembers just long enough to cross-fade between the
   *  busy treatment and the quiet one. The old position is kept with it because a
   *  pool that comes back also moves — `restockSpots` hops it to another of its own
   *  water tiles — so the outgoing sprite has to fade out where it stood, not where
   *  the pool has just reappeared. */
  spotFade = new Map<
    string,
    { ready: boolean; x: number; y: number; from: { ready: boolean; x: number; y: number } | null; at: number }
  >();

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
    drawLiquid(this, ctx); // the one part of the board that moves under everything else
    drawPath(this, ctx);
    drawScorches(this, ctx); // dragonfire on the road — under the towers and enemies that stand in it
    drawDangerZone(this, ctx);
    drawHoverRange(this, ctx);
    drawBuildOverlay(this, ctx);
    drawPlacementGhost(this, ctx);
    drawFarming(this, ctx); // allotments — on unbuildable ground, so never over a tower
    drawFishing(this, ctx); // fishing spots on water — the pool itself is baked into the background
    drawPlotPlacement(this, ctx); // where a plot in hand may be put down, over the plots themselves
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
    drawHealFlash(this, ctx); // under the leak flash, so a leak on the same frame still reads red
    drawLeakFlash(this, ctx);
    ctx.restore();
  }
}

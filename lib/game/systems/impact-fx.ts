import type { Element, Projectile } from '../types';

/**
 * Procedural, **element-themed magic-impact VFX** — the runtime half of the
 * spotanim hybrid. Where geometry-only GFX (the spawn portal) are baked to sprite
 * sheets offline, textured spell impacts rasterise to white boxes, so we draw
 * those *procedurally* instead. Each impact is a small explosion **on the target
 * model**, composed from the renderer's existing primitives so no new draw path
 * is needed:
 *   - a bright `flash` core (the burst blooming on the body),
 *   - one or two expanding shockwave `ring`s,
 *   - optional radiating `shards` (ice spikes / rock cracks / shadow claws / blood
 *     spray), drawn as short jagged bolts from the centre, and
 *   - a themed `particles` burst.
 * This module is **pure** (no `this`/DOM): it owns the per-element recipe table
 * and the projectile→theme resolver; the engine reads a recipe and spawns the
 * flash/ring/shards/particles (applying the randomness) at the impact point.
 */

/** Visual family for an impact, keyed off the projectile's element / ancient tier. */
export type ImpactTheme = 'air' | 'water' | 'earth' | 'fire' | 'ice' | 'blood' | 'shadow' | 'smoke';

/** A deterministic description of an impact burst; the engine adds the jitter. */
export interface ImpactRecipe {
  /** Bloom of light at the impact centre — the "explosion" flash (filled disc). */
  flash: { r: number; color: string; life: number };
  /** Expanding shockwave ring (fed straight into the engine's addRing). */
  ring: { r0: number; r1: number; color: string; width: number; life: number };
  /** Radiating jagged spikes/cracks from the centre (ice/earth/shadow/blood/air).
   *  Drawn as short bolts; omitted for soft impacts (fire/water/smoke). */
  shards?: { count: number; lenMin: number; lenMax: number; color: string; life: number };
  particles: {
    count: number;
    speedMin: number;
    speedMax: number;
    /** Downward accel (px/s²); negative floats the motes up (fire/smoke). */
    gravity: number;
    sizeMin: number;
    sizeMax: number;
    lifeMin: number;
    lifeMax: number;
    /** Palette each mote's colour is picked from. */
    colors: string[];
    /** Added to each mote's initial vy (negative launches it upward first). */
    riseBias: number;
  };
}

/**
 * Resolve a projectile to its impact theme, or `null` for non-magic shots
 * (arrows / cannonballs keep their plain coloured spark burst). Ancient barrages
 * carry their tier in `type`; elemental spells carry it in `element`.
 */
export function resolveImpactTheme(type: Projectile['type'], element?: Element): ImpactTheme | null {
  switch (type) {
    case 'ancient_ice': return 'ice';
    case 'ancient_blood': return 'blood';
    case 'ancient_shadow': return 'shadow';
    case 'ancient_smoke': return 'smoke';
    case 'spell':
    case 'magic_projectile':
      return element && element !== 'none' ? element : 'air';
    default:
      return null;
  }
}

/**
 * Per-theme impact recipes. Kept **small and crisp** (a spell landing on a body,
 * not a grenade): tight flashes, short shockwaves, a handful of motes. Colours
 * track each element's canonical palette from `systems/magic` so the burst reads
 * as the same element as its projectile/staff:
 *   - fire orange (#ff5a1f), warm licks that float up;
 *   - water blue (#3fa9ff), droplets that splash down;
 *   - earth GREEN-glow (#46c23a) with brown rock cracks & rubble;
 *   - air pale white-blue (#cfe8ff), a fast faint puff (no shards);
 *   - ice white-blue (#7fe6ff), crystal spikes;
 *   - blood deep red (#c81e1e), dark wet spray that falls;
 *   - shadow deep purple (#6a3fb0), dark imploding claws;
 *   - smoke GREY (#9a9a9a), a soft cloud that rises.
 */
export const IMPACT_RECIPES: Record<ImpactTheme, ImpactRecipe> = {
  fire: {
    flash: { r: 12, color: '#ff8a2e', life: 0.12 },
    ring: { r0: 4, r1: 26, color: '#ff5a1f', width: 3, life: 0.3 },
    particles: { count: 8, speedMin: 30, speedMax: 95, gravity: -30, sizeMin: 1.2, sizeMax: 2.8, lifeMin: 0.22, lifeMax: 0.42, colors: ['#ff5a1f', '#ffab3a', '#ffd86a'], riseBias: -30 },
  },
  water: {
    flash: { r: 10, color: '#4aa8f5', life: 0.1 },
    ring: { r0: 4, r1: 24, color: '#3fa9ff', width: 2.5, life: 0.28 },
    particles: { count: 7, speedMin: 25, speedMax: 80, gravity: 340, sizeMin: 1.2, sizeMax: 2.6, lifeMin: 0.28, lifeMax: 0.5, colors: ['#2e7bd6', '#67b8ff', '#bfe4ff'], riseBias: -30 },
  },
  earth: {
    flash: { r: 10, color: '#5aa838', life: 0.1 },
    ring: { r0: 4, r1: 24, color: '#5a8f3a', width: 3, life: 0.3 },
    shards: { count: 4, lenMin: 10, lenMax: 22, color: '#6a4f28', life: 0.24 },
    particles: { count: 7, speedMin: 30, speedMax: 90, gravity: 480, sizeMin: 1.6, sizeMax: 3.4, lifeMin: 0.28, lifeMax: 0.5, colors: ['#7a5a30', '#46c23a', '#5f7a35'], riseBias: -40 },
  },
  air: {
    flash: { r: 9, color: '#9cc9f5', life: 0.09 },
    ring: { r0: 5, r1: 26, color: '#8fc0f0', width: 2, life: 0.26 },
    particles: { count: 6, speedMin: 55, speedMax: 120, gravity: 15, sizeMin: 0.8, sizeMax: 1.8, lifeMin: 0.16, lifeMax: 0.3, colors: ['#cfe8ff', '#a9d4ff', '#bcd4ff'], riseBias: 0 },
  },
  ice: {
    flash: { r: 12, color: '#7fe6ff', life: 0.13 },
    ring: { r0: 4, r1: 28, color: '#4fcdf2', width: 3, life: 0.34 },
    shards: { count: 6, lenMin: 12, lenMax: 28, color: '#9fe0ff', life: 0.3 },
    particles: { count: 7, speedMin: 35, speedMax: 95, gravity: 140, sizeMin: 1.2, sizeMax: 2.8, lifeMin: 0.26, lifeMax: 0.46, colors: ['#9fe0ff', '#cdeeff', '#6fc7ee'], riseBias: -18 },
  },
  blood: {
    flash: { r: 10, color: '#d12d2d', life: 0.1 },
    ring: { r0: 4, r1: 24, color: '#b01f1f', width: 3, life: 0.32 },
    shards: { count: 4, lenMin: 10, lenMax: 20, color: '#7a1010', life: 0.2 },
    particles: { count: 8, speedMin: 28, speedMax: 88, gravity: 380, sizeMin: 1.4, sizeMax: 3.2, lifeMin: 0.3, lifeMax: 0.55, colors: ['#8e1414', '#c81e1e', '#5e0d0d'], riseBias: -22 },
  },
  shadow: {
    flash: { r: 11, color: '#7a4bb0', life: 0.13 },
    ring: { r0: 4, r1: 26, color: '#6a3fb0', width: 3, life: 0.36 },
    shards: { count: 5, lenMin: 12, lenMax: 24, color: '#2a1840', life: 0.28 },
    particles: { count: 7, speedMin: 18, speedMax: 64, gravity: 60, sizeMin: 1.6, sizeMax: 3.4, lifeMin: 0.34, lifeMax: 0.6, colors: ['#5a2f86', '#6a3fb0', '#1b1024'], riseBias: -4 },
  },
  smoke: {
    flash: { r: 11, color: '#9a9a9a', life: 0.12 },
    ring: { r0: 4, r1: 24, color: '#8f8f8f', width: 3, life: 0.34 },
    particles: { count: 8, speedMin: 16, speedMax: 58, gravity: -50, sizeMin: 2, sizeMax: 4.2, lifeMin: 0.44, lifeMax: 0.8, colors: ['#6f6f6f', '#9a9a9a', '#4f4f4f'], riseBias: -36 },
  },
};

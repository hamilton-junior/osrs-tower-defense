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
 * Per-theme impact recipes, tuned for an OSRS read: fire flashes and licks up,
 * water splashes down, earth cracks and rains rubble, air is a fast faint swirl,
 * ice blooms white-blue and throws crystal spikes, blood splatters dark and wet,
 * shadow implodes into purple claws, smoke billows a soft rising cloud.
 */
export const IMPACT_RECIPES: Record<ImpactTheme, ImpactRecipe> = {
  fire: {
    flash: { r: 20, color: '#ffd27a', life: 0.16 },
    ring: { r0: 5, r1: 44, color: '#ff7a3c', width: 4, life: 0.42 },
    particles: { count: 12, speedMin: 35, speedMax: 120, gravity: -40, sizeMin: 1.5, sizeMax: 3.6, lifeMin: 0.25, lifeMax: 0.5, colors: ['#ff5a1f', '#ffb03a', '#ffd86a'], riseBias: -34 },
  },
  water: {
    flash: { r: 16, color: '#bfe4ff', life: 0.14 },
    ring: { r0: 4, r1: 40, color: '#4aa3ff', width: 3.5, life: 0.4 },
    particles: { count: 11, speedMin: 30, speedMax: 95, gravity: 300, sizeMin: 1.5, sizeMax: 3, lifeMin: 0.3, lifeMax: 0.55, colors: ['#2e7bd6', '#67b8ff', '#bfe4ff'], riseBias: -34 },
  },
  earth: {
    flash: { r: 16, color: '#c7a86a', life: 0.13 },
    ring: { r0: 5, r1: 38, color: '#8a6a3a', width: 4.5, life: 0.4 },
    shards: { count: 5, lenMin: 14, lenMax: 30, color: '#6a4f28', life: 0.28 },
    particles: { count: 11, speedMin: 40, speedMax: 110, gravity: 460, sizeMin: 2, sizeMax: 4.2, lifeMin: 0.3, lifeMax: 0.6, colors: ['#7a5a30', '#9c7a44', '#4f7a35'], riseBias: -48 },
  },
  air: {
    flash: { r: 14, color: '#eef4ff', life: 0.1 },
    ring: { r0: 6, r1: 48, color: '#dfe9ff', width: 3, life: 0.32 },
    shards: { count: 4, lenMin: 16, lenMax: 34, color: '#dfe9ff', life: 0.18 },
    particles: { count: 12, speedMin: 70, speedMax: 165, gravity: 20, sizeMin: 1, sizeMax: 2.4, lifeMin: 0.18, lifeMax: 0.38, colors: ['#cfe0ff', '#ffffff', '#a9c6ff'], riseBias: 0 },
  },
  ice: {
    flash: { r: 22, color: '#e6f7ff', life: 0.18 },
    ring: { r0: 5, r1: 48, color: '#bfe9ff', width: 4, life: 0.46 },
    shards: { count: 8, lenMin: 16, lenMax: 38, color: '#cdeeff', life: 0.34 },
    particles: { count: 13, speedMin: 45, speedMax: 125, gravity: 160, sizeMin: 1.5, sizeMax: 3.6, lifeMin: 0.3, lifeMax: 0.55, colors: ['#9fe0ff', '#ffffff', '#6fc7ee'], riseBias: -22 },
  },
  blood: {
    flash: { r: 17, color: '#e85a5a', life: 0.14 },
    ring: { r0: 4, r1: 40, color: '#b01f1f', width: 4, life: 0.44 },
    shards: { count: 6, lenMin: 12, lenMax: 28, color: '#7a1010', life: 0.24 },
    particles: { count: 12, speedMin: 30, speedMax: 105, gravity: 360, sizeMin: 1.6, sizeMax: 3.6, lifeMin: 0.3, lifeMax: 0.6, colors: ['#8e1414', '#c52828', '#5e0d0d'], riseBias: -26 },
  },
  shadow: {
    flash: { r: 18, color: '#b98af0', life: 0.16 },
    ring: { r0: 5, r1: 42, color: '#7a4fb0', width: 4, life: 0.52 },
    shards: { count: 6, lenMin: 14, lenMax: 30, color: '#3a1f5a', life: 0.3 },
    particles: { count: 11, speedMin: 20, speedMax: 82, gravity: 80, sizeMin: 2, sizeMax: 4, lifeMin: 0.4, lifeMax: 0.72, colors: ['#5a2f86', '#8a5fc0', '#2a1840'], riseBias: -6 },
  },
  smoke: {
    flash: { r: 16, color: '#c2cc9a', life: 0.15 },
    ring: { r0: 5, r1: 40, color: '#7e8a5a', width: 4, life: 0.5 },
    particles: { count: 11, speedMin: 20, speedMax: 72, gravity: -60, sizeMin: 2.5, sizeMax: 5, lifeMin: 0.5, lifeMax: 0.9, colors: ['#6f7d4a', '#9aa86a', '#4f5836'], riseBias: -42 },
  },
};

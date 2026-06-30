import type { Element, Projectile } from '../types';

/**
 * Procedural, **element-themed magic-impact VFX** — the runtime half of the
 * spotanim hybrid. Where geometry-only GFX (the spawn portal) are baked to sprite
 * sheets offline, textured spell impacts rasterise to white boxes, so we draw
 * those *procedurally* instead: an expanding shockwave ring plus a themed
 * particle burst, both composed from the renderer's existing `fx` ring + particle
 * draws (no new draw path). This module is **pure** (no `this`/DOM): it owns the
 * per-element recipe table and the projectile→theme resolver; the engine reads a
 * recipe and spawns the ring/particles (applying the randomness) at impact.
 */

/** Visual family for an impact, keyed off the projectile's element / ancient tier. */
export type ImpactTheme = 'air' | 'water' | 'earth' | 'fire' | 'ice' | 'blood' | 'shadow' | 'smoke';

/** A deterministic description of an impact burst; the engine adds the jitter. */
export interface ImpactRecipe {
  /** Expanding shockwave ring (fed straight into the engine's addRing). */
  ring: { r0: number; r1: number; color: string; width: number; life: number };
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
 * Per-theme impact recipes, tuned for an OSRS read: fire/smoke motes float up,
 * water/blood/earth fall (earth heaviest), air whips out fast and faint, ice
 * shards radiate, shadow sinks slow and moody.
 */
export const IMPACT_RECIPES: Record<ImpactTheme, ImpactRecipe> = {
  fire: {
    ring: { r0: 5, r1: 44, color: '#ff7a3c', width: 4, life: 0.42 },
    particles: { count: 11, speedMin: 35, speedMax: 115, gravity: -40, sizeMin: 1.5, sizeMax: 3.6, lifeMin: 0.25, lifeMax: 0.5, colors: ['#ff5a1f', '#ffb03a', '#ffd86a'], riseBias: -34 },
  },
  water: {
    ring: { r0: 4, r1: 40, color: '#4aa3ff', width: 3.5, life: 0.4 },
    particles: { count: 10, speedMin: 30, speedMax: 95, gravity: 280, sizeMin: 1.5, sizeMax: 3, lifeMin: 0.3, lifeMax: 0.55, colors: ['#2e7bd6', '#67b8ff', '#bfe4ff'], riseBias: -18 },
  },
  earth: {
    ring: { r0: 5, r1: 38, color: '#8a6a3a', width: 4.5, life: 0.4 },
    particles: { count: 10, speedMin: 40, speedMax: 110, gravity: 440, sizeMin: 2, sizeMax: 4.2, lifeMin: 0.3, lifeMax: 0.6, colors: ['#7a5a30', '#9c7a44', '#4f7a35'], riseBias: -46 },
  },
  air: {
    ring: { r0: 6, r1: 46, color: '#dfe9ff', width: 3, life: 0.34 },
    particles: { count: 12, speedMin: 65, speedMax: 155, gravity: 20, sizeMin: 1, sizeMax: 2.4, lifeMin: 0.2, lifeMax: 0.4, colors: ['#cfe0ff', '#ffffff', '#a9c6ff'], riseBias: 0 },
  },
  ice: {
    ring: { r0: 5, r1: 48, color: '#bfe9ff', width: 4, life: 0.46 },
    particles: { count: 13, speedMin: 45, speedMax: 125, gravity: 140, sizeMin: 1.5, sizeMax: 3.6, lifeMin: 0.3, lifeMax: 0.55, colors: ['#9fe0ff', '#ffffff', '#6fc7ee'], riseBias: -22 },
  },
  blood: {
    ring: { r0: 4, r1: 40, color: '#b01f1f', width: 4, life: 0.44 },
    particles: { count: 11, speedMin: 30, speedMax: 100, gravity: 340, sizeMin: 1.6, sizeMax: 3.6, lifeMin: 0.3, lifeMax: 0.6, colors: ['#8e1414', '#c52828', '#5e0d0d'], riseBias: -26 },
  },
  shadow: {
    ring: { r0: 5, r1: 42, color: '#7a4fb0', width: 4, life: 0.52 },
    particles: { count: 10, speedMin: 20, speedMax: 80, gravity: 80, sizeMin: 2, sizeMax: 4, lifeMin: 0.4, lifeMax: 0.72, colors: ['#5a2f86', '#8a5fc0', '#2a1840'], riseBias: -6 },
  },
  smoke: {
    ring: { r0: 5, r1: 40, color: '#7e8a5a', width: 4, life: 0.5 },
    particles: { count: 10, speedMin: 20, speedMax: 72, gravity: -60, sizeMin: 2.5, sizeMax: 5, lifeMin: 0.5, lifeMax: 0.9, colors: ['#6f7d4a', '#9aa86a', '#4f5836'], riseBias: -42 },
  },
};

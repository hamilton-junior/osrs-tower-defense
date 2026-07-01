import type { Element, Projectile } from '../types';

/**
 * Procedural, **element-themed magic-impact VFX** — the runtime half of the
 * spotanim hybrid. Where geometry-only GFX (the spawn portal) are baked to sprite
 * sheets offline, textured spell impacts rasterise to white boxes, so we draw
 * those *procedurally* instead. Each impact is a directional **burst on the target
 * model** — deliberately built from NON-round primitives (no filled bloom, no
 * expanding ring) so nothing reads as a "circle" over the sprite:
 *   - radiating `shards` (flame licks / water spray / rock cracks / ice spikes /
 *     shadow claws / blood spray / wind streaks), drawn as short jagged bolts
 *     shooting out from the centre, and
 *   - a punchy themed `particles` burst.
 * This module is **pure** (no `this`/DOM): it owns the per-element recipe table
 * and the projectile→theme resolver; the engine reads a recipe and spawns the
 * shards/particles (applying the randomness) at the impact point.
 *
 * Colours are keyed off the **projectile's** element/ancient tier (the casting
 * tower's spell), never the enemy hit — {@link resolveImpactTheme} takes the
 * projectile, and the palette below mirrors `systems/magic`'s per-element glow.
 */

/** Visual family for an impact, keyed off the projectile's element / ancient tier. */
export type ImpactTheme = 'air' | 'water' | 'earth' | 'fire' | 'ice' | 'blood' | 'shadow' | 'smoke';

/** A deterministic description of an impact burst; the engine adds the jitter. */
export interface ImpactRecipe {
  /** Radiating jagged spikes/cracks/spray shooting out from the impact — the
   *  directional "hit" read (short bolts). Every theme has one so the burst always
   *  has structure without any round shockwave. */
  shards: { count: number; lenMin: number; lenMax: number; color: string; life: number };
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
 * Per-theme impact recipes — a **bold, directional** burst (radiating shards + a
 * lively particle spray), never a round bloom. Colours track each element's
 * canonical glow from `systems/magic` (the SAME colour as the projectile that
 * caused the hit), so the burst always reads as its own element:
 *   - fire orange (#ff5a1f), flame licks that flare up;
 *   - water blue (#3fa9ff), spray that splashes down;
 *   - earth brown rock cracks (#6a4f28) with green magic rubble (#46c23a);
 *   - air pale blue (#cfe8ff), fast wide-flung streaks;
 *   - ice cyan (#7fe6ff), crystal spikes;
 *   - blood deep red (#c81e1e), dark wet spray that falls;
 *   - shadow deep purple (#6a3fb0), dark clawing shards;
 *   - smoke GREY (#9a9a9a), a soft cloud that rises.
 */
export const IMPACT_RECIPES: Record<ImpactTheme, ImpactRecipe> = {
  fire: {
    shards: { count: 6, lenMin: 12, lenMax: 26, color: '#ff8a2e', life: 0.22 },
    particles: { count: 14, speedMin: 45, speedMax: 140, gravity: -40, sizeMin: 1.6, sizeMax: 3.6, lifeMin: 0.24, lifeMax: 0.48, colors: ['#ff5a1f', '#ffab3a', '#ffd86a'], riseBias: -50 },
  },
  water: {
    shards: { count: 5, lenMin: 10, lenMax: 22, color: '#67b8ff', life: 0.18 },
    particles: { count: 13, speedMin: 40, speedMax: 120, gravity: 380, sizeMin: 1.5, sizeMax: 3.2, lifeMin: 0.28, lifeMax: 0.52, colors: ['#2e7bd6', '#67b8ff', '#bfe4ff'], riseBias: -45 },
  },
  earth: {
    shards: { count: 7, lenMin: 12, lenMax: 28, color: '#6a4f28', life: 0.28 },
    particles: { count: 13, speedMin: 38, speedMax: 120, gravity: 540, sizeMin: 1.8, sizeMax: 4, lifeMin: 0.3, lifeMax: 0.54, colors: ['#7a5a30', '#46c23a', '#5f7a35'], riseBias: -55 },
  },
  air: {
    shards: { count: 6, lenMin: 14, lenMax: 30, color: '#cfe8ff', life: 0.16 },
    particles: { count: 12, speedMin: 75, speedMax: 165, gravity: 15, sizeMin: 1, sizeMax: 2.4, lifeMin: 0.16, lifeMax: 0.32, colors: ['#cfe8ff', '#a9d4ff', '#bcd4ff'], riseBias: 0 },
  },
  ice: {
    shards: { count: 8, lenMin: 14, lenMax: 32, color: '#9fe0ff', life: 0.3 },
    particles: { count: 13, speedMin: 42, speedMax: 120, gravity: 150, sizeMin: 1.5, sizeMax: 3.2, lifeMin: 0.26, lifeMax: 0.48, colors: ['#7fe6ff', '#cdeeff', '#6fc7ee'], riseBias: -18 },
  },
  blood: {
    shards: { count: 6, lenMin: 10, lenMax: 24, color: '#8e1414', life: 0.22 },
    particles: { count: 14, speedMin: 38, speedMax: 115, gravity: 440, sizeMin: 1.7, sizeMax: 3.8, lifeMin: 0.3, lifeMax: 0.58, colors: ['#8e1414', '#c81e1e', '#5e0d0d'], riseBias: -26 },
  },
  shadow: {
    shards: { count: 7, lenMin: 12, lenMax: 28, color: '#2a1840', life: 0.3 },
    particles: { count: 13, speedMin: 24, speedMax: 92, gravity: 60, sizeMin: 1.8, sizeMax: 4, lifeMin: 0.34, lifeMax: 0.64, colors: ['#5a2f86', '#6a3fb0', '#1b1024'], riseBias: -6 },
  },
  smoke: {
    shards: { count: 5, lenMin: 8, lenMax: 18, color: '#8f8f8f', life: 0.2 },
    particles: { count: 14, speedMin: 18, speedMax: 74, gravity: -60, sizeMin: 2.2, sizeMax: 4.8, lifeMin: 0.44, lifeMax: 0.84, colors: ['#6f6f6f', '#9a9a9a', '#4f4f4f'], riseBias: -44 },
  },
};

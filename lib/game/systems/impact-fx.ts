import type { Element, Projectile } from '../types';

/**
 * Procedural, **element-themed magic-impact VFX** — the runtime half of the
 * spotanim hybrid. Where geometry-only GFX (the spawn portal) are baked to sprite
 * sheets offline, textured spell impacts rasterise to white boxes, so we draw
 * those *procedurally* instead. Each impact reads like the **enemy death burst** —
 * debris shattered *off the struck model* — but **directional**: the force and
 * spray follow the shot (the projectile's travel direction on a direct hit, or
 * outward from the blast centre for splash). Built from NON-round primitives (no
 * filled bloom, no expanding ring) so nothing reads as a "circle" over the sprite:
 *   - a themed `particles` debris burst — the star of the effect — fanned into a
 *     cone (`spread`) around the impact direction with a forward "punch"
 *     (`forwardBias`) and gravity, so the motes fly off the model the way the hit
 *     pushed them and then settle, and
 *   - a few radiating `shards` (flame licks / rock cracks / ice spikes / …) drawn
 *     as short jagged bolts biased the same way, for the leading "crack".
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
    /** Half-angle (rad) of the debris fan around the impact direction — the motes
     *  spray off the struck model within ±spread of the way the shot was travelling
     *  (wide = a broad shatter, narrow = a focused jet). */
    spread: number;
    /** Extra speed (px/s) added to every mote *along the impact direction* — the
     *  forward "punch" that knocks the debris off in the direction of the hit. */
    forwardBias: number;
  };
  /** Mystical accent laid over the physical debris: a few slow, bright motes drawn
   *  as shimmering 4-point arcane sparks that drift upward and twinkle in the
   *  element's *glow* colour — the "magic" sheen (not physical shatter). */
  spark: { count: number; color: string; life: number; size: number };
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
    shards: { count: 5, lenMin: 12, lenMax: 26, color: '#ff8a2e', life: 0.22 },
    particles: { count: 15, speedMin: 55, speedMax: 155, gravity: 120, sizeMin: 1.8, sizeMax: 4, lifeMin: 0.26, lifeMax: 0.5, colors: ['#ff5a1f', '#ffab3a', '#ffd86a'], riseBias: -40, spread: 2, forwardBias: 55 },
    spark: { count: 4, color: '#ffe08a', life: 0.6, size: 2.6 },
  },
  water: {
    shards: { count: 4, lenMin: 10, lenMax: 22, color: '#67b8ff', life: 0.18 },
    particles: { count: 15, speedMin: 45, speedMax: 130, gravity: 420, sizeMin: 1.6, sizeMax: 3.4, lifeMin: 0.28, lifeMax: 0.52, colors: ['#2e7bd6', '#67b8ff', '#bfe4ff'], riseBias: -55, spread: 1.8, forwardBias: 40 },
    spark: { count: 4, color: '#cfeeff', life: 0.6, size: 2.4 },
  },
  earth: {
    shards: { count: 6, lenMin: 12, lenMax: 28, color: '#6a4f28', life: 0.28 },
    particles: { count: 15, speedMin: 42, speedMax: 130, gravity: 620, sizeMin: 2, sizeMax: 4.6, lifeMin: 0.3, lifeMax: 0.56, colors: ['#7a5a30', '#46c23a', '#5f7a35'], riseBias: -70, spread: 1.5, forwardBias: 55 },
    spark: { count: 4, color: '#8affa0', life: 0.6, size: 2.6 },
  },
  air: {
    shards: { count: 5, lenMin: 14, lenMax: 30, color: '#cfe8ff', life: 0.16 },
    particles: { count: 13, speedMin: 85, speedMax: 180, gravity: 40, sizeMin: 1.1, sizeMax: 2.6, lifeMin: 0.16, lifeMax: 0.32, colors: ['#cfe8ff', '#a9d4ff', '#bcd4ff'], riseBias: -10, spread: 1.5, forwardBias: 95 },
    spark: { count: 5, color: '#eaf6ff', life: 0.5, size: 2.2 },
  },
  ice: {
    shards: { count: 6, lenMin: 14, lenMax: 32, color: '#9fe0ff', life: 0.3 },
    particles: { count: 14, speedMin: 48, speedMax: 135, gravity: 260, sizeMin: 1.7, sizeMax: 3.6, lifeMin: 0.26, lifeMax: 0.5, colors: ['#7fe6ff', '#cdeeff', '#6fc7ee'], riseBias: -30, spread: 1.25, forwardBias: 70 },
    spark: { count: 5, color: '#e6faff', life: 0.7, size: 2.6 },
  },
  blood: {
    shards: { count: 5, lenMin: 10, lenMax: 24, color: '#8e1414', life: 0.22 },
    particles: { count: 15, speedMin: 44, speedMax: 130, gravity: 500, sizeMin: 1.9, sizeMax: 4.2, lifeMin: 0.3, lifeMax: 0.58, colors: ['#8e1414', '#c81e1e', '#5e0d0d'], riseBias: -40, spread: 1.7, forwardBias: 45 },
    spark: { count: 4, color: '#ff6a6a', life: 0.6, size: 2.6 },
  },
  shadow: {
    shards: { count: 6, lenMin: 12, lenMax: 28, color: '#2a1840', life: 0.3 },
    particles: { count: 14, speedMin: 34, speedMax: 108, gravity: 180, sizeMin: 2, sizeMax: 4.4, lifeMin: 0.34, lifeMax: 0.64, colors: ['#5a2f86', '#6a3fb0', '#1b1024'], riseBias: -30, spread: 1.5, forwardBias: 35 },
    spark: { count: 5, color: '#b98cff', life: 0.7, size: 2.8 },
  },
  smoke: {
    shards: { count: 4, lenMin: 8, lenMax: 18, color: '#8f8f8f', life: 0.2 },
    particles: { count: 14, speedMin: 22, speedMax: 84, gravity: -50, sizeMin: 2.4, sizeMax: 5, lifeMin: 0.44, lifeMax: 0.84, colors: ['#6f6f6f', '#9a9a9a', '#4f4f4f'], riseBias: -44, spread: 2.3, forwardBias: 18 },
    spark: { count: 4, color: '#d8d8d8', life: 0.7, size: 2.6 },
  },
};

/**
 * Thin a set of VFX targets down to at most `max`, keeping the survivors spread evenly
 * *around* `origin` rather than clustered on one side.
 *
 * Every "one GFX per affected thing" effect has the same failure: it reads beautifully
 * at three targets and turns the board to soup at thirty — and thirty is precisely the
 * case the player most needs to read (a slam into a packed horde, a volatile corpse
 * inside a dense grid of towers). Capping alone is not enough, because the natural cap
 * is `slice(0, max)` and the arrays are built in spawn or placement order, so the six
 * survivors all come from one corner and the effect reads as a *directional* attack it
 * never was.
 *
 * So: sort by bearing around the origin, then walk that circle in even strides. The
 * result still says "everything around me", at a fixed cost.
 */
export function fanSample<T extends { x: number; y: number }>(
  items: readonly T[],
  origin: { x: number; y: number },
  max: number,
): T[] {
  if (max <= 0) return [];
  if (items.length <= max) return [...items];
  const byBearing = [...items].sort(
    (a, b) => Math.atan2(a.y - origin.y, a.x - origin.x) - Math.atan2(b.y - origin.y, b.x - origin.x),
  );
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(byBearing[Math.floor((i * byBearing.length) / max)]);
  return out;
}

import { ASSETS } from '../assets';

/**
 * Playback metadata for a baked spotanim (GFX) sprite sheet. The PNG is a
 * horizontal strip of `frames` cells, each `frameW`×`frameH`, produced by
 * scripts/render-osrs-spotanims.mjs (which also emits a matching JSON sidecar —
 * the per-frame timings below are copied from it). The renderer plays the strip
 * once at the effect's location, additively blended for the in-game glow.
 */
export interface SpotAnimMeta {
  /** Sprite-sheet URL (already base-path-prefixed via ASSETS). */
  url: string;
  frames: number;
  frameW: number;
  frameH: number;
  /** Authentic per-frame durations (ms) from the cache sequence. */
  frameMs: number[];
  /** On-screen draw size (logic px), centred on the effect point. */
  size: number;
  /** Playback speed multiplier (>1 plays faster than the cache timing). */
  speed: number;
  /** Loops forever (e.g. the spawn portal) instead of playing once. */
  loop?: boolean;
}

export const SPOTANIMS: Record<string, SpotAnimMeta> = {
  // Spawn portal — the Pest Control void portal NPC (1739) idle swirl, side-on.
  // Looping: drawn every frame at the portal point (not via spawnEffect).
  portal: {
    url: ASSETS.spotanims.portal,
    frames: 12,
    frameW: 96,
    frameH: 96,
    frameMs: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80],
    size: 104,
    speed: 1,
    loop: true,
  },
};

/** Total play time (seconds) of a spotanim at its configured speed. */
export function spotAnimDurationS(meta: SpotAnimMeta): number {
  let sum = 0;
  for (const ms of meta.frameMs) sum += ms;
  return sum / meta.speed / 1000;
}

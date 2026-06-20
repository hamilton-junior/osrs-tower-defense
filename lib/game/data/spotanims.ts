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
}

export const SPOTANIMS: Record<string, SpotAnimMeta> = {
  // Enemy materialise at the spawn portal — the Teleport gem (spotanim 111).
  // Sped up 1.4× so the flash is snappy rather than the full ~1.8s teleport.
  spawn: {
    url: ASSETS.spotanims.spawn,
    frames: 12,
    frameW: 96,
    frameH: 96,
    frameMs: [120, 140, 140, 140, 420, 100, 100, 100, 100, 100, 100, 220],
    size: 56,
    speed: 1.4,
  },
};

/** Total play time (seconds) of a spotanim at its configured speed. */
export function spotAnimDurationS(meta: SpotAnimMeta): number {
  let sum = 0;
  for (const ms of meta.frameMs) sum += ms;
  return sum / meta.speed / 1000;
}

/**
 * Runtime playback metadata for a baked **enemy animation** clip — one
 * horizontal sprite sheet of `frames` cells (each `frameW`×`frameH`) produced by
 * scripts/render-osrs-npc-anims.mjs. Mirrors the JSON manifest that script
 * emits. The renderer plays `walk` as a continuous loop and `hurt`/`death` as
 * one-shots (see GameRenderer.drawEnemies / drawDeaths).
 */
export interface EnemyClip {
  url: string;
  frames: number;
  /** Per-frame durations (ms). */
  frameMs: number[];
  loop: boolean;
}

export interface EnemyAnimSet {
  frameW: number;
  frameH: number;
  /**
   * `walk` is required (the default loop); the rest are optional one-shots.
   * `burrow`/`emerge` are the Giant Mole's dig and surface clips — a boss whose
   * mechanic *is* an animation, so it plays the real OSRS ones.
   */
  clips: {
    walk: EnemyClip;
    hurt?: EnemyClip;
    death?: EnemyClip;
    burrow?: EnemyClip;
    emerge?: EnemyClip;
  };
}

// The table itself is generated from the baked manifests (one entry per enemy);
// this module owns only the contract + playback helpers.
export { ENEMY_ANIMS } from './enemy-anims.data';

/** Total play time (seconds) of one clip. */
export function clipDurationS(clip: EnemyClip): number {
  let ms = 0;
  for (const f of clip.frameMs) ms += f;
  return ms / 1000;
}

/**
 * Frame index for a clip at `elapsedS` seconds in. Looping clips wrap; one-shots
 * clamp to the final frame once finished.
 */
export function clipFrame(clip: EnemyClip, elapsedS: number): number {
  let total = 0;
  for (const f of clip.frameMs) total += f;
  let rem = elapsedS * 1000;
  if (clip.loop) rem = ((rem % total) + total) % total;
  else if (rem >= total) return clip.frames - 1;
  let fi = 0;
  for (; fi < clip.frames - 1; fi++) {
    if (rem < clip.frameMs[fi]) break;
    rem -= clip.frameMs[fi];
  }
  return fi;
}

/** Window (s) a hit-flinch (`hurt`) clip is shown before reverting to `walk`. */
export const HURT_SECONDS = 0.4;

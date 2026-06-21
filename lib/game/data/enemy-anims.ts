import { ASSETS } from '../assets';

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
  /** `walk` is required (the default loop); `hurt`/`death` are optional. */
  clips: { walk: EnemyClip; hurt?: EnemyClip; death?: EnemyClip };
}

const uniform = (n: number, ms: number) => Array.from({ length: n }, () => ms);

export const ENEMY_ANIMS: Record<string, EnemyAnimSet> = {
  // Goblin (NPC 655) — baked from the 618x animation block.
  goblin: {
    frameW: 128,
    frameH: 128,
    clips: {
      walk: { url: ASSETS.enemyAnims.goblin.walk, frames: 16, frameMs: uniform(16, 60), loop: true },
      hurt: { url: ASSETS.enemyAnims.goblin.hurt, frames: 18, frameMs: uniform(18, 60), loop: false },
      // The cache holds a 6 s corpse-lie on the last death frame; trim it to a
      // short settle so the body fades soon after it hits the ground.
      death: { url: ASSETS.enemyAnims.goblin.death, frames: 24, frameMs: [...uniform(23, 60), 240], loop: false },
    },
  },
};

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

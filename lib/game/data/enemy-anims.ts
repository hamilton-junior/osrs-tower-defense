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
   * `walk` is required (the default loop); the rest are optional.
   *
   * `hurt`/`death` are the generic one-shots. The others are **mechanic clips** — a boss
   * whose mechanic *is* an animation plays the real OSRS one for the duration of that
   * phase, chosen by `bossPhaseClip`: `burrow`/`emerge` are the Giant Mole's dig and
   * surface, `rage`/`charge` are Brutus pawing the ground and galloping, `breath` is the
   * King Black Dragon rearing back through his inhale.
   */
  clips: {
    walk: EnemyClip;
    hurt?: EnemyClip;
    death?: EnemyClip;
    burrow?: EnemyClip;
    emerge?: EnemyClip;
    rage?: EnemyClip;
    charge?: EnemyClip;
    breath?: EnemyClip;
  };
}

// The table itself is generated from the baked manifests (one entry per enemy);
// this module owns only the contract + playback helpers.
export { ENEMY_ANIMS } from './enemy-anims.data';

/**
 * How long a corpse lingers after its death clip has played out, in seconds.
 * The clip ends on the pose the body settles into (its dead tail is cut at bake
 * time — see scripts/lib/clip-tail.mjs), and one-shots clamp to their last frame,
 * so this is exactly the window the corpse spends fading away on the ground.
 */
export const DEATH_SETTLE_S = 0.35;

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

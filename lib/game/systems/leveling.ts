import type { TowerSkill } from '../types';

/** XP required to advance a player skill from `level` to `level + 1`. */
export function playerXpForLevel(level: number): number {
  return Math.pow(level, 2) * 100;
}

/**
 * XP required to advance a tower skill from `level` to `level + 1`.
 *
 * The exponent decides whether the top of the gear ladder is content or decoration.
 * At 1.8 it took 844k XP to reach level 40 — and a tower taking a sixth of a normal
 * board's damage, wasting nothing and placed on wave 1, only banked that by wave 83.
 * Measured against the wave-90 run of the day, that made dragon darts, the amulet of
 * torture and the blood fury items no run ever reached. The victory wave has since
 * moved out to `EARLIEST_VICTORY_WAVE` (`systems/wave-generation`), which buys the old
 * curve room it did not have, but leaves the pacing untouched: gear that lands in the
 * closing stretch of a run is gear nobody gets to play with. At 1.6 the same tower is
 * there by wave 55, and the tier-4 unlock (level 15) moves from wave 37 to wave 26.
 */
export function towerXpForLevel(level: number): number {
  return Math.floor(Math.pow(level, 1.6) * 80);
}

export interface XpGainResult {
  level: number;
  xp: number;
  leveledUp: boolean;
}

/**
 * Apply an XP gain to a `{ level, xp }` skill using the given level-curve.
 * Mirrors the engine's single-step behaviour: at most one level per call, with
 * the threshold subtracted so leftover XP carries into the next level.
 */
export function applyXpGain(
  skill: TowerSkill,
  gain: number,
  xpForLevel: (level: number) => number,
): XpGainResult {
  const xp = skill.xp + gain;
  const threshold = xpForLevel(skill.level);
  if (xp >= threshold) {
    return { level: skill.level + 1, xp: xp - threshold, leveledUp: true };
  }
  return { level: skill.level, xp, leveledUp: false };
}

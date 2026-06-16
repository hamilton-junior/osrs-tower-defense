import type { TowerSkill } from '../types';

/** XP required to advance a player skill from `level` to `level + 1`. */
export function playerXpForLevel(level: number): number {
  return Math.pow(level, 2) * 100;
}

/** XP required to advance a tower skill from `level` to `level + 1`. */
export function towerXpForLevel(level: number): number {
  return Math.floor(Math.pow(level, 1.8) * 80);
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

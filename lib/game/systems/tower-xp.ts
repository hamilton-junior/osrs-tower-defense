import type { CombatStyle, TowerSkill, TowerSkills, Tower } from '../types';
import { towerXpForLevel } from './leveling';
import { TOWER_STYLES } from '../data/towers';

/** XP earned per point of damage dealt. */
export const XP_PER_DAMAGE = 1;
/** XP multiplier when the hit exploited the enemy's combat-triangle weakness. */
export const XP_WEAKNESS_BONUS = 1.5;
/** Damage bump per combat level above 1. */
export const PER_LEVEL_DMG = 0.01;
/** Ceiling on the per-level damage nudge (1.5 = +50% at level 51). */
export const PER_LEVEL_CAP = 1.5;
/** OSRS-flavoured combat level cap. */
export const MAX_TOWER_LEVEL = 99;
/** Combat level required to buy each tier (index = the tier being bought). */
export const TIER_UNLOCK_LEVELS: Record<number, number> = { 2: 3, 3: 8, 4: 15 };

/** The one skill a tower of the given style trains. */
export function styleSkillKey(style: CombatStyle): keyof TowerSkills {
  return style === 'melee' ? 'strength' : style === 'ranged' ? 'ranged' : 'magic';
}

/** XP a single landed hit is worth. Zero for a hit that dealt nothing. */
export function xpFromHit(dealt: number, exploitedWeakness: boolean): number {
  if (dealt <= 0) return 0;
  return dealt * XP_PER_DAMAGE * (exploitedWeakness ? XP_WEAKNESS_BONUS : 1);
}

/**
 * Apply a whole XP gain to a skill, crossing as many level thresholds as it
 * spans (a big hit can raise several levels at once). Caps at MAX_TOWER_LEVEL,
 * where leftover XP is discarded so a maxed skill shows a full-but-static bar.
 */
export function trainSkill(skill: TowerSkill, gain: number): { level: number; xp: number; leveledUp: boolean } {
  let level = skill.level;
  let xp = skill.xp + Math.max(0, gain);
  let leveledUp = false;
  while (level < MAX_TOWER_LEVEL && xp >= towerXpForLevel(level)) {
    xp -= towerXpForLevel(level);
    level += 1;
    leveledUp = true;
  }
  if (level >= MAX_TOWER_LEVEL) xp = 0;
  return { level, xp, leveledUp };
}

/** Capped multiplicative damage bonus from a tower's combat level (level 1 = 1.0). */
export function levelStatBonus(level: number): number {
  return Math.min(1 + (level - 1) * PER_LEVEL_DMG, PER_LEVEL_CAP);
}

/** Combat level required to buy `nextTier` (1 = no requirement). */
export function tierUnlockLevel(nextTier: number): number {
  return TIER_UNLOCK_LEVELS[nextTier] ?? 1;
}

/** A tower's effective combat level = the level of its one style skill. */
export function towerCombatLevel(tower: Pick<Tower, 'type' | 'skills'>): number {
  return tower.skills[styleSkillKey(TOWER_STYLES[tower.type].style)].level;
}

/**
 * Whether a tower may buy its next tier, and the level it needs. `ok` is false
 * at max tier or below the tier's level threshold. Gold is checked separately.
 */
export function tierGateFor(
  tower: Pick<Tower, 'type' | 'level' | 'maxLevel' | 'skills'>,
): { ok: boolean; neededLevel: number } {
  const neededLevel = tierUnlockLevel(tower.level + 1);
  const ok = tower.level < tower.maxLevel && towerCombatLevel(tower) >= neededLevel;
  return { ok, neededLevel };
}

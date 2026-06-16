import type { Tower, GlobalUpgrades, PrayerType, ActivePotion } from '../types';
import { distance } from './geometry';

export interface TowerStatsContext {
  upgrades: GlobalUpgrades;
  activePrayers: ReadonlySet<PrayerType>;
  activePotions: ActivePotion[];
  /** All placed towers — needed to apply nearby Utility-mage support buffs. */
  allTowers: Tower[];
}

export interface ComputedTowerStats {
  damageMultiplier: number;
  flatDamageBonus: number;
  range: number;
  cooldown: number;
}

/**
 * Compute a tower's effective combat stats for the current frame by layering
 * global upgrades, active prayers, active potions, nearby Utility-mage support
 * buffs, and equipped-item bonuses onto its base `range`/`cooldown`. Pure: all
 * external state arrives via {@link TowerStatsContext}.
 */
export function calculateTowerStats(
  tower: Tower,
  ctx: TowerStatsContext,
): ComputedTowerStats {
  let damageMultiplier = 1.0;
  let rangeMultiplier = 1.0;
  let speedMultiplier = 1.0;
  let flatDamageBonus = 0;

  const { upgrades, activePrayers, activePotions, allTowers } = ctx;

  // Global upgrades
  if (tower.type === 'archer') {
    rangeMultiplier *= upgrades.archerRange;
    damageMultiplier *= upgrades.archerDamage || 1.0;
  } else if (tower.type === 'wizard') {
    damageMultiplier *= upgrades.magicDamage;
  } else if (tower.type === 'cannon') {
    speedMultiplier *= upgrades.cannonSpeed;
  }

  // Prayer bonuses (best active prayer for the tower's combat style)
  if (tower.type === 'archer') {
    if (activePrayers.has('rigour')) damageMultiplier *= 1.23;
    else if (activePrayers.has('eagle_eye')) damageMultiplier *= 1.15;
    else if (activePrayers.has('hawk_eye')) damageMultiplier *= 1.1;
    else if (activePrayers.has('sharp_eye')) damageMultiplier *= 1.05;
  } else if (tower.type === 'wizard') {
    if (activePrayers.has('augury')) damageMultiplier *= 1.25;
    else if (activePrayers.has('mystic_will')) damageMultiplier *= 1.05;
  } else if (tower.type === 'tzhaar') {
    if (activePrayers.has('piety')) damageMultiplier *= 1.23;
    else if (activePrayers.has('ultimate_strength')) damageMultiplier *= 1.15;
    else if (activePrayers.has('burst_of_strength')) damageMultiplier *= 1.05;
  }

  // Potion bonuses
  if (activePotions.some(p => p.type === 'overload')) {
    damageMultiplier *= 1.15;
    rangeMultiplier *= 1.1;
    speedMultiplier *= 1.1;
  }
  if (tower.type === 'archer' && activePotions.some(p => p.type === 'ranging')) {
    damageMultiplier *= 1.15;
    rangeMultiplier *= 1.1;
  }
  if (tower.type === 'wizard' && activePotions.some(p => p.type === 'magic')) {
    damageMultiplier *= 1.2;
  }
  if (tower.type === 'tzhaar' && activePotions.some(p => p.type === 'super_combat')) {
    damageMultiplier *= 1.15;
  }

  // Utility-mage support buffs from any in-range support tower
  for (const t of allTowers) {
    if (t.id === tower.id || t.type !== 'wizard' || t.mageMode !== 'utility') continue;
    if (distance(t.x, t.y, tower.x, tower.y) > t.range) continue;
    if (t.level >= 1) rangeMultiplier *= 1.1;
    if (t.level >= 2) speedMultiplier *= 1.1;
    if (t.level >= 3) rangeMultiplier *= 1.1; // stacks with the level-1 buff
    if (t.level >= 4) damageMultiplier *= 1.1;
  }

  // Equipment bonuses
  for (const slot of ['weapon', 'shield', 'accessory'] as const) {
    const item = tower.equipment[slot];
    if (!item) continue;
    if (item.bonus.damage) flatDamageBonus += item.bonus.damage;
    if (item.bonus.range) rangeMultiplier *= 1 + item.bonus.range / 100;
    if (item.bonus.cooldown) speedMultiplier *= 1 + item.bonus.cooldown / 100;
  }

  return {
    damageMultiplier,
    flatDamageBonus,
    range: tower.range * rangeMultiplier,
    cooldown: tower.cooldown / speedMultiplier,
  };
}

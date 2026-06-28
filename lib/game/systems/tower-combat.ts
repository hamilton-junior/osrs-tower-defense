import type { Tower, GlobalUpgrades, PrayerType, ActivePotion } from '../types';
import { distance } from './geometry';
import { TOWER_STYLES } from '../data/towers';
import { TOWER_PRAYERS } from '../data/prayers';
import { GE_OFFERS } from '../data/ge';

export interface TowerStatsContext {
  upgrades: GlobalUpgrades;
  activePrayers: ReadonlySet<PrayerType>;
  activePotions: ActivePotion[];
  /** All placed towers — needed to apply nearby Utility-mage support buffs. */
  allTowers: Tower[];
  /** Roguelite run-scoped multipliers (damage/range/fireRate), split per combat
   *  style. Omitted in classic mode; the tower's own style is read off. */
  runMods?: {
    damage: { melee: number; ranged: number; magic: number };
    range: { melee: number; ranged: number; magic: number };
    fireRate: { melee: number; ranged: number; magic: number };
  };
}

export interface ComputedTowerStats {
  damageMultiplier: number;
  flatDamageBonus: number;
  range: number;
  cooldown: number;
}

/** Per-stat additive bonus a single in-range Utility wizard grants (by level). */
export function utilityAuraBonus(level: number): { range: number; speed: number; damage: number } {
  return {
    range: (level >= 1 ? 0.1 : 0) + (level >= 3 ? 0.1 : 0),
    speed: level >= 2 ? 0.1 : 0,
    damage: level >= 4 ? 0.1 : 0,
  };
}

/**
 * Combine several additive bonuses with diminishing returns: the strongest
 * counts fully, each next one is worth `factor`× as much (0.5 → full, half,
 * quarter…). Keeps stacking many buff/debuff towers useful but not runaway.
 */
export function diminishingSum(bonuses: number[], factor = 0.5): number {
  return [...bonuses]
    .filter(b => b > 0)
    .sort((a, b) => b - a)
    .reduce((sum, b, i) => sum + b * Math.pow(factor, i), 0);
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

  // Prayer + potion boosts key off the weapon's combat style, and only apply to
  // boostable weapons — the Dwarf Cannon deals Ranged damage but has fixed
  // damage in OSRS, so it ignores them (see TOWER_STYLES).
  const profile = TOWER_STYLES[tower.type];
  if (profile?.boostable) {
    // Best active offensive prayer matching this style.
    let bestPrayer = 0;
    for (const p of TOWER_PRAYERS) {
      if (p.style === profile.style && activePrayers.has(p.id)) bestPrayer = Math.max(bestPrayer, p.dmg);
    }
    damageMultiplier *= 1 + bestPrayer;

    // Potions: a style-less buff (Overload) boosts everything; a styled buff
    // only boosts its own style.
    for (const pot of activePotions) {
      const offer = GE_OFFERS.find(o => o.id === pot.type);
      if (!offer || offer.kind !== 'buff') continue;
      if (offer.style && offer.style !== profile.style) continue;
      damageMultiplier *= 1 + (offer.dmg ?? 0);
      rangeMultiplier *= 1 + (offer.range ?? 0);
      speedMultiplier *= 1 + (offer.speed ?? 0);
    }
  }

  // Utility-mage support buffs from any in-range support tower, with diminishing
  // returns so fielding many auras stacks usefully but not without limit.
  const auraRange: number[] = [];
  const auraSpeed: number[] = [];
  const auraDamage: number[] = [];
  for (const t of allTowers) {
    if (t.id === tower.id || t.type !== 'wizard' || t.mageMode !== 'utility') continue;
    if (distance(t.x, t.y, tower.x, tower.y) > t.range) continue;
    const b = utilityAuraBonus(t.level);
    if (b.range) auraRange.push(b.range);
    if (b.speed) auraSpeed.push(b.speed);
    if (b.damage) auraDamage.push(b.damage);
  }
  rangeMultiplier *= 1 + diminishingSum(auraRange);
  speedMultiplier *= 1 + diminishingSum(auraSpeed);
  damageMultiplier *= 1 + diminishingSum(auraDamage);

  // Equipment bonuses
  for (const slot of ['weapon', 'shield', 'accessory'] as const) {
    const item = tower.equipment[slot];
    if (!item) continue;
    if (item.bonus.damage) flatDamageBonus += item.bonus.damage;
    if (item.bonus.range) rangeMultiplier *= 1 + item.bonus.range / 100;
    if (item.bonus.cooldown) speedMultiplier *= 1 + item.bonus.cooldown / 100;
  }

  // Roguelite run-scoped buffs (drafts) — the last, run-wide layer over
  // everything, keyed off this tower's combat style so a "melee damage" card only
  // touches melee towers (a "general" card buffs all three styles equally).
  if (ctx.runMods) {
    const s = TOWER_STYLES[tower.type]?.style ?? 'melee';
    damageMultiplier *= ctx.runMods.damage[s];
    rangeMultiplier *= ctx.runMods.range[s];
    speedMultiplier *= ctx.runMods.fireRate[s];
  }

  return {
    damageMultiplier,
    flatDamageBonus,
    range: tower.range * rangeMultiplier,
    cooldown: tower.cooldown / speedMultiplier,
  };
}

import type { Tower, GlobalUpgrades, PrayerType, ActivePotion, MageMode } from '../types';
import { distance } from './geometry';
import { softCapMult, RANGE_MULT_CEILING, FIRE_RATE_MULT_CEILING } from './run-modifiers';
import { TOWER_STYLES } from '../data/towers';
import { TOWER_PRAYERS } from '../data/prayers';
import { GE_OFFERS } from '../data/ge';
import { levelStatBonus, styleSkillKey } from './tower-xp';

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
  /** Roguelite placement-synergy cards — a per-tower damage layer that depends
   *  on the field layout (nearby towers / position). All optional/null. */
  synergy?: TowerSynergy;
  /** Pre-computed placement-synergy damage multiplier for this tower. The value is
   *  layout-invariant, so the per-frame combat path passes it in (cached once per
   *  layout change) instead of re-running the O(n) field scan every frame. When set
   *  it replaces the live {@link synergyDamageMult} call below. */
  synergyMult?: number;
  /** Enemy spawn point, for the `vanguard` synergy (frontmost tower). */
  portal?: { x: number; y: number };
  /** Roguelite magic-spellbook specialisations: per-wizard-subtype multipliers
   *  applied only to that mage mode's towers (1 = off). */
  mageBuff?: Record<MageMode, { damage: number; range: number; fireRate: number }>;
  /** Wave-event board-wide multipliers (all towers equally, this wave only).
   *  Omitted / all-1 when no event is active. See `systems/wave-events`. */
  globalMods?: { damage: number; range: number; fireRate: number };
}

export interface TowerSynergy {
  packTactics?: { frac: number; radius: number; maxStacks: number } | null;
  trinity?: { mult: number; radius: number } | null;
  vanguard?: { mult: number } | null;
  loneWolf?: { mult: number; radius: number } | null;
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
 * Per-tower damage multiplier from the roguelite placement-synergy cards. Pure:
 * reads only the tower, the field (`allTowers`), the synergy config and the
 * portal. Each active card layers multiplicatively, rewarding a distinct layout —
 * clustering same types (pack), mixing styles (trinity), pushing one forward
 * (vanguard), or spreading out (lone wolf).
 */
export function synergyDamageMult(
  tower: Tower,
  allTowers: Tower[],
  synergy: TowerSynergy | undefined,
  portal?: { x: number; y: number },
): number {
  if (!synergy) return 1;
  let m = 1;
  const style = TOWER_STYLES[tower.type]?.style ?? 'melee';

  if (synergy.packTactics) {
    const { frac, radius, maxStacks } = synergy.packTactics;
    let n = 0;
    for (const t of allTowers) {
      if (t.id !== tower.id && t.type === tower.type && distance(t.x, t.y, tower.x, tower.y) <= radius) n++;
    }
    m *= 1 + frac * Math.min(n, maxStacks);
  }

  if (synergy.trinity) {
    const { mult, radius } = synergy.trinity;
    const near = new Set<string>();
    for (const t of allTowers) {
      if (t.id !== tower.id && distance(t.x, t.y, tower.x, tower.y) <= radius) {
        near.add(TOWER_STYLES[t.type]?.style ?? 'melee');
      }
    }
    const others = (['melee', 'ranged', 'magic'] as const).filter(s => s !== style);
    if (others.every(s => near.has(s))) m *= mult;
  }

  if (synergy.vanguard && portal && allTowers.length) {
    let nearest = Infinity;
    for (const t of allTowers) nearest = Math.min(nearest, distance(t.x, t.y, portal.x, portal.y));
    if (distance(tower.x, tower.y, portal.x, portal.y) <= nearest + 0.001) m *= synergy.vanguard.mult;
  }

  if (synergy.loneWolf) {
    const { mult, radius } = synergy.loneWolf;
    const alone = !allTowers.some(t => t.id !== tower.id && distance(t.x, t.y, tower.x, tower.y) <= radius);
    if (alone) m *= mult;
  }

  return m;
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

  // Combat-level nudge: the tower's own XP-earned level adds a small, capped
  // damage bump so growth is felt between tier upgrades. Level 1 = ×1.
  damageMultiplier *= levelStatBonus(tower.skills[styleSkillKey(TOWER_STYLES[tower.type].style)].level);

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
  for (const slot of ['ammo', 'jewellery'] as const) {
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
    // All three stacked multipliers fold through concave ceilings so a long run's
    // board can't compound past the enemy HP / coverage curves. Each has its own
    // asymptote: damage is tightest, range and fireRate cap sooner (more game-changing).
    damageMultiplier *= softCapMult(ctx.runMods.damage[s]);
    rangeMultiplier *= softCapMult(ctx.runMods.range[s], RANGE_MULT_CEILING);
    speedMultiplier *= softCapMult(ctx.runMods.fireRate[s], FIRE_RATE_MULT_CEILING);
  }

  // Wave-event board-wide multipliers — a transient, this-wave-only layer over
  // everything, applied equally to every tower regardless of style.
  if (ctx.globalMods) {
    damageMultiplier *= ctx.globalMods.damage;
    rangeMultiplier *= ctx.globalMods.range;
    speedMultiplier *= ctx.globalMods.fireRate;
  }

  // Placement-synergy cards: a final per-tower damage layer keyed off the layout.
  // Prefer a pre-computed, layout-cached multiplier (the hot path); fall back to
  // scanning the field live when a caller (preview / UI) hasn't cached one.
  const synMult = ctx.synergyMult ?? (ctx.synergy ? synergyDamageMult(tower, allTowers, ctx.synergy, ctx.portal) : 1);
  damageMultiplier *= synMult;

  // Magic spellbook specialisations: buff only one wizard subtype (elemental /
  // ancients / utility), so a card touches that spellbook's towers and no others.
  if (ctx.mageBuff && tower.type === 'wizard') {
    const b = ctx.mageBuff[tower.mageMode ?? 'elemental'];
    if (b) {
      damageMultiplier *= b.damage;
      rangeMultiplier *= b.range;
      speedMultiplier *= b.fireRate;
    }
  }

  return {
    damageMultiplier,
    flatDamageBonus,
    range: tower.range * rangeMultiplier,
    cooldown: tower.cooldown / speedMultiplier,
  };
}

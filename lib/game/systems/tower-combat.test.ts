import { describe, it, expect } from 'vitest';
import type { Tower, GlobalUpgrades, PrayerType, ActivePotion } from '../types';
import { calculateTowerStats, TowerStatsContext, diminishingSum, utilityAuraBonus } from './tower-combat';

const baseUpgrades: GlobalUpgrades = {
  archerRange: 1, archerDamage: 1, magicDamage: 1, cannonSpeed: 1, slayerReward: 1,
  prayerEfficiency: 1, startingMoney: 0, rewardMultiplier: 1, waveSpeed: 1,
  towerCostReduction: 1, xpGainMultiplier: 1, prayerRegen: 0,
};

function tower(over: Partial<Tower> = {}): Tower {
  return {
    id: 't1', x: 0, y: 0, type: 'archer', level: 1, maxLevel: 4, range: 100, damage: 10,
    cooldown: 1000, lastFired: 0, color: '#fff', targetId: null, targetingPriority: 'first',
    name: 'Bow', upgradeCost: 0, specCharge: 0, specMax: 100, visualRadius: 18, disabledTimer: 0,
    skills: { strength: { level: 1, xp: 0 }, ranged: { level: 1, xp: 0 }, magic: { level: 1, xp: 0 } },
    equipment: { weapon: null, shield: null, accessory: null },
    ...over,
  } as Tower;
}

function ctx(over: Partial<TowerStatsContext> = {}): TowerStatsContext {
  return {
    upgrades: baseUpgrades,
    activePrayers: new Set<PrayerType>(),
    activePotions: [] as ActivePotion[],
    allTowers: [],
    ...over,
  };
}

describe('diminishingSum', () => {
  it('counts the strongest bonus fully and halves each next one', () => {
    expect(diminishingSum([0.1])).toBeCloseTo(0.1);
    expect(diminishingSum([0.1, 0.1])).toBeCloseTo(0.15); // 0.1 + 0.05
    expect(diminishingSum([0.2, 0.1])).toBeCloseTo(0.25); // sorted: 0.2 + 0.05
  });
  it('ignores non-positive bonuses', () => {
    expect(diminishingSum([0, 0.1])).toBeCloseTo(0.1);
  });
});

describe('utilityAuraBonus', () => {
  it('grows the aura by tower level', () => {
    expect(utilityAuraBonus(1)).toEqual({ range: 0.1, speed: 0, damage: 0 });
    expect(utilityAuraBonus(4)).toEqual({ range: 0.2, speed: 0.1, damage: 0.1 });
  });
});

describe('calculateTowerStats', () => {
  it('returns base stats with no buffs', () => {
    const s = calculateTowerStats(tower(), ctx());
    expect(s).toEqual({ damageMultiplier: 1, flatDamageBonus: 0, range: 100, cooldown: 1000 });
  });

  it('applies archer global upgrades', () => {
    const s = calculateTowerStats(tower(), ctx({ upgrades: { ...baseUpgrades, archerRange: 2, archerDamage: 1.5 } }));
    expect(s.range).toBe(200);
    expect(s.damageMultiplier).toBeCloseTo(1.5);
  });

  it('applies the best active prayer for the style', () => {
    const s = calculateTowerStats(tower(), ctx({ activePrayers: new Set<PrayerType>(['rigour']) }));
    expect(s.damageMultiplier).toBeCloseTo(1.23);
  });

  it('applies overload potion to damage, range and speed', () => {
    const s = calculateTowerStats(tower(), ctx({ activePotions: [{ type: 'overload', timer: 60 }] }));
    expect(s.damageMultiplier).toBeCloseTo(1.15);
    expect(s.range).toBeCloseTo(110);
    expect(s.cooldown).toBeCloseTo(1000 / 1.1);
  });

  it('boosts a ranged tower with a Ranging potion (style match)', () => {
    const s = calculateTowerStats(tower({ type: 'archer' }), ctx({ activePotions: [{ type: 'ranging', timer: 60 }] }));
    expect(s.damageMultiplier).toBeCloseTo(1.15);
    expect(s.range).toBeCloseTo(110); // +10% range
  });

  it('does not boost a magic tower with a Ranging potion (style mismatch)', () => {
    const s = calculateTowerStats(tower({ type: 'wizard' }), ctx({ activePotions: [{ type: 'ranging', timer: 60 }] }));
    expect(s.damageMultiplier).toBeCloseTo(1);
    expect(s.range).toBeCloseTo(100);
  });

  it('boosts a melee tower with a Super Combat potion', () => {
    const s = calculateTowerStats(tower({ type: 'tzhaar' }), ctx({ activePotions: [{ type: 'super_combat', timer: 60 }] }));
    expect(s.damageMultiplier).toBeCloseTo(1.15);
  });

  it('leaves the (unboostable) cannon unaffected by potions and prayers', () => {
    const s = calculateTowerStats(
      tower({ type: 'cannon' }),
      ctx({ activePotions: [{ type: 'ranging', timer: 60 }, { type: 'overload', timer: 60 }], activePrayers: new Set<PrayerType>(['rigour']) }),
    );
    expect(s.damageMultiplier).toBeCloseTo(1);
    expect(s.range).toBeCloseTo(100);
    expect(s.cooldown).toBeCloseTo(1000);
  });

  it('adds equipment bonuses (flat damage, range %, cooldown %)', () => {
    const weapon = { id: 'w', name: 'W', description: '', type: 'weapon' as const, bonus: { damage: 5, range: 10, cooldown: 20 } };
    const s = calculateTowerStats(tower({ equipment: { weapon, shield: null, accessory: null } }), ctx());
    expect(s.flatDamageBonus).toBe(5);
    expect(s.range).toBeCloseTo(110);
    expect(s.cooldown).toBeCloseTo(1000 / 1.2);
  });

  it('applies in-range utility-mage support buffs (and stacks range at lvl 3+)', () => {
    const support = tower({ id: 'sup', type: 'wizard', mageMode: 'utility', level: 4, range: 1000, x: 0, y: 0 });
    const s = calculateTowerStats(tower(), ctx({ allTowers: [tower(), support] }));
    expect(s.range).toBeCloseTo(100 * 1.2); // lvl1 + lvl3 range buffs (additive: +0.2)
    expect(s.cooldown).toBeCloseTo(1000 / 1.1); // lvl2 speed buff
    expect(s.damageMultiplier).toBeCloseTo(1.1); // lvl4 damage buff
  });

  it('ignores out-of-range support towers', () => {
    const support = tower({ id: 'sup', type: 'wizard', mageMode: 'utility', level: 4, range: 50, x: 9999, y: 0 });
    const s = calculateTowerStats(tower(), ctx({ allTowers: [tower(), support] }));
    expect(s).toEqual({ damageMultiplier: 1, flatDamageBonus: 0, range: 100, cooldown: 1000 });
  });
});

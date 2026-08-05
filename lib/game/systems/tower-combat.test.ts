import { describe, it, expect } from 'vitest';
import type { Tower, GlobalUpgrades, PrayerType, ActivePotion } from '../types';
import { calculateTowerStats, TowerStatsContext, diminishingSum, utilityAuraBonus, synergyDamageMult } from './tower-combat';

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
    equipment: { ammo: null, jewellery: null },
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

describe('synergyDamageMult', () => {
  const A = (over: Partial<Tower> = {}) => tower({ id: 'a', ...over });

  it('is 1 when no synergy is configured', () => {
    expect(synergyDamageMult(A(), [A()], undefined)).toBe(1);
  });

  it('packTactics: +frac per same-type tower in radius, capped at maxStacks', () => {
    const self = A({ id: 's', type: 'archer', x: 0, y: 0 });
    const field = [
      self,
      A({ id: '1', type: 'archer', x: 30, y: 0 }),   // in radius, same type
      A({ id: '2', type: 'archer', x: 50, y: 0 }),   // in radius, same type
      A({ id: '3', type: 'wizard', x: 30, y: 0 }),   // in radius, wrong type
      A({ id: '4', type: 'archer', x: 999, y: 0 }),  // same type, out of radius
    ];
    const syn = { packTactics: { frac: 0.1, radius: 96, maxStacks: 5 } };
    expect(synergyDamageMult(self, field, syn)).toBeCloseTo(1.2); // 2 same-type allies in range
  });

  it('packTactics: respects the stack cap', () => {
    const self = A({ id: 's', type: 'archer', x: 0, y: 0 });
    const field = [self, ...Array.from({ length: 6 }, (_, i) => A({ id: `n${i}`, type: 'archer', x: 10 + i, y: 0 }))];
    const syn = { packTactics: { frac: 0.1, radius: 96, maxStacks: 3 } };
    expect(synergyDamageMult(self, field, syn)).toBeCloseTo(1.3); // capped at 3 stacks
  });

  it('trinity: only when BOTH other styles sit within radius', () => {
    const self = A({ id: 's', type: 'archer', x: 0, y: 0 }); // ranged
    const syn = { trinity: { mult: 1.3, radius: 96 } };
    const meleeOnly = [self, A({ id: 'm', type: 'tzhaar', x: 20, y: 0 })];
    expect(synergyDamageMult(self, meleeOnly, syn)).toBe(1); // missing magic
    const both = [...meleeOnly, A({ id: 'w', type: 'wizard', x: 20, y: 0 })];
    expect(synergyDamageMult(self, both, syn)).toBeCloseTo(1.3);
  });

  it('vanguard: only the tower nearest the portal is buffed', () => {
    const front = A({ id: 'f', x: 10, y: 0 });
    const back = A({ id: 'b', x: 200, y: 0 });
    const syn = { vanguard: { mult: 1.6 } };
    const portal = { x: 0, y: 0 };
    expect(synergyDamageMult(front, [front, back], syn, portal)).toBeCloseTo(1.6);
    expect(synergyDamageMult(back, [front, back], syn, portal)).toBe(1);
  });

  it('loneWolf: buffs a tower only when no other sits within radius', () => {
    const self = A({ id: 's', x: 0, y: 0 });
    const syn = { loneWolf: { mult: 1.5, radius: 96 } };
    expect(synergyDamageMult(self, [self], syn)).toBeCloseTo(1.5); // alone
    expect(synergyDamageMult(self, [self, A({ id: 'o', x: 30, y: 0 })], syn)).toBe(1); // has a neighbour
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
    const ammo = { id: 'w', name: 'W', description: '', type: 'ammo' as const, bonus: { damage: 5, range: 10, cooldown: 20 } };
    const s = calculateTowerStats(tower({ equipment: { ammo, jewellery: null } }), ctx());
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

  it('applies a magic-subtype buff only to the matching wizard mode', () => {
    const mageBuff = {
      elemental: { damage: 1.25, range: 1.1, fireRate: 1 },
      ancients: { damage: 1, range: 1, fireRate: 1 },
      utility: { damage: 1, range: 1, fireRate: 1 },
    };
    const elem = calculateTowerStats(tower({ type: 'wizard', mageMode: 'elemental' }), ctx({ mageBuff }));
    expect(elem.damageMultiplier).toBeCloseTo(1.25);
    expect(elem.range).toBeCloseTo(110); // +10% range on the matching mode
    // a different spellbook is untouched
    const anc = calculateTowerStats(tower({ type: 'wizard', mageMode: 'ancients' }), ctx({ mageBuff }));
    expect(anc.damageMultiplier).toBeCloseTo(1);
    expect(anc.range).toBeCloseTo(100);
    // a non-wizard is never touched, whatever the buff
    const arch = calculateTowerStats(tower({ type: 'archer' }), ctx({ mageBuff }));
    expect(arch.damageMultiplier).toBeCloseTo(1);
  });

  it('ignores out-of-range support towers', () => {
    const support = tower({ id: 'sup', type: 'wizard', mageMode: 'utility', level: 4, range: 50, x: 9999, y: 0 });
    const s = calculateTowerStats(tower(), ctx({ allTowers: [tower(), support] }));
    expect(s).toEqual({ damageMultiplier: 1, flatDamageBonus: 0, range: 100, cooldown: 1000 });
  });

  // The combat hot path passes a pre-computed, layout-cached `synergyMult` instead
  // of re-scanning the field every frame (the fix for the FPS collapse with a
  // synergy card active on a full board). It must fold in identically to the live
  // `synergy` scan — and, when both are given, take precedence over it.
  it('applies a pre-computed synergyMult identically to the live synergy scan', () => {
    const self = tower({ id: 'self', type: 'archer', x: 0, y: 0 });
    const field = [self, tower({ id: 'a', type: 'archer', x: 30, y: 0 }), tower({ id: 'b', type: 'archer', x: 0, y: 30 })];
    const syn = { packTactics: { frac: 0.1, radius: 96, maxStacks: 5 } };
    const live = calculateTowerStats(self, ctx({ allTowers: field, synergy: syn }));
    const mult = synergyDamageMult(self, field, syn);
    const cached = calculateTowerStats(self, ctx({ allTowers: field, synergyMult: mult }));
    expect(cached.damageMultiplier).toBeCloseTo(live.damageMultiplier);
    expect(mult).toBeCloseTo(1.2); // two same-type allies in range
  });

  it('synergyMult takes precedence over a passed-in synergy config', () => {
    const s = calculateTowerStats(tower(), ctx({ synergyMult: 2, synergy: { packTactics: { frac: 0.1, radius: 96, maxStacks: 5 } } }));
    expect(s.damageMultiplier).toBeCloseTo(2); // the cached value wins; the live scan is skipped
  });
});

describe('calculateTowerStats — combat-level nudge', () => {
  it('a level-1 tower is unchanged', () => {
    const s = calculateTowerStats(tower(), ctx());
    expect(s.damageMultiplier).toBeCloseTo(1);
  });
  it('a higher combat level adds a capped damage bonus', () => {
    const leveled = tower({ skills: { strength: { level: 1, xp: 0 }, ranged: { level: 11, xp: 0 }, magic: { level: 1, xp: 0 } } });
    const s = calculateTowerStats(leveled, ctx());
    expect(s.damageMultiplier).toBeCloseTo(1.1); // +1% * 10 levels
  });
});

import { describe, it, expect } from 'vitest';
import { weaknessMultiplier, WEAKNESS_BONUS, ELEMENTS, ANCIENTS, lifestealChance, bloodBonusFrac, bloodBonusCap, bloodBonus, SUPPORT_SPELLS, SUPPORT_ORDER, ancientHit, ANCIENT_HITS, elementalSpellName, ancientSpellName, spellSpriteName, AIR_KNOCKBACK, tzhaarKnockback, tzhaarStun } from './magic';

describe('weaknessMultiplier', () => {
  it('boosts damage when the element matches the enemy weakness', () => {
    expect(weaknessMultiplier('fire', 'fire')).toBe(WEAKNESS_BONUS);
  });
  it('is neutral when the element does not match', () => {
    expect(weaknessMultiplier('water', 'fire')).toBe(1);
  });
  it('is neutral when the enemy has no weakness', () => {
    expect(weaknessMultiplier('fire', undefined)).toBe(1);
  });
  it('never boosts the "none" element', () => {
    expect(weaknessMultiplier('none', 'none' as never)).toBe(1);
  });
});

describe('spellbook specs', () => {
  it('gives each element a distinct on-hit effect', () => {
    expect(ELEMENTS.air.effect).toBe('pushback');
    expect(ELEMENTS.water.effect).toBe('amp');
    expect(ELEMENTS.earth.effect).toBe('stun');
    expect(ELEMENTS.fire.effect).toBe('burn');
  });
  it('marks only Blood as life-stealing', () => {
    expect(ANCIENTS.blood.lifesteal).toBe(true);
    expect(ANCIENTS.ice.lifesteal).toBeUndefined();
  });
});

describe('lifestealChance', () => {
  it('scales (1 + level)% with tower level', () => {
    expect(lifestealChance(1)).toBeCloseTo(0.02);
    expect(lifestealChance(4)).toBeCloseTo(0.05);
  });
});

describe('blood barrage nerf', () => {
  it('bonus frac is (0.75·level)% — steep level scaling', () => {
    expect(bloodBonusFrac(1)).toBeCloseTo(0.0075);
    expect(bloodBonusFrac(2)).toBeCloseTo(0.015);
    expect(bloodBonusFrac(3)).toBeCloseTo(0.0225);
    expect(bloodBonusFrac(4)).toBeCloseTo(0.03);
  });
  it('base cap (wave 0) is 30·level', () => {
    expect(bloodBonusCap(1)).toBe(30);
    expect(bloodBonusCap(4)).toBe(120);
  });
  it('grows 1% of the base per wave — doubled at wave 100', () => {
    expect(bloodBonusCap(1, 100)).toBeCloseTo(60);   // +100%
    expect(bloodBonusCap(4, 100)).toBeCloseTo(240);
    expect(bloodBonusCap(4, 200)).toBeCloseTo(360);  // +200%
    expect(bloodBonusCap(4, 50)).toBeCloseTo(180);   // +50%
  });
  it('a negative wave never shrinks the cap below its base', () => {
    expect(bloodBonusCap(4, -20)).toBe(120);
  });
  it('cap engages against giant max-HP pools', () => {
    // 100k HP boss at L4: 3% would be 3000 — the cap holds it to 120.
    expect(bloodBonus(100_000, bloodBonusFrac(4), bloodBonusCap(4))).toBe(120);
  });
  it('the late-game cap lets more of the %-HP bonus through', () => {
    // Same 100k boss, but met on wave 100: the ceiling has doubled, so does the hit.
    expect(bloodBonus(100_000, bloodBonusFrac(4), bloodBonusCap(4, 100))).toBe(240);
  });
});

describe('bloodBonus', () => {
  const L4 = bloodBonusFrac(4); // 3%
  it('is floor(maxHp · frac) while under the flat cap', () => {
    expect(bloodBonus(1000, L4, bloodBonusCap(4))).toBe(30); // 3% of 1000, under the 120 cap
    expect(bloodBonus(333, L4, bloodBonusCap(4))).toBe(9);   // 9.99 floored, not rounded
  });
  it('clamps to the flat cap against giant HP pools', () => {
    expect(bloodBonus(100_000, L4, bloodBonusCap(4))).toBe(120); // 3000 held to 120
  });
  it('an Infinity cap never clamps', () => {
    expect(bloodBonus(100_000, L4, Infinity)).toBe(3000);
  });
  it('splash scales both the bonus and the cap it clamps to', () => {
    expect(bloodBonus(100_000, L4, bloodBonusCap(4), 0.5)).toBe(60); // capped: 120 → 60
    expect(bloodBonus(1000, L4, bloodBonusCap(4), 0.5)).toBe(15);    // uncapped: 30 → 15
  });
});

describe('ancient damage', () => {
  it('uses the Ice-barrage line (Rush/Burst/Blitz/Barrage) per tower level', () => {
    expect(ANCIENT_HITS).toEqual([16, 22, 25, 30]);
    expect(ancientHit(1)).toBe(16);
    expect(ancientHit(4)).toBe(30);
  });
  it('clamps out-of-range levels', () => {
    expect(ancientHit(0)).toBe(16);
    expect(ancientHit(9)).toBe(30);
  });
});

describe('spell sprite names', () => {
  it('builds wiki file names per element/level (air casts "Wind")', () => {
    expect(elementalSpellName('air', 1)).toBe('Wind_Strike');
    expect(elementalSpellName('fire', 4)).toBe('Fire_Wave');
    expect(ancientSpellName('ice', 4)).toBe('Ice_Barrage');
  });
  it('resolves the cast for a wizard (utility → Arceuus icon), null for non-wizard', () => {
    expect(spellSpriteName({ type: 'wizard', mageMode: 'elemental', element: 'fire', level: 3 })).toBe('Fire_Blast');
    expect(spellSpriteName({ type: 'wizard', mageMode: 'ancients', ancientType: 'blood', level: 2 })).toBe('Blood_Burst');
    expect(spellSpriteName({ type: 'wizard', mageMode: 'utility', supportSpell: 'enfeeble', level: 4 })).toBe('Undead_Grasp');
    expect(spellSpriteName({ type: 'wizard', mageMode: 'utility', level: 4 })).toBe('Death_Charge'); // default curse
    expect(spellSpriteName({ type: 'archer', level: 1 })).toBeNull();
  });
});

describe('tzhaarKnockback', () => {
  it('scales by weapon tier relative to Air (½, =, +50%, ×2)', () => {
    expect(tzhaarKnockback(1)).toBe(AIR_KNOCKBACK * 0.5); // 14
    expect(tzhaarKnockback(2)).toBe(AIR_KNOCKBACK);       // 28
    expect(tzhaarKnockback(3)).toBe(AIR_KNOCKBACK * 1.5); // 42
    expect(tzhaarKnockback(4)).toBe(AIR_KNOCKBACK * 2);   // 56
  });
  it('clamps out-of-range levels to the table ends', () => {
    expect(tzhaarKnockback(0)).toBe(AIR_KNOCKBACK * 0.5);
    expect(tzhaarKnockback(9)).toBe(AIR_KNOCKBACK * 2);
  });
});

describe('tzhaar stun from level 1', () => {
  it('stuns at every tier, scaling into the maul values', () => {
    expect(tzhaarStun(1)).toBeCloseTo(0.3);
    expect(tzhaarStun(2)).toBeCloseTo(0.45);
    expect(tzhaarStun(3)).toBeCloseTo(0.6);
    expect(tzhaarStun(4)).toBeCloseTo(0.6);
  });
  it('clamps out-of-range levels like tzhaarKnockback', () => {
    expect(tzhaarStun(0)).toBeCloseTo(0.3);
    expect(tzhaarStun(9)).toBeCloseTo(0.6);
  });
});

describe('utility support spells', () => {
  it('offers the three support fields', () => {
    expect(SUPPORT_ORDER).toEqual(['curse', 'enfeeble', 'sanctity']);
    for (const id of SUPPORT_ORDER) expect(SUPPORT_SPELLS[id]).toBeDefined();
  });
  it('labels sanctity as the Prayer Ward (drain reducer, no field)', () => {
    expect(SUPPORT_SPELLS.sanctity.label).toBe('Prayer Ward');
  });
});

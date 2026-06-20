import { describe, it, expect } from 'vitest';
import { weaknessMultiplier, WEAKNESS_BONUS, ELEMENTS, ANCIENTS, lifestealChance, bloodBonusFrac, sanctityRate, SUPPORT_SPELLS, SUPPORT_ORDER, ancientHit, ANCIENT_HITS, elementalSpellName, ancientSpellName, spellSpriteName } from './magic';

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

describe('bloodBonusFrac', () => {
  it('is (3 + 0.5·level)% of max HP', () => {
    expect(bloodBonusFrac(1)).toBeCloseTo(0.035);
    expect(bloodBonusFrac(4)).toBeCloseTo(0.05);
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

describe('utility support spells', () => {
  it('offers the three support fields', () => {
    expect(SUPPORT_ORDER).toEqual(['curse', 'enfeeble', 'sanctity']);
    for (const id of SUPPORT_ORDER) expect(SUPPORT_SPELLS[id]).toBeDefined();
  });
  it('scales Prayer-Restoration regen with the wave (~wave/20 per tick)', () => {
    expect(sanctityRate(20)).toBeCloseTo(1 / 0.6); // wave 20 → 1/tick
    expect(sanctityRate(60)).toBeCloseTo(3 / 0.6); // wave 60 → 3/tick
  });
});

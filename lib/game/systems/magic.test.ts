import { describe, it, expect } from 'vitest';
import { weaknessMultiplier, WEAKNESS_BONUS, ELEMENTS, ANCIENTS, lifestealChance, sanctityRate, SUPPORT_SPELLS, SUPPORT_ORDER } from './magic';

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

describe('utility support spells', () => {
  it('offers the three support fields', () => {
    expect(SUPPORT_ORDER).toEqual(['curse', 'enfeeble', 'sanctity']);
    for (const id of SUPPORT_ORDER) expect(SUPPORT_SPELLS[id]).toBeDefined();
  });
  it('scales Sanctity prayer restore with tower level', () => {
    expect(sanctityRate(1)).toBeCloseTo(2);
    expect(sanctityRate(4)).toBeCloseTo(3.5);
  });
});

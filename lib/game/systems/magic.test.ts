import { describe, it, expect } from 'vitest';
import { weaknessMultiplier, WEAKNESS_BONUS, ELEMENTS, ANCIENTS } from './magic';

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
  it('maps each element to its on-hit effect', () => {
    expect(ELEMENTS.air.effect).toBeUndefined(); // pure damage
    expect(ELEMENTS.water.effect).toBe('slow');
    expect(ELEMENTS.earth.effect).toBe('stun');
    expect(ELEMENTS.fire.effect).toBe('burn');
  });
  it('marks only Blood as life-stealing', () => {
    expect(ANCIENTS.blood.lifesteal).toBe(true);
    expect(ANCIENTS.ice.lifesteal).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import {
  COMBAT_STYLES,
  applyStyleBoost,
  identityStyleMods,
  multiplyStyleMods,
  scaleAllStyles,
} from './style-mods';

const all = (n: number) => ({ melee: n, ranged: n, magic: n });

describe('the style mods', () => {
  it('starts at ×1 everywhere', () => {
    expect(identityStyleMods()).toEqual({ damage: all(1), range: all(1), fireRate: all(1) });
  });

  it('hands out a fresh set every time', () => {
    // The accumulators mutate, so a shared object would leak one wave's potions
    // into the next.
    const a = identityStyleMods();
    a.damage.melee = 2;
    expect(identityStyleMods().damage.melee).toBe(1);
  });

  it('names all three styles, and only those', () => {
    expect([...COMBAT_STYLES]).toEqual(['melee', 'ranged', 'magic']);
  });
});

describe('folding a boost in', () => {
  it('reaches every style when the boost names none', () => {
    const mods = applyStyleBoost(identityStyleMods(), { damage: 0.15 });
    expect(mods.damage).toEqual(all(1.15));
    expect(mods.range).toEqual(all(1));
  });

  it('reaches one style when the boost names one', () => {
    const mods = applyStyleBoost(identityStyleMods(), { style: 'ranged', damage: 0.4 });
    expect(mods.damage.ranged).toBeCloseTo(1.4);
    expect(mods.damage.melee).toBe(1);
    expect(mods.damage.magic).toBe(1);
  });

  it('moves every stat a boost carries', () => {
    const mods = applyStyleBoost(identityStyleMods(), {
      style: 'magic', damage: 0.45, range: 0.2, fireRate: 0.1,
    });
    expect(mods.damage.magic).toBeCloseTo(1.45);
    expect(mods.range.magic).toBeCloseTo(1.2);
    expect(mods.fireRate.magic).toBeCloseTo(1.1);
  });

  it('stacks a pouch through one accumulator', () => {
    const mods = identityStyleMods();
    applyStyleBoost(mods, { damage: 0.15 });
    applyStyleBoost(mods, { style: 'melee', damage: 0.4 });
    expect(mods.damage.melee).toBeCloseTo(1.15 * 1.4);
    expect(mods.damage.ranged).toBeCloseTo(1.15);
  });

  it('leaves everything alone for an empty boost', () => {
    expect(applyStyleBoost(identityStyleMods(), {})).toEqual(identityStyleMods());
    expect(applyStyleBoost(identityStyleMods(), { damage: 0 })).toEqual(identityStyleMods());
  });
});

describe('the board-wide layers', () => {
  it('scales one stat across every style', () => {
    const mods = scaleAllStyles(identityStyleMods(), 'damage', 0.92);
    expect(mods.damage).toEqual(all(0.92));
    expect(mods.range).toEqual(all(1));
  });

  it('scales on top of what a boost already wrote', () => {
    const mods = applyStyleBoost(identityStyleMods(), { style: 'melee', damage: 0.6 });
    scaleAllStyles(mods, 'damage', 0.92);
    expect(mods.damage.melee).toBeCloseTo(1.6 * 0.92);
    expect(mods.damage.ranged).toBeCloseTo(0.92);
  });

  it('stacks two sets into a third, leaving both alone', () => {
    const herbs = applyStyleBoost(identityStyleMods(), { style: 'melee', damage: 0.4 });
    const potions = applyStyleBoost(identityStyleMods(), { damage: 0.15 });
    const both = multiplyStyleMods(herbs, potions);
    expect(both.damage.melee).toBeCloseTo(1.4 * 1.15);
    expect(both.damage.magic).toBeCloseTo(1.15);
    expect(herbs.damage.magic).toBe(1);
    expect(potions.damage.melee).toBeCloseTo(1.15);
  });

  it('is identity against a fresh set', () => {
    const one = applyStyleBoost(identityStyleMods(), { style: 'ranged', range: 0.3 });
    expect(multiplyStyleMods(one, identityStyleMods())).toEqual(one);
  });
});

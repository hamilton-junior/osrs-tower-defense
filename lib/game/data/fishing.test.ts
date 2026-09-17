import { describe, it, expect } from 'vitest';
import { FISH, FISH_BY_ID, CATCH_CHANCE_BASE, CATCH_CHANCE_MAX } from './fishing';
import { isCracked, FOOD_BY_ID } from './food';
import type { LiquidKind } from '../systems/terrain-generation';

/** One liquid's ladder, in table order — the shape every rule below is about. */
const ladder = (liquid: LiquidKind) => FISH.filter(f => f.liquid === liquid);

describe('the fish ladder', () => {
  it('climbs by level, and every rung is a real OSRS Fishing level', () => {
    expect(ladder('water').map(f => f.level)).toEqual([1, 20, 40, 76, 81]);
    expect(ladder('lava').map(f => f.level)).toEqual([53, 80]);
    for (const liquid of ['water', 'lava'] as const) {
      const rungs = ladder(liquid);
      for (let i = 1; i < rungs.length; i++) {
        expect(rungs[i].level, rungs[i].id).toBeGreaterThan(rungs[i - 1].level);
      }
    }
  });

  it('heals one life more on every rung of the water ladder', () => {
    expect(ladder('water').map(f => f.lives)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gets rarer as it climbs, inside its own liquid', () => {
    for (const liquid of ['water', 'lava'] as const) {
      const rungs = ladder(liquid);
      for (let i = 1; i < rungs.length; i++) {
        expect(rungs[i].weight, rungs[i].id).toBeLessThan(rungs[i - 1].weight);
      }
    }
  });

  it('indexes every fish by its own id', () => {
    for (const f of FISH) expect(FISH_BY_ID[f.id]).toBe(f);
  });

  it('keeps the catch chance a probability', () => {
    expect(CATCH_CHANCE_BASE).toBeGreaterThan(0);
    expect(CATCH_CHANCE_MAX).toBeLessThan(1);
    expect(CATCH_CHANCE_MAX).toBeGreaterThan(CATCH_CHANCE_BASE);
  });
});

describe('lava is its own water', () => {
  it('pens the infernal eel into TzHaar and leaves the rest region-free', () => {
    expect(FISH_BY_ID.infernal_eel.biome).toBe('tzhaar');
    for (const f of FISH) {
      if (f.id !== 'infernal_eel') expect(f.biome, f.id).toBeUndefined();
    }
  });

  it('cracks exactly one catch, and that one is never food', () => {
    const cracked = FISH.filter(f => f.essence !== undefined);
    expect(cracked.map(f => f.id)).toEqual(['infernal_eel']);
    expect(cracked[0].lives).toBe(0);
    expect(cracked[0].gold).toBe(0);
    expect(cracked[0].essence!.min).toBeLessThanOrEqual(cracked[0].essence!.max);
  });

  it('agrees with the food table about what is cracked', () => {
    expect(isCracked(FOOD_BY_ID.infernal_eel)).toBe(true);
    expect(isCracked(FOOD_BY_ID.lava_eel)).toBe(false);
    expect(isCracked(FOOD_BY_ID.kebab)).toBe(false);
  });
});

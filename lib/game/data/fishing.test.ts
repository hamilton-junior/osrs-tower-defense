import { describe, it, expect } from 'vitest';
import { FISH, FISH_BY_ID, CATCH_CHANCE_BASE, CATCH_CHANCE_MAX } from './fishing';

describe('the fish ladder', () => {
  it('climbs by level, and every rung is a real OSRS Fishing level', () => {
    expect(FISH.map(f => f.level)).toEqual([1, 20, 40, 76, 81]);
    for (let i = 1; i < FISH.length; i++) {
      expect(FISH[i].level, FISH[i].id).toBeGreaterThan(FISH[i - 1].level);
    }
  });

  it('heals one life more on every rung', () => {
    expect(FISH.map(f => f.lives)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gets rarer as it climbs', () => {
    for (let i = 1; i < FISH.length; i++) {
      expect(FISH[i].weight, FISH[i].id).toBeLessThan(FISH[i - 1].weight);
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

import { describe, it, expect } from 'vitest';
import { enemyLeakCost } from './leak-cost';
import { BOSS_LEAK_BASE, BOSS_LEAK_MAX, SUPERIOR_LEAK_COST } from './affixes';
import { guardianLeakCost } from './boss-mechanics';

describe('enemyLeakCost', () => {
  it('charges an ordinary monster one life, and a Colossal two', () => {
    expect(enemyLeakCost({ type: 'goblin' })).toBe(1);
    expect(enemyLeakCost({ type: 'goblin', affixes: ['hasted'] })).toBe(1);
    expect(enemyLeakCost({ type: 'goblin', affixes: ['colossal'] })).toBe(2);
  });

  it('charges an elite the superior rate', () => {
    expect(enemyLeakCost({ type: 'superior_bloodveld' })).toBe(SUPERIOR_LEAK_COST);
  });

  it('ramps a boss with its sightings, up to the cap', () => {
    // `sightings` counts this appearance, so a first-timer costs exactly the base.
    expect(enemyLeakCost({ type: 'vorkath', isBoss: true, sightings: 1 })).toBe(BOSS_LEAK_BASE);
    expect(enemyLeakCost({ type: 'vorkath', isBoss: true, sightings: 3 })).toBe(BOSS_LEAK_BASE + 2);
    expect(enemyLeakCost({ type: 'vorkath', isBoss: true, sightings: 99 })).toBe(BOSS_LEAK_MAX);
    // No tally yet reads as a first sighting rather than blowing up.
    expect(enemyLeakCost({ type: 'vorkath', isBoss: true })).toBe(BOSS_LEAK_BASE);
  });

  it('discounts each Grotesque Guardian — but the pair still out-costs one boss', () => {
    const solo = enemyLeakCost({ type: 'vorkath', isBoss: true, sightings: 3 });
    const dusk = enemyLeakCost({ type: 'dusk', isBoss: true, sightings: 3 });
    expect(dusk).toBe(guardianLeakCost(solo));
    expect(dusk).toBeLessThan(solo);
    expect(enemyLeakCost({ type: 'dawn', isBoss: true, sightings: 3 })).toBe(dusk);
    expect(dusk * 2).toBeGreaterThan(solo);
  });

  it('a boss always costs more than an elite, which costs more than a monster', () => {
    expect(enemyLeakCost({ type: 'dusk', isBoss: true, sightings: 1 }))
      .toBeGreaterThan(enemyLeakCost({ type: 'superior_gargoyle' }));
    expect(enemyLeakCost({ type: 'superior_gargoyle' }))
      .toBeGreaterThan(enemyLeakCost({ type: 'rat', affixes: ['colossal'] }));
  });
});

import { describe, it, expect } from 'vitest';
import { rollItemDrops } from './loot';
import { WEAPON_DROP_TIERS, RUNE_DROPS } from '../data/drops';

// rng yielding a fixed queue, then 1 (which fails every gate).
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++] ?? 1;
};

describe('rollItemDrops', () => {
  it('drops nothing when every gate fails', () => {
    expect(rollItemDrops({ wave: 10, hasTeakShelves: false }, () => 0.99)).toEqual([]);
  });

  it('rolls all five drops when every gate passes', () => {
    // 10 zeros: gate+selection for each of the 5 tables (every gate passes at 0).
    const drops = rollItemDrops({ wave: 3, hasTeakShelves: false }, seq(...new Array(10).fill(0)));
    expect(drops).toHaveLength(5);
    expect(drops[0]).toBe(WEAPON_DROP_TIERS[0]);
    expect(drops[1]).toBe(RUNE_DROPS[0]);
  });

  it('caps the weapon tier by wave', () => {
    // wave 3 -> maxTier = min(8, 1) = 1; selection rng 0.99 -> index 1.
    const drops = rollItemDrops({ wave: 3, hasTeakShelves: false }, seq(0, 0.99));
    expect(drops[0]).toBe(WEAPON_DROP_TIERS[1]);
  });

  it('teak shelves widen the drop gates', () => {
    // Weapon gate fails first (0.5), then a rune gate of 0.105:
    //   no teak: 0.105 < 0.10  -> false (no rune); remaining gates fail (fallback 1)
    //   teak:    0.105 < 0.11  -> true  (rune drops; selection rng 0 -> first rune)
    const noTeak = rollItemDrops({ wave: 1, hasTeakShelves: false }, seq(0.5, 0.105));
    expect(noTeak).toHaveLength(0);

    const teak = rollItemDrops({ wave: 1, hasTeakShelves: true }, seq(0.5, 0.105, 0));
    expect(teak).toEqual([RUNE_DROPS[0]]);
  });
});

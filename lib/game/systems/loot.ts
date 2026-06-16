import type { LootDrop } from '../data/drops';
import {
  WEAPON_DROP_TIERS,
  RUNE_DROPS,
  SEED_DROPS,
  FARMING_SUPPLY_DROPS,
  CONSTRUCTION_SUPPLY_DROPS,
} from '../data/drops';

export interface ItemDropContext {
  /** Current wave — caps the weapon tier that can roll. */
  wave: number;
  /** POH `teak_shelves` upgrade multiplies every drop chance by 1.1. */
  hasTeakShelves: boolean;
}

/**
 * Roll an enemy's independent item/resource drops (weapon, runes, seeds,
 * farming & construction supplies) and return the ones that landed. Pure: the
 * engine spawns the returned drops as loot. `rng` is consumed in table order
 * — a gate roll per table, then a selection roll when the gate passes — so the
 * sequence matches the original inline logic exactly.
 */
export function rollItemDrops(ctx: ItemDropContext, rng: () => number = Math.random): LootDrop[] {
  const drops: LootDrop[] = [];
  const teak = ctx.hasTeakShelves ? 1.1 : 1;
  const pick = (table: LootDrop[]) => table[Math.floor(rng() * table.length)];

  // Weapon drop — rare, and the tier is capped by wave.
  if (rng() < 0.02 * teak) {
    const maxTier = Math.min(WEAPON_DROP_TIERS.length - 1, Math.floor(ctx.wave / 3));
    drops.push(WEAPON_DROP_TIERS[Math.floor(rng() * (maxTier + 1))]);
  }
  if (rng() < 0.1 * teak) drops.push(pick(RUNE_DROPS));
  if (rng() < 0.05 * teak) drops.push(pick(SEED_DROPS));
  if (rng() < 0.03 * teak) drops.push(pick(FARMING_SUPPLY_DROPS));
  if (rng() < 0.05 * teak) drops.push(pick(CONSTRUCTION_SUPPLY_DROPS));

  return drops;
}

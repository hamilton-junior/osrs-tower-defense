/**
 * **Style mods** — the shape a herb or a potion hands to the combat maths.
 *
 * OSRS potions are style-targeted: a Ranging potion does nothing for a staff, and a
 * Super strength does nothing for a bow. Farming and Herblore used to hand the
 * engine three flat numbers that hit every tower on the board, so a Zamorak brew
 * buffed the wizards and the Dwarf Cannon along with the melee. This is the type
 * that fixes that: one multiplier per stat *per style*, so a boost can name the
 * style it belongs to and the rest of the board ignores it.
 *
 * A boost that names no style writes the same number into all three, which is how
 * Overload and the raw Guam still reach everything.
 *
 * The layer applies inside `calculateTowerStats`'s `boostable` guard, so the Dwarf
 * Cannon keeps its OSRS deal: no potion helps it, and no brew debuff hurts it.
 */

import type { CombatStyle } from '../types';

export const COMBAT_STYLES: readonly CombatStyle[] = ['melee', 'ranged', 'magic'];

/** A multiplier per combat style, for each stat a consumable can move. */
export interface StyleMods {
  damage: Record<CombatStyle, number>;
  range: Record<CombatStyle, number>;
  fireRate: Record<CombatStyle, number>;
}

/** One boost, the way a herb or a potion writes it down. `style` narrows it to a
 *  single style; leave it out and every boostable tower takes it. */
export interface StyleBoost {
  style?: CombatStyle;
  damage?: number;
  range?: number;
  fireRate?: number;
}

const ones = (): Record<CombatStyle, number> => ({ melee: 1, ranged: 1, magic: 1 });

/** Nothing running: every style at ×1 on every stat. */
export function identityStyleMods(): StyleMods {
  return { damage: ones(), range: ones(), fireRate: ones() };
}

/** Folds one boost into `mods` and hands it back, so a caller can chain a whole
 *  pouch through a single accumulator. Mutates. */
export function applyStyleBoost(mods: StyleMods, boost: StyleBoost): StyleMods {
  const styles = boost.style ? [boost.style] : COMBAT_STYLES;
  for (const s of styles) {
    if (boost.damage) mods.damage[s] *= 1 + boost.damage;
    if (boost.range) mods.range[s] *= 1 + boost.range;
    if (boost.fireRate) mods.fireRate[s] *= 1 + boost.fireRate;
  }
  return mods;
}

/** Multiplies one stat across every style — a board-wide layer that still only
 *  reaches boostable towers. Mutates. */
export function scaleAllStyles(mods: StyleMods, stat: keyof StyleMods, factor: number): StyleMods {
  for (const s of COMBAT_STYLES) mods[stat][s] *= factor;
  return mods;
}

/** Two sets of mods stacked, as a new set. */
export function multiplyStyleMods(a: StyleMods, b: StyleMods): StyleMods {
  const out = identityStyleMods();
  for (const s of COMBAT_STYLES) {
    out.damage[s] = a.damage[s] * b.damage[s];
    out.range[s] = a.range[s] * b.range[s];
    out.fireRate[s] = a.fireRate[s] * b.fireRate[s];
  }
  return out;
}

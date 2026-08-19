import type { ActivePotion, CombatStyle } from '../types';

/**
 * A Grand Exchange offer. `buff` potions push a timed {@link ActivePotion} into
 * the tower-combat pipeline (their `id` is an `ActivePotion['type']`); `prayer`
 * potions instantly restore `restore` prayer points instead.
 *
 * Buff potions target a combat **style**, not a tower — so a Ranging potion
 * boosts every `ranged` weapon. `style` undefined means it boosts all styles
 * (e.g. Overload). The bonus fractions (`dmg`/`range`/`speed`) are what
 * `calculateTowerStats` applies, so retuning a potion is a data-only change.
 */
export interface GeOffer {
  id: ActivePotion['type'];
  name: string;
  desc: string;
  /** Baseline gp price; the live price drifts around this with demand. */
  baseCost: number;
  kind: 'buff' | 'prayer';
  /** Wiki image filename (no extension) used for the shop icon. */
  wiki: string;
  /** Prayer points restored — `prayer` offers only. */
  restore?: number;
  /** Combat style this buff boosts; undefined = every style — `buff` only. */
  style?: CombatStyle;
  /** Damage bonus fraction (0.15 = +15%) — `buff` only. */
  dmg?: number;
  /** Range bonus fraction — `buff` only. */
  range?: number;
  /** Attack-speed bonus fraction — `buff` only. */
  speed?: number;
}

/**
 * The MVP Grand Exchange stock: the consumables that actually do something in
 * the new core. Combat potions buff a tower style (read by
 * `calculateTowerStats`); prayer potions top up the prayer pool. Ores/herbs/
 * seeds are omitted until their skills are reintroduced.
 */
export const GE_OFFERS: GeOffer[] = [
  { id: 'ranging', name: 'Ranging Potion', desc: 'Ranged towers +15% damage & +10% range', baseCost: 100, kind: 'buff', wiki: 'Ranging_potion(4)', style: 'ranged', dmg: 0.15, range: 0.10 },
  { id: 'magic', name: 'Magic Potion', desc: 'Magic towers +20% damage', baseCost: 150, kind: 'buff', wiki: 'Magic_potion(4)', style: 'magic', dmg: 0.20 },
  { id: 'super_combat', name: 'Super Combat', desc: 'Melee towers +15% damage', baseCost: 200, kind: 'buff', wiki: 'Super_combat_potion(4)', style: 'melee', dmg: 0.15 },
  { id: 'overload', name: 'Overload', desc: 'All towers +15% damage, +10% range & speed', baseCost: 500, kind: 'buff', wiki: 'Overload_(4)', dmg: 0.15, range: 0.10, speed: 0.10 },
  { id: 'prayer_potion', name: 'Prayer Potion', desc: 'Restore 25 Prayer points', baseCost: 50, kind: 'prayer', wiki: 'Prayer_potion(4)', restore: 25 },
  { id: 'super_restore', name: 'Super Restore', desc: 'Restore 50 Prayer points', baseCost: 100, kind: 'prayer', wiki: 'Super_restore(4)', restore: 50 },
];

/** Seconds of simulated time a combat-potion buff lasts. */
export const GE_POTION_DURATION = 45;

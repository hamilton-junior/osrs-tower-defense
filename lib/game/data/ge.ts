import type { ActivePotion } from '../types';

/**
 * A Grand Exchange offer. `buff` potions push a timed {@link ActivePotion} into
 * the tower-combat pipeline (their `id` is an `ActivePotion['type']`); `prayer`
 * potions instantly restore `restore` prayer points instead.
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
}

/**
 * The MVP Grand Exchange stock: the consumables that actually do something in
 * the new core. Combat potions buff the matching tower style (read by
 * `calculateTowerStats`); prayer potions top up the prayer pool. Ores/herbs/
 * seeds from the legacy shop are omitted until their skills are reintroduced.
 */
export const GE_OFFERS: GeOffer[] = [
  { id: 'ranging', name: 'Ranging Potion', desc: 'Archers +15% damage & +10% range', baseCost: 100, kind: 'buff', wiki: 'Ranging_potion(4)' },
  { id: 'magic', name: 'Magic Potion', desc: 'Wizards +20% damage', baseCost: 150, kind: 'buff', wiki: 'Magic_potion(4)' },
  { id: 'super_combat', name: 'Super Combat', desc: 'TzHaar +15% damage', baseCost: 200, kind: 'buff', wiki: 'Super_combat_potion(4)' },
  { id: 'overload', name: 'Overload', desc: 'All towers +15% damage, +10% range & speed', baseCost: 500, kind: 'buff', wiki: 'Overload_(4)' },
  { id: 'prayer_potion', name: 'Prayer Potion', desc: 'Restore 25 Prayer points', baseCost: 50, kind: 'prayer', wiki: 'Prayer_potion(4)', restore: 25 },
  { id: 'super_restore', name: 'Super Restore', desc: 'Restore 50 Prayer points', baseCost: 100, kind: 'prayer', wiki: 'Super_restore(4)', restore: 50 },
];

/** Seconds of simulated time a combat-potion buff lasts. */
export const GE_POTION_DURATION = 45;

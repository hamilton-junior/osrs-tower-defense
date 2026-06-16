import type { PrayerType, PrayerDef } from '../types';

/**
 * Prayer-point drain per second for the currently active prayers.
 *
 * Sums each active prayer's base `drain`, scaled down by the player's
 * `prayerEfficiency` upgrade and Prayer level (1% cheaper per level above 1).
 * Multiply by `dt` to get the points drained this frame.
 */
export function prayerDrainRate(
  activePrayers: ReadonlySet<PrayerType>,
  allPrayers: PrayerDef[],
  prayerEfficiency: number,
  prayerLevel: number,
): number {
  let totalDrain = 0;
  for (const id of activePrayers) {
    const def = allPrayers.find(p => p.id === id);
    if (def) totalDrain += def.drain;
  }
  return (totalDrain / 10) * (prayerEfficiency || 1) * (1 - (prayerLevel - 1) * 0.01);
}

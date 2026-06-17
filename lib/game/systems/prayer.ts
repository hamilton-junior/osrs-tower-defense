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

/**
 * First wave at which a prayer (by its level requirement) becomes available,
 * using the wave count as a Prayer-level proxy (the new core has no skills
 * yet). Tier-1 prayers come online in the first waves; the strongest
 * (Piety/Rigour/Augury) unlock around wave 18–20. Single source of truth for
 * both the gate and the UI's "unlocks at wave N" preview.
 */
export function prayerUnlockWave(prayerLevel: number): number {
  return Math.max(1, Math.ceil((prayerLevel - 4) / 4) + 1);
}

/** Whether a prayer is unlocked at the given wave. */
export function isPrayerUnlocked(prayerLevel: number, wave: number): boolean {
  return wave >= prayerUnlockWave(prayerLevel);
}

/** Prayer-point pool size at the given wave: starts at 10, +15 every 3 waves,
 *  capped at 99 (OSRS max). The pool scales like a rising Prayer level so the
 *  strong prayers become sustainable around the time they unlock. */
export function prayerMaxForWave(wave: number): number {
  return Math.min(99, 10 + Math.floor((wave - 1) / 3) * 15);
}

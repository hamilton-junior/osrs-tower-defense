/**
 * Gold economy, decoupled from the wave-budget `reward` weight. Payouts scale
 * with wave difficulty: a kill pays a fraction of the enemy's (already
 * wave-scaled) HP, and clearing a wave grants a bonus that grows with the wave.
 * Tuned so a player who clears waves cleanly can keep funding towers/upgrades.
 */

/** Gold per point of (wave-scaled) max HP awarded on a kill. */
export const GOLD_PER_HP = 0.4;

/** Per-kill gold from an enemy's wave-scaled max HP. */
export function goldForKill(scaledHp: number): number {
  return Math.max(2, Math.round(scaledHp * GOLD_PER_HP) + 1);
}

/** Gold granted for clearing a wave, growing with wave difficulty. */
export function waveClearBonus(wave: number): number {
  return 20 + wave * 10;
}

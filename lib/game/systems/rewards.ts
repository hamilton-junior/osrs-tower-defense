/**
 * Gold economy, decoupled from the wave-budget `reward` weight. Payouts scale
 * with wave difficulty: a kill pays a fraction of the enemy's (already
 * wave-scaled) HP, and clearing a wave grants a bonus that grows with the wave.
 * Tuned so a player who clears waves cleanly can keep funding towers/upgrades.
 */

/** Gold per point of (wave-scaled) max HP awarded on a kill. */
export const GOLD_PER_HP = 0.4;

/**
 * Late-game gold damp. Enemy HP scales ~linearly with the wave, and per-kill
 * gold is HP-based, so unchecked the player drowns in cash past ~wave 15. Gold
 * is untouched through wave 12, then each kill pays progressively less per HP.
 */
export function goldLateGameDamp(wave: number): number {
  return wave <= 12 ? 1 : 1 / (1 + (wave - 12) * 0.08);
}

/** Per-kill gold from an enemy's wave-scaled max HP (damped late-game). */
export function goldForKill(scaledHp: number, wave = 1): number {
  const base = Math.round(scaledHp * GOLD_PER_HP) + 1;
  return Math.max(2, Math.round(base * goldLateGameDamp(wave)));
}

/** Gold granted for clearing a wave, growing with wave difficulty (damped late). */
export function waveClearBonus(wave: number): number {
  return Math.round((20 + wave * 10) * goldLateGameDamp(wave));
}

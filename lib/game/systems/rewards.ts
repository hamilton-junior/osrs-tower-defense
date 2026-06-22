/**
 * Gold economy, decoupled from the wave-budget `reward` weight. Per-kill gold is
 * FIXED per monster type — a flat function of the enemy's BASE (unscaled) HP,
 * independent of the wave — so a tougher monster pays more, but the same monster
 * always pays the same however late it shows up. This stops the late-game cash
 * flood that HP-scaled payouts produced past ~wave 25. Clearing a wave still
 * grants a completion bonus that grows with the wave (damped late-game).
 */

/** Gold per point of an enemy's BASE (unscaled) max HP, awarded on a kill. */
export const GOLD_PER_HP = 0.4;

/**
 * Late-game damp for the wave-clear bonus: untouched through wave 12, then it
 * grows more slowly so a long run doesn't snowball on completion bonuses.
 */
export function goldLateGameDamp(wave: number): number {
  return wave <= 12 ? 1 : 1 / (1 + (wave - 12) * 0.08);
}

/** Fixed per-kill gold from an enemy's BASE max HP — no wave scaling. */
export function goldForKill(baseHp: number): number {
  return Math.max(2, Math.round(baseHp * GOLD_PER_HP) + 1);
}

/** Gold granted for clearing a wave, growing with wave difficulty (damped late). */
export function waveClearBonus(wave: number): number {
  return Math.round((20 + wave * 10) * goldLateGameDamp(wave));
}

/**
 * Per-tower "personality" maths — the signature mechanic that gives each
 * non-wizard tower a niche the wizard can't fill. Pure and unit-tested so the
 * engine just calls in. The design goal (see the niche table in the engine's
 * firing block): every tower must beat the wizard at *something*, because the
 * Elemental spellbook already owns single-target burst and Ancients owns AoE.
 *
 *  - Archer  → volume DPS: fast cadence + a Dark Bow twin-shot (light cleave),
 *              with only a modest anti-tank nudge so it doesn't become the
 *              boss-killer (that's the Slayer / Toxic niche).
 *  - Cannon  → full-damage splash (no Ancients falloff) over a growing radius.
 *  - Slayer  → bonus vs a monster *category* (task / superior / boss).
 *  - Toxic   → venom: a damage-over-time that ramps the longer it's reapplied.
 */

/** Arrows loosed per attack. The Dark Bow (tier 3+) looses two. */
export function archerArrowCount(level: number): number {
  return level >= 3 ? 2 : 1;
}

/**
 * Modest anti-tank scaling for the tier-4 bow (Bow of Faerdhinen / twisted-bow
 * flavour): the wizard's damage is fixed, so the bow gets a *small* edge vs
 * beefy targets. Capped at +20% so it stays a nudge, not the Slayer's job.
 * 0% at ≤40 max HP, ramping linearly to +20% at ≥400 max HP.
 */
export function bowAntiTankMult(maxHp: number): number {
  const t = Math.max(0, Math.min(1, (maxHp - 40) / 360));
  return 1 + 0.2 * t;
}

/**
 * Cannon splash radius by tier (logic px). Grows so the late cannon clearly
 * out-zones the Ancients barrage's fixed 80px blast — the cannon's whole point
 * is raw crowd-clear. 70 → 84 → 98 → 112.
 */
export function cannonBlastRadius(level: number): number {
  return 70 + (level - 1) * 14;
}

/**
 * Slayer weapon's native damage multiplier vs an enemy, keyed off its *category*
 * (independent of the Slayer Helmet, which stacks on top). The best applicable
 * bonus wins (they don't multiply): the current task target, then superiors,
 * then bosses. 1.0 against anything else.
 */
export function slayerWeaponBonus(enemyType: string, taskType: string | null, isBoss: boolean): number {
  let best = 1;
  if (taskType && enemyType === taskType) best = Math.max(best, 1.5);
  if (enemyType.startsWith('superior_')) best = Math.max(best, 1.3);
  if (isBoss) best = Math.max(best, 1.25);
  return best;
}

/**
 * Venom ramp parameters derived from a single toxic hit's damage. Each reapply
 * adds `step` to the poison's damage-per-second up to `cap`, so sustained fire
 * makes the venom hurt more — the toxic tower's niche is a DoT that *climbs*,
 * unlike the wizard's flat burn/poison. `dur` keeps it ticking after the enemy
 * leaves range (set-and-forget chip damage).
 */
export function venomRamp(hitDamage: number): { step: number; cap: number; dur: number } {
  const step = Math.max(2, Math.floor(hitDamage * 0.15));
  return { step, cap: Math.max(step, Math.floor(hitDamage * 0.6)), dur: 4 };
}

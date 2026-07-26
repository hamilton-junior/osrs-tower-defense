/**
 * The asymptotic ceiling on the *stacked card damage multiplier* per combat style.
 * A tuning knob (numbers are the user's to tune) — retune here, in one place.
 */
export const DAMAGE_MULT_CEILING = 8;

/**
 * Ceilings for the stacked card **fire-rate** and **range** multipliers, mirroring
 * {@link DAMAGE_MULT_CEILING}. Tighter than the damage cap: attack-speed and range
 * reshape coverage and DPS harder than flat damage, so their runaway is capped
 * sooner. Same concave curve ({@link softCapMult}); tuning knobs, retune here.
 */
export const FIRE_RATE_MULT_CEILING = 3.5;
export const RANGE_MULT_CEILING = 2.5;

/**
 * Fold a raw stacked damage multiplier through a concave curve that approaches a
 * ceiling. Card damage folds as an unbounded product (`runMods.damage[style]`),
 * which is what let a long run's board out-scale enemy HP forever. This tapers it:
 *
 * - `raw <= 1` (no cards, or a net penalty) → returned unchanged; only the upside caps.
 * - the first units pay ≈ full value (the curve's slope at `raw = 1` is 1), so early
 *   cards still matter,
 * - and the effective multiplier rises monotonically and concavely toward `ceiling`
 *   without ever reaching it.
 *
 * Shape: `1 + (C-1)·(1 - e^{-(raw-1)/(C-1)})`. Pure.
 */
export function softCapMult(raw: number, ceiling = DAMAGE_MULT_CEILING): number {
  if (raw <= 1) return raw;
  const span = ceiling - 1;
  return 1 + span * (1 - Math.exp(-(raw - 1) / span));
}

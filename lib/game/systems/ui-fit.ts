/**
 * How large the interface may be drawn on this screen. Everything in the bar (and in
 * the compact layout's rails) is sized in `em` off `--ui-scale`, so each length it
 * needs grows in step with the scale. Given what each part needs at the current scale
 * and what it has, the largest scale that fits them all is solved at once, instead of
 * stepping down until it fits: a step-down loop only ever shrinks, so one reading
 * taken mid-relayout cost a size for good.
 */

/** One length the interface has to fit: what it needs at the current scale, and what it has. */
export interface FitConstraint {
  need: number;
  have: number;
}

/**
 * The largest scale at which every constraint fits, clamped to `[min, max]`. `scale`
 * is the scale the `need`s were measured at.
 *
 * The result keeps its measured value instead of being rounded down onto the step
 * grid: a 1920-wide row holds 107%, and flooring that to the nearest step handed the
 * player 100% with "+" greyed out, which was indistinguishable from a hard 100% cap
 * and was reported as one. It is cut to whole percent with 1e-3 to spare, so a
 * rounding sliver stays between the ceiling and the length it was solved from.
 */
export function uiScaleCeiling(scale: number, constraints: readonly FitConstraint[], min: number, max: number): number {
  let fits = Infinity;
  for (const c of constraints) {
    if (c.need > 0) fits = Math.min(fits, (c.have * scale) / c.need);
  }
  const room = Math.floor((fits - 1e-3) * 100) / 100;
  return Math.min(max, Math.max(min, room));
}

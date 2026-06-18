export const MIN_PRICE_MULTIPLIER = 0.5;
export const MAX_PRICE_MULTIPLIER = 2.0;

/**
 * Compute the next Grand Exchange price multiplier for an item based on how
 * many were sold this wave. Heavy selling pushes the price down; no sales let
 * it drift back up. `rng` is injectable so the random jitter is testable.
 */
export function nextPriceMultiplier(
  current: number,
  soldCount: number,
  rng: () => number = Math.random,
): number {
  let next = current;
  if (soldCount > 5) next -= 0.15;
  else if (soldCount > 0) next -= 0.05;
  else next += 0.1;

  next += (rng() - 0.5) * 0.1; // small random fluctuation

  return Math.max(MIN_PRICE_MULTIPLIER, Math.min(MAX_PRICE_MULTIPLIER, next));
}

/**
 * Price drift for an item the player *buys* (the Grand Exchange shop): demand
 * pushes the price up, and when nobody buys it relaxes back toward its baseline
 * (×1.0). The mirror of {@link nextPriceMultiplier}, which models selling.
 */
export function nextBuyPriceMultiplier(
  current: number,
  boughtCount: number,
  rng: () => number = Math.random,
): number {
  let next = current;
  if (boughtCount > 5) next += 0.15;
  else if (boughtCount > 0) next += 0.05;
  else next += (1 - current) * 0.2; // ease back toward baseline when idle

  next += (rng() - 0.5) * 0.1; // small random fluctuation

  return Math.max(MIN_PRICE_MULTIPLIER, Math.min(MAX_PRICE_MULTIPLIER, next));
}

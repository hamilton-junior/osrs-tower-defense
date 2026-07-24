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

/**
 * How much more each *additional* tower of the same type costs.
 *
 * Buying used to be flat, so a fifteenth archer cost exactly what the first did
 * while its fifteenth upgrade cost hundreds — which made spamming one type
 * strictly better than deepening it, and is why a long run ended as a full board
 * of tier-1 towers with nothing left to decide. Escalating the price puts a real
 * ceiling on repetition without capping it: the tenth is affordable, the
 * twentieth is a commitment.
 *
 * Deliberately per *type*, not per tower: diversifying is the way out, so a
 * second type always starts back at its base price.
 */
export const TOWER_SPAM_STEP = 0.15;

/**
 * Price of the next tower of a type, given how many of it the player already
 * owns. `base × (1 + {@link TOWER_SPAM_STEP})^owned`, rounded up.
 *
 * At +15% an archer runs 25 → 44 (5th) → 88 (10th) → 356 (20th).
 */
export function towerSpamCost(base: number, owned: number): number {
  return Math.ceil(base * Math.pow(1 + TOWER_SPAM_STEP, Math.max(0, owned)));
}

/**
 * Total for buying `count` more towers of a type on top of `owned`, since each
 * one in the batch is priced after the ones before it. A queued batch and a
 * pasted clipboard both charge the same as placing them one at a time — the
 * escalation would be trivially dodged by a batch otherwise.
 */
export function towerSpamBatchCost(base: number, owned: number, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += towerSpamCost(base, owned + i);
  return total;
}

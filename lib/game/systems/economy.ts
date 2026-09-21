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

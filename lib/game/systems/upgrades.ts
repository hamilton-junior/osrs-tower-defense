/**
 * Tower-upgrade ordering. Pure and unit-tested so the engine's batch upgrade and
 * the per-tower auto-upgrade share one rule: spend on the *cheapest* pending
 * upgrade first, so a limited purse levels as many towers as it can rather than
 * blowing the whole budget on the priciest one at the front of the list.
 */

/** The slice of a tower the ordering cares about. */
export interface UpgradeCandidate {
  id: string;
  level: number;
  maxLevel: number;
  upgradeCost: number;
}

/**
 * Ids of the upgradeable towers, cheapest upgrade first. Maxed towers are
 * dropped. Ties break by original position (placement / selection order) so the
 * result is stable and predictable rather than dependent on sort internals.
 */
export function upgradeOrder(towers: readonly UpgradeCandidate[]): string[] {
  return towers
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.level < t.maxLevel)
    .sort((a, b) => a.t.upgradeCost - b.t.upgradeCost || a.i - b.i)
    .map(({ t }) => t.id);
}

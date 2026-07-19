import { leakLifeCost, bossLeakCost, SUPERIOR_LEAK_COST, type EnemyAffix } from './affixes';
import { guardianLeakCost, isGuardian, type BossId } from './boss-mechanics';

/**
 * What one leak costs, in lives.
 *
 * The rule was spread across three modules and only ever evaluated at the moment an
 * enemy walked off the road — so the player watched their life total drop by five and
 * had no way to learn *why*. Players filed that as a bug about bosses. Gathering it
 * here gives the UI the same number the engine will charge, before it charges it.
 *
 * The tiers: a boss costs {@link bossLeakCost} (base, plus one per previous appearance),
 * discounted for a Grotesque Guardian since each twin is only half a boss; an
 * elite/superior costs {@link SUPERIOR_LEAK_COST}; anything else costs
 * {@link leakLifeCost} — one life, two for a Colossal.
 */
export interface LeakCostTarget {
  /** Enemy type id — `superior_*` names the elite tier, and names the Guardians. */
  type: string;
  isBoss?: boolean;
  affixes?: readonly EnemyAffix[];
  /** Times this boss type has shown up, **counting this appearance** (the engine's
   *  `bossesSeen` tally). Ignored for non-bosses; defaults to a first sighting. */
  sightings?: number;
}

export function enemyLeakCost(t: LeakCostTarget): number {
  if (t.isBoss) {
    const base = bossLeakCost((t.sightings ?? 1) - 1);
    return isGuardian(t.type as BossId) ? guardianLeakCost(base) : base;
  }
  if (t.type.startsWith('superior_')) return SUPERIOR_LEAK_COST;
  return leakLifeCost(t.affixes ?? []);
}

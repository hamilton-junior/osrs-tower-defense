/**
 * Crowd-control resistance ("tenacity"), 0..1. Shortens how long non-damaging
 * debuffs (slow, stun, vulnerability, knockback) last on an enemy — DoT damage
 * (burn/poison) ignores it. Keeps stun/slow spam (e.g. Shadow barrage) from
 * perma-locking the field.
 *
 * One wave curve (wave/2 percent) with a per-tier base floor and cap:
 *  - Normal monsters: no base, scale wave/2 % up to 50%.
 *  - Superior monsters: start at 50%, scale up to 75%.
 *  - Bosses: start at 50%, scale up to 90% — resistant from the first hit so
 *    early CC can't fully lock them, still climbing into the late game.
 *
 * `bonus` is the stall-breaker's escalation (see `boss-mechanics`), and it is the only
 * thing that can push a boss to outright CC immunity. It only ever fires on a boss that
 * is taking no damage, which is exactly the fight where control has stopped being a way
 * to buy time and become a way to make the fight never end.
 */
export function debuffTenacity(opts: {
  isBoss?: boolean;
  superior?: boolean;
  wave: number;
  /** Non-damaging debuffs this enemy has absorbed. Tracked but not currently priced in —
   *  the stall-breaker handles the case this was once meant to (see `bonus`). */
  debuffHits?: number;
  /** Flat top-up applied after the curve (the stall-breaker's escalation). */
  bonus?: number;
}): number {
  const { isBoss, superior, wave, bonus = 0 } = opts;
  const waveScale = wave / 200; // wave/2 as a percentage
  const top = (v: number) => clamp01(v + Math.max(0, bonus));
  if (isBoss) return top(Math.min(0.5 + waveScale, 0.9));
  if (superior) return top(Math.min(0.5 + waveScale, 0.75));
  return top(Math.min(waveScale, 0.5));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

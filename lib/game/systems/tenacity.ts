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
  /** Fraction of the curve to cut away, 0..1 — the Amulet of the damned's break.
   *  Ignored outright while `bonus` is escalating: that escalation is the only thing
   *  standing between the player and a fight that never ends, so no piece of gear
   *  may re-open the perma-lock it exists to close. */
  shred?: number;
}): number {
  const { isBoss, superior, wave, bonus = 0, shred = 0 } = opts;
  const waveScale = wave / 200; // wave/2 as a percentage
  const escalation = Math.max(0, bonus);
  const cut = escalation > 0 ? 1 : 1 - clamp01(shred);
  const top = (v: number) => clamp01(v * cut + escalation);
  if (isBoss) return top(Math.min(0.5 + waveScale, 0.9));
  if (superior) return top(Math.min(0.5 + waveScale, 0.75));
  return top(Math.min(waveScale, 0.5));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Amulet of the damned: how much of an enemy's resistance one of its hits strips,
 *  and how long the break holds after that hit. Half is enough to make a slow tower
 *  matter again against a late boss without one amulet becoming a permanent lock,
 *  and four seconds is short enough that the amulet has to keep hitting to keep it. */
export const CC_BREAK_SHRED = 0.5;
export const CC_BREAK_SECS = 4;

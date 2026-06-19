/**
 * Crowd-control resistance ("tenacity"), 0..1. Shortens how long non-damaging
 * debuffs (slow, stun, vulnerability, knockback) last on an enemy — DoT damage
 * (burn/poison) ignores it. Keeps stun/slow spam (e.g. Shadow barrage) from
 * perma-locking the field.
 *
 *  - Normal monsters scale with the wave: wave/2 percent, capped at 50%.
 *  - Superior monsters use the same curve but cap at 75%.
 *  - Bosses get NO wave base; instead they BUILD tenacity from the non-damaging
 *    debuffs thrown at them (+1% per hit), capped at min(wave%, 90%).
 */
export function debuffTenacity(opts: {
  isBoss?: boolean;
  superior?: boolean;
  wave: number;
  debuffHits?: number;
}): number {
  const { isBoss, superior, wave, debuffHits = 0 } = opts;
  if (isBoss) {
    const cap = Math.min(wave / 100, 0.9);
    return clamp01(Math.min(debuffHits * 0.01, cap));
  }
  const cap = superior ? 0.75 : 0.5;
  return clamp01(Math.min(wave / 200, cap)); // wave/2 as a percentage
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

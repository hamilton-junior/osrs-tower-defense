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
 */
export function debuffTenacity(opts: {
  isBoss?: boolean;
  superior?: boolean;
  wave: number;
  debuffHits?: number;
}): number {
  const { isBoss, superior, wave } = opts;
  const waveScale = wave / 200; // wave/2 as a percentage
  if (isBoss) return clamp01(Math.min(0.5 + waveScale, 0.9));
  if (superior) return clamp01(Math.min(0.5 + waveScale, 0.75));
  return clamp01(Math.min(waveScale, 0.5));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

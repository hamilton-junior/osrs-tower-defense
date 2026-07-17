import type { Enemy, Point, TargetingPriority } from '../types';
import { distance } from './geometry';

/**
 * A kind of tower-applied status, as seen by the `unmarked` priority. `none` is
 * for towers that leave no lingering status (archer / cannon / slayer, the Air
 * gust's pure knockback, Blood's lifesteal) — they have nothing to spread.
 */
export type MarkKind = 'slow' | 'stun' | 'vuln' | 'burn' | 'poison' | 'venom' | 'none';

/**
 * Whether an enemy already carries a *specific* kind of tower status. This is
 * per-effect on purpose: the `unmarked` priority is *per tower* — a venom tower
 * only counts venom, a slow (Ice) tower only counts a slow, and so on. A tower
 * ignores marks laid by other towers, so it still spreads its own effect across
 * the wave instead of treating an enemy some other tower already hit as "done".
 * Boss tenacity (`debuffHits`) is deliberately not counted: it is a resistance
 * tally, not a live effect.
 */
export function hasMark(e: Enemy, kind: MarkKind): boolean {
  switch (kind) {
    case 'slow': return e.slowTimer > 0;
    case 'stun': return e.stunTimer > 0;
    case 'vuln': return (e.vulnTimer ?? 0) > 0;
    case 'burn':
    case 'poison':
    case 'venom': return (e.dots?.[kind]?.timer ?? 0) > 0;
    case 'none':
    default: return false;
  }
}

/**
 * Pick which of the `inRange` enemies a tower should fire at, according to its
 * targeting priority. `inRange` is assumed pre-filtered to live, reachable
 * enemies. Returns `null` for an empty list.
 *
 * - `first`/`last`: furthest-along / least-along the path, breaking ties by
 *   proximity to the next path node.
 * - `strongest`/`weakest`: highest / lowest current HP.
 * - `unmarked`: the furthest-along enemy not yet carrying *this tower's own*
 *   status (see {@link hasMark} and the `markKind` argument), so a status tower
 *   spreads its effect across the wave instead of topping up one victim. A tower
 *   with no lingering status (`markKind === 'none'`) has nothing to spread, so it
 *   behaves as `first`. With every clean enemy out of range it also falls back to
 *   `first` — a tower that would otherwise stand idle keeps firing.
 * - `closest` (default): nearest to the tower.
 *
 * `markKind` names the status *this* tower applies; it only affects `unmarked`.
 */
export function selectTarget(
  inRange: Enemy[],
  towerX: number,
  towerY: number,
  path: Point[],
  priority: TargetingPriority = 'first',
  markKind: MarkKind = 'none',
): Enemy | null {
  if (inRange.length === 0) return null;

  const progressTieBreak = (prev: Enemy, curr: Enemy, preferCloser: boolean): Enemy => {
    const nextPoint = path[curr.pathIndex + 1];
    if (!nextPoint) return prev;
    const dPrev = distance(nextPoint.x, nextPoint.y, prev.x, prev.y);
    const dCurr = distance(nextPoint.x, nextPoint.y, curr.x, curr.y);
    const currWins = preferCloser ? dCurr < dPrev : dCurr > dPrev;
    return currWins ? curr : prev;
  };

  // Unmarked narrows the pool to enemies not carrying *this tower's* status and
  // then behaves as `first` within it. A tower that leaves no lingering mark has
  // nothing to spread, and an all-marked pool leaves the tower firing at `first`
  // rather than holding its shot.
  if (priority === 'unmarked') {
    const clean = markKind === 'none' ? [] : inRange.filter((e) => !hasMark(e, markKind));
    return selectTarget(clean.length > 0 ? clean : inRange, towerX, towerY, path, 'first', markKind);
  }

  switch (priority) {
    case 'first':
      return inRange.reduce((prev, curr) => {
        if (curr.pathIndex > prev.pathIndex) return curr;
        if (curr.pathIndex < prev.pathIndex) return prev;
        return progressTieBreak(prev, curr, true);
      });
    case 'last':
      return inRange.reduce((prev, curr) => {
        if (curr.pathIndex < prev.pathIndex) return curr;
        if (curr.pathIndex > prev.pathIndex) return prev;
        return progressTieBreak(prev, curr, false);
      });
    case 'strongest':
      return inRange.reduce((prev, curr) => (curr.hp > prev.hp ? curr : prev));
    case 'weakest':
      return inRange.reduce((prev, curr) => (curr.hp < prev.hp ? curr : prev));
    case 'closest':
    default:
      return inRange.reduce((prev, curr) =>
        distance(curr.x, curr.y, towerX, towerY) < distance(prev.x, prev.y, towerX, towerY)
          ? curr
          : prev,
      );
  }
}

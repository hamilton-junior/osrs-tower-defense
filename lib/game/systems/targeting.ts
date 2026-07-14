import type { Enemy, Point, TargetingPriority } from '../types';
import { distance } from './geometry';

/**
 * Whether an enemy already carries a tower-applied status: a damage-over-time
 * (burn / poison / venom), a slow, a stun, or the Water amp (vulnerability).
 *
 * This is what the `unmarked` priority avoids. A tower whose job is to *apply* a
 * status gains nothing from re-applying it to the same enemy — it just refreshes a
 * timer while the rest of the wave walks by unafflicted. Boss tenacity (`debuffHits`)
 * is deliberately not counted: it is a resistance tally, not a live effect.
 */
export function isMarked(e: Enemy): boolean {
  if (e.slowTimer > 0 || e.stunTimer > 0 || (e.vulnTimer ?? 0) > 0) return true;
  const dots = e.dots;
  if (!dots) return false;
  return Object.values(dots).some((d) => d !== undefined && d.timer > 0);
}

/**
 * Pick which of the `inRange` enemies a tower should fire at, according to its
 * targeting priority. `inRange` is assumed pre-filtered to live, reachable
 * enemies. Returns `null` for an empty list.
 *
 * - `first`/`last`: furthest-along / least-along the path, breaking ties by
 *   proximity to the next path node.
 * - `strongest`/`weakest`: highest / lowest current HP.
 * - `unmarked`: the furthest-along enemy carrying no status yet (see {@link isMarked}),
 *   so a status tower spreads its effect across the wave instead of topping up one
 *   victim. With everything in range already marked it falls back to `first` — a
 *   tower that would otherwise stand idle keeps firing.
 * - `closest` (default): nearest to the tower.
 */
export function selectTarget(
  inRange: Enemy[],
  towerX: number,
  towerY: number,
  path: Point[],
  priority: TargetingPriority = 'first',
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

  // Unmarked narrows the pool to enemies with no status on them and then behaves as
  // `first` within it. An all-marked pool leaves the tower firing at `first` rather
  // than holding its shot.
  if (priority === 'unmarked') {
    const clean = inRange.filter((e) => !isMarked(e));
    return selectTarget(clean.length > 0 ? clean : inRange, towerX, towerY, path, 'first');
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

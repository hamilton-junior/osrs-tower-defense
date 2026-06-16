import type { Enemy, Point, TargetingPriority } from '../types';
import { distance } from './geometry';

/**
 * Pick which of the `inRange` enemies a tower should fire at, according to its
 * targeting priority. `inRange` is assumed pre-filtered to live, reachable
 * enemies. Returns `null` for an empty list.
 *
 * - `first`/`last`: furthest-along / least-along the path, breaking ties by
 *   proximity to the next path node.
 * - `strongest`/`weakest`: highest / lowest current HP.
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

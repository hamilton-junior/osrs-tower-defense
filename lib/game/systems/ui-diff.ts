/**
 * Structural diffing for the engine → React UI snapshot.
 *
 * `GameEngine.emit()` used to hand React a freshly-built ~60-key object on every
 * call, and it is called from the hot path — once per damage application, times
 * `gameSpeed` sub-steps per frame. Every one of those was a new object identity,
 * so `setUi(prev => ({ ...prev, ...patch }))` re-rendered the whole UI even when
 * nothing a player can see had changed (a tower chipping a boss changes no
 * UI-facing field until the kill lands).
 *
 * These helpers let the engine build its snapshot at most once a frame and push
 * **only the keys whose value actually moved**. The snapshot's values are rebuilt
 * every time (`[...set]`, `.map()`, `cloneRunMods`), so reference equality is
 * useless here — the comparison has to look at the values themselves.
 *
 * Pure and depth-limited: no `this`, no DOM.
 */

/** How deep {@link sameSnapshotValue} will look before it gives up. The snapshot's
 *  deepest value is `runMods.damage.magic` (object → object → number), so this is
 *  generous; anything deeper is reported as *changed*, which costs a redundant
 *  re-render but can never hide an update. */
const MAX_DEPTH = 6;

/**
 * Value equality for the things a UI snapshot holds: primitives, plain objects
 * and arrays of those. Not a general-purpose deep-equal — it knows nothing about
 * Maps, Sets, Dates or class instances, none of which can cross the boundary
 * (the patch is `structuredClone`d). Anything it can't compare confidently is
 * reported as different, so the failure mode is an extra emit, never a stale UI.
 */
export function sameSnapshotValue(a: unknown, b: unknown, depth: number = MAX_DEPTH): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (depth <= 0) return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;

  if (aIsArray) {
    const x = a as unknown[], y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!sameSnapshotValue(x[i], y[i], depth - 1)) return false;
    return true;
  }

  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(y, k)) return false;
    if (!sameSnapshotValue(x[k], y[k], depth - 1)) return false;
  }
  return true;
}

/**
 * The subset of `next` that differs from `prev` — the patch to push to React.
 * With no previous snapshot (the first emit of a run) everything is new, so the
 * whole snapshot is returned. An empty result means "nothing to send": the
 * caller should skip `onState` entirely rather than push `{}`, which would still
 * cost a render.
 */
export function changedState<T extends object>(prev: T | null, next: T): Partial<T> {
  if (!prev) return { ...next };
  const patch: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T & string)[]) {
    if (!sameSnapshotValue(prev[key], next[key])) patch[key] = next[key];
  }
  return patch;
}

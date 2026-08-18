/**
 * The collection-log unlock popup's queueing rules.
 *
 * Two producers already fire these (a tower prayer coming online, a Combat
 * Achievement completing) and more are expected — towers, spells, relics. That
 * makes the queueing a *contract*, not an implementation detail of whoever
 * happens to call `announceUnlocks` today, so it lives here as pure functions
 * with tests rather than as arithmetic inlined in the engine and the component.
 *
 * Two rules, and both exist because of what N producers do to one popup slot:
 *
 * 1. **Nothing is dropped.** The engine coalesces its UI pushes, so several
 *    producers can fire between two flushes. A batch that has not reached the UI
 *    yet is appended to, never replaced — otherwise the last producer of the
 *    frame silently erases every earlier one.
 * 2. **Nothing piles up.** Popups show one at a time, so a batch of eight at the
 *    full dwell would hold the screen for half a minute. The dwell shrinks as the
 *    queue grows, down to a floor that is still readable.
 */

/** How long a lone popup holds. Matches the CSS entry/exit animation. */
export const UNLOCK_DWELL_MS = 4200;
/** The shortest a popup may hold — below this it cannot be read. */
export const UNLOCK_DWELL_MIN_MS = 1500;
/** Target drain time for a whole batch. Above ~3 popups the dwell divides this
 *  rather than multiplying the wait: a batch is one celebration, not a queue the
 *  player has to sit through. */
const UNLOCK_DRAIN_TARGET_MS = 12600;

/**
 * The batch to hand the UI next.
 *
 * `drained` is "the UI has already been shown what was pending" — true after a
 * push, false while a batch is still waiting. Pure: neither input is mutated.
 */
export function mergeUnlockBatch<T>(pending: readonly T[], incoming: readonly T[], drained: boolean): T[] {
  if (incoming.length === 0) return [...pending];
  return drained ? [...incoming] : [...pending, ...incoming];
}

/** How long the popup at the head of the queue should hold, given how many
 *  (including itself) are still waiting. */
export function unlockDwellMs(queued: number): number {
  if (queued <= 1) return UNLOCK_DWELL_MS;
  return Math.max(UNLOCK_DWELL_MIN_MS, Math.min(UNLOCK_DWELL_MS, Math.round(UNLOCK_DRAIN_TARGET_MS / queued)));
}

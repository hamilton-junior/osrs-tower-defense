/**
 * The start screen's menu shrinks, never grows, to fit the window's height: a
 * 1080p screen at 95% zoom falls a few pixels short of the Play tab, and a scroll
 * bar there reads as broken. The whole screen scales through its font size, so
 * one number resizes the menu, the room and the monsters together.
 */

/** Below this the menu's text stops being readable; past it the tab scrolls. */
export const MIN_FIT = 0.75;

/**
 * The next font scale for a screen whose content measured `measured` pixels tall
 * at scale `prev`, with `avail` pixels of room. Content grows in proportion to
 * its font, so `measured / prev` is its height at scale 1.
 *
 * The scale steps in hundredths and shrinks at once when the content overflows,
 * but only grows by two steps or more: pixel rounding makes the height a hair off
 * proportional, and a one-step rise could overflow and bounce back every frame.
 */
export function nextFit(prev: number, avail: number, measured: number, min = MIN_FIT): number {
  if (!(avail > 0) || !(measured > 0) || !(prev > 0)) return prev;
  const natural = measured / prev;
  const target = Math.max(min, Math.min(1, Math.floor((avail / natural) * 100) / 100));
  if (measured <= avail && target > prev && target - prev < 0.02 - 1e-9) return prev;
  return target;
}

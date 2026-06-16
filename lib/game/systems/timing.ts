/**
 * True on the single frame where an accumulating `timer` (seconds) crosses into
 * an integer second that is a multiple of `interval`. Used to fire boss
 * mechanics "every N seconds".
 *
 * Mirrors the engine's original guard exactly:
 *   floor(t) % interval === 0 && floor(t) !== floor(t - dt)
 * i.e. the current whole-second is a multiple of `interval`, and we only just
 * stepped into it this frame (so it fires once, not every frame of that second).
 */
export function crossedInterval(timer: number, dt: number, interval: number): boolean {
  const sec = Math.floor(timer);
  return sec % interval === 0 && sec !== Math.floor(timer - dt);
}

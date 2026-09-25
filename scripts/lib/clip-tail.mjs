/**
 * Trimming the dead tail off a baked one-shot clip.
 *
 * The glTF a clip is baked from carries the cache's keyframes verbatim, and those
 * run past the motion: a death ends with the rig already still, holding the same
 * pose for a dozen more keyframes, and the very last one often renders nothing at
 * all (the model is gone by then). Baked as-is, the player watches a corpse frozen
 * mid-air for the best part of a second and then blink out — which reads as the
 * animation being stuck, because it is.
 *
 * So a one-shot's tail is cut back to the pose it actually ends on: blank frames
 * go, a run of frames matching the one before them collapses into that single
 * frame, and it is held only long enough to register as a settle (TAIL_MS) before
 * the caller's own fade takes it away. Looping clips are left alone — their timing
 * *is* the cycle.
 *
 * Used by the baker (on the frames it just rendered) and by
 * scripts/trim-enemy-anim-tails.mjs (on sheets already on disk), so both agree on
 * what a tail is. Idempotent: a trimmed clip trims to itself.
 */

/** How long the final settled pose is held, in ms. */
export const TAIL_MS = 120;

/** True when every pixel of the frame is fully transparent. */
export function isBlank(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) return false;
  return true;
}

/**
 * How far one channel may drift before two frames count as different. Baked at the
 * client's 20ms cycle, a settled corpse still flickers by a value or two where the
 * tween's floats round differently from frame to frame; nobody can see that, and a
 * strict compare would keep the whole still tail on screen.
 */
export const SAME_TOLERANCE = 8;

/** True when two frames match to within {@link SAME_TOLERANCE} on every channel. */
export function sameFrame(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > SAME_TOLERANCE) return false;
  return true;
}

/**
 * @param {Uint8Array[]} frames  one RGBA buffer per frame
 * @param {number[]} frameMs     per-frame durations, same length
 * @param {boolean} loop         looping clips are returned untouched
 * @returns {{ frames: Uint8Array[], frameMs: number[], dropped: number }}
 */
export function trimTail(frames, frameMs, loop = false) {
  if (loop || frames.length < 3) return { frames, frameMs, dropped: 0 };
  let n = frames.length;
  // A frame that renders nothing is never worth showing.
  while (n > 2 && isBlank(frames[n - 1])) n--;
  // Everything the clip repeats at the end says what the frame before it already said.
  // Measured against the final pose, not frame to frame: at 20ms steps a slow settle
  // moves less per frame than the tolerance and would be cut while still moving.
  const last = frames[n - 1];
  while (n > 2 && sameFrame(frames[n - 2], last)) n--;
  const out = frames.slice(0, n);
  const ms = frameMs.slice(0, n);
  ms[n - 1] = Math.min(ms[n - 1], TAIL_MS);
  return { frames: out, frameMs: ms, dropped: frames.length - n };
}

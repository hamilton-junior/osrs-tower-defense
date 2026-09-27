/**
 * When each frame of a baked clip is sampled, and for how long it is shown.
 *
 * The exporter stacks the cache's frame lengths, so a clip's keyframe `times[i]` is
 * where frame i ENDS: frame 0 runs from 0 to times[0], frame i from times[i-1] to
 * times[i]. The client shows frame i for that whole stretch, and with animation
 * smoothing on (RuneLite's Animation Smoothing) it tweens across it from pose i to
 * pose i+1 — and a loop's last frame tweens back round to pose 0.
 *
 * The bake used to put pose i at times[i] instead — the end of its frame — which
 * moved every tween one frame late and left the first frame of every clip standing
 * still for its whole length: 60ms on an imp, 180ms on a jogre, every time a walk
 * came round or a flinch began, between frames that otherwise change every 20ms.
 * That hold was the stutter.
 *
 * Every span is cut into steps of at most HOLD_MS, the OSRS client cycle (20ms, 50
 * poses a second), so the sheets move exactly as smoothly as the client does. The
 * exception is a rest: OSRS says "and now lie there dead" by holding a pose for four
 * hundred *seconds*, and nothing is moving across a gap like that, so a frame longer
 * than REST_MS stays one still frame — which is also what stops a death clip from
 * exploding into thousands of identical frames. A one-shot's last pose has nothing to
 * move towards and holds as well.
 */

export const HOLD_MS = 20;
export const REST_MS = 300;

/**
 * One sample per baked frame. `at` is when the frame starts, in seconds from the
 * clip's start. The pose to render is the track at time `t`, or, where `w` > 0, the
 * blend `w` of the way from the pose at `t` to the pose at `t2`: the one tween the
 * track cannot give by itself is a loop's last pose back to its first, because the
 * first sits at the far end of it.
 *
 * @param {number[]} times  keyframe times in seconds, ascending (frame ends)
 * @param {boolean} loop
 * @returns {{ at: number, t: number, t2: number, w: number }[]}
 */
export function clipSamples(times, loop, capMs = HOLD_MS, restMs = REST_MS) {
  const out = [];
  const n = times.length;
  for (let i = 0; i < n; i++) {
    const start = i === 0 ? 0 : times[i - 1];
    const span = times[i] - start;
    // A frame of no length is never on screen.
    if (!(span > 0)) continue;
    const last = i === n - 1;
    const still = span * 1000 > restMs || (last && !loop) || n === 1;
    // the 1e-6 keeps a span of exactly capMs at one step (0.06 * 1000 / 60 > 1 in floats)
    const steps = still ? 1 : Math.max(1, Math.ceil((span * 1000) / capMs - 1e-6));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      const at = start + span * f;
      if (last) out.push({ at, t: times[i], t2: times[0], w: f });
      else out.push({ at, t: times[i] + (times[i + 1] - times[i]) * f, t2: 0, w: 0 });
    }
  }
  return out;
}

/**
 * How long each of `starts` (frame start times in seconds, ascending) is shown, in
 * whole ms, the last one until `end`. Rounded on the running total rather than per
 * frame: a 185ms span split into ten 18.5ms steps would otherwise round every one up
 * and stretch the clip.
 */
export function frameDurations(starts, end) {
  return starts.map((at, i) => {
    const next = i + 1 < starts.length ? starts[i + 1] : end;
    return Math.max(1, Math.round(next * 1000) - Math.round(at * 1000));
  });
}

/**
 * Shape metrics for one animation clip, and the ranked slot scores built on them.
 *
 * Picking an NPC's hurt/death out of a block of sequence ids used to mean rendering
 * every candidate and eyeballing dozens of images. These three numbers, computed off
 * the posed vertices (so they are format-agnostic — classic frames and maya keyframes
 * both arrive here as vertex arrays), do most of that triage:
 *
 *   collapse = height(last) / max height   DEATH → low: the body ends on the ground
 *   reach    = max horiz extent / frame-0  ATTACK → high: a limb shoots out
 *   settle   = |last − first| centroid     BLOCK → ~0: it returns to where it started
 *
 * ⚠ The honest limit, unchanged since the first audit round: **metrics cannot
 * reliably separate an attack from a block.** Both are short, both end standing, and
 * a lunge that recovers looks like a flinch to any of these numbers. What they DO
 * settle, close to deterministically, is which id is the death — the same criterion
 * used by hand to pick Scurrius' 10705. Scoping (who does this rig belong to) is the
 * job of the tenancy index, and the last word is the in-game look.
 *
 * The three thresholds are the ones `validate-anims.mjs` has flagged on since the
 * round-2 audit; they are shared from here so the flag and the score never drift.
 */

/** reach above this reads as a limb thrown out, not a flinch. */
export const ATTACK_REACH = 1.12;
/** collapse below this means the body ended on the ground — a death. */
export const DEATH_COLLAPSE = 0.78;
/** collapse above this means it ended standing — so it is NOT a death. */
export const LIVE_COLLAPSE = 0.8;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 1 when v is exactly 1, falling to 0 by ±⅓ — "ended the way it started". */
const near1 = (v) => clamp01(1 - Math.abs(1 - v) * 3);
/** 1 for a clip of 8 frames or fewer, fading out by 20 — blocks are short. */
const short = (n) => (n <= 8 ? 1 : clamp01(1 - (n - 8) / 12));

/** `collapse` / `reach` / `settle` for a clip's posed vertex frames. */
export function metrics(frames) {
  const h = [], ext = [], cen = [];
  for (const verts of frames) {
    let minY = Infinity, maxY = -Infinity, cx = 0, cy = 0, cz = 0;
    for (const v of verts) { minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); cx += v[0]; cy += v[1]; cz += v[2]; }
    cx /= verts.length; cy /= verts.length; cz /= verts.length;
    let e = 0;
    for (const v of verts) e = Math.max(e, Math.hypot(v[0] - cx, v[2] - cz));
    h.push(maxY - minY); ext.push(e); cen.push([cx, cy, cz]);
  }
  const maxH = Math.max(...h) || 1;
  const a = cen[0], b = cen[cen.length - 1];
  return {
    collapse: h[h.length - 1] / maxH,
    reach: Math.max(...ext) / (ext[0] || 1),
    settle: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / maxH,
  };
}

/**
 * How well a clip fits each slot, 0..1. Read them as "look at the top two", not as
 * an answer: `attack` and `block` are the pair the metrics genuinely cannot split.
 */
export function slotScores(m, frameCount) {
  // Two readings of the same number. The attack score wants a *ramp* — the further
  // a limb travels, the more it looks like a swing. The block penalty wants a
  // *threshold*: a flinch that reaches 1.10 is still a flinch, and charging it 80%
  // of the attack penalty is what once buried the mummy's real block down the list.
  const lungeRamp = clamp01((m.reach - 1) / (ATTACK_REACH - 1));
  const lungeOver = clamp01((m.reach - ATTACK_REACH) / 0.3);
  return {
    death: clamp01(0.7 * clamp01((1 - m.collapse) / (1 - DEATH_COLLAPSE)) + 0.3 * clamp01(m.settle * 3)),
    block: clamp01(0.4 * near1(m.collapse) + 0.3 * (1 - clamp01(m.settle * 6)) + 0.3 * short(frameCount) - 0.5 * lungeOver),
    attack: clamp01(0.6 * lungeRamp + 0.2 * near1(m.collapse) + 0.2 * short(frameCount)),
  };
}

/** The best-scoring slot, as `{ slot, score }`. */
export function verdict(m, frameCount) {
  const s = slotScores(m, frameCount);
  const slot = Object.keys(s).reduce((a, b) => (s[b] > s[a] ? b : a));
  return { slot, score: s[slot], scores: s };
}

/**
 * Procedural **path layout** generator — a pure, seeded module the engine calls at
 * the start of every run so the map is never the same twice, yet always a clean,
 * playable layout.
 *
 * Rather than one fixed silhouette, the generator rolls one of a small library of
 * **archetypes** (serpentine, staircase, detour, loop) and then applies one of the
 * eight **dihedral orientations** of the square (four rotations × an optional
 * mirror). Every archetype is built to be **non-self-crossing** with a minimum gap
 * between parallel legs (room to build), and because each orientation is an isometry
 * of the unit square it *preserves* those properties and maps borders to borders —
 * so entry/exit always land on a board edge. One archetype therefore yields up to
 * eight distinct silhouettes for free, and the run's map feels genuinely different
 * each time.
 *
 * Output is **normalized** ([0,1] fractions of the field), so the engine's
 * `buildPath` can snap it onto the current tile grid (and re-snap on restart)
 * without changing the run's shape. `entry`/`exit` name the border each off-screen
 * stub extends from, derived from the transformed endpoints.
 */

/** One interior turn/corner of the road, in normalized [0,1] field coordinates. */
export interface MapPoint {
  fx: number;
  fy: number;
}

/** Which board border an off-screen entry/exit stub extends from. */
export type MapEdge = 'left' | 'right' | 'top' | 'bottom';

export interface MapLayout {
  /** Interior corner waypoints. The engine prepends an off-screen entry stub off
   *  the {@link entry} border and appends an exit stub off the {@link exit} border. */
  points: MapPoint[];
  /** Border the entry (spawn) stub extends from. */
  entry: MapEdge;
  /** Border the exit (base) stub extends from. */
  exit: MapEdge;
  /** Archetype name — for tests / debug. */
  archetype: string;
  /** Dihedral orientation index 0..7 — for tests / debug. */
  orientation: number;
}

/**
 * All archetypes are built inside a **symmetric** safe box `[LO, HI]²`. Using the
 * same margin on both axes means every dihedral orientation keeps the layout inside
 * the box (a rotation swaps the axes), so no rotated corner is ever pushed past a
 * margin. The x-margin (0.16) is the larger of the two board margins, so the box is
 * comfortably within the play field on both axes.
 */
const LO = 0.16;
const HI = 0.84;
const SPAN = HI - LO; // 0.68

/** Minimum separation between parallel legs (fraction of the field) — keeps two
 *  legs far enough apart to slot towers between them. */
const MIN_GAP = 0.15;
/** Minimum length of a real up/down turn leg — a substantial move, not a jog. */
const MIN_LEG = 0.22;

/** Small, fast, well-distributed seeded PRNG (mulberry32) — deterministic per seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * `n` ascending positions spanning exactly `[lo, hi]`, every consecutive gap at
 * least `minGap`, with the leftover slack shared out at random. Valid by
 * construction (no clamp/repair) whenever `(n-1) * minGap <= hi - lo`.
 */
function spread(rng: () => number, n: number, lo: number, hi: number, minGap: number): number[] {
  const gaps = n - 1;
  if (gaps <= 0) return [lo];
  const slack = Math.max(0, hi - lo - gaps * minGap);
  const weights = Array.from({ length: gaps }, () => rng());
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const out = [lo];
  for (let i = 0; i < gaps; i++) out.push(out[i] + minGap + slack * (weights[i] / wsum));
  return out;
}

// ───────────────────────────────── archetypes ──────────────────────────────
// Each returns normalized interior waypoints inside [LO, HI]², non-self-crossing,
// with parallel legs at least MIN_GAP apart.

/** Column zigzag: vertical legs at each column joined by horizontal runs. Entry
 *  left, exit right (pre-orientation). The original layout. */
function buildSerpentine(rng: () => number): MapPoint[] {
  const columns = 3 + Math.floor(rng() * 3); // 3, 4 or 5
  const xs = spread(rng, columns, LO, HI, MIN_GAP);

  // Turn row per column: each turns at least MIN_LEG from the previous, in a
  // randomly chosen direction (flipped if it would leave the box).
  const ys: number[] = [];
  let prev = LO + rng() * SPAN;
  ys.push(prev);
  for (let i = 1; i < columns; i++) {
    let dir = rng() < 0.5 ? -1 : 1;
    if (dir < 0 && prev - MIN_LEG < LO) dir = 1;
    if (dir > 0 && prev + MIN_LEG > HI) dir = -1;
    const room = dir < 0 ? prev - LO : HI - prev;
    const mag = MIN_LEG + rng() * Math.max(0, room - MIN_LEG);
    prev = clamp(prev + dir * mag, LO, HI);
    ys.push(prev);
  }

  const points: MapPoint[] = [];
  for (let i = 0; i < columns; i++) {
    points.push({ fx: xs[i], fy: ys[i] });
    if (i < columns - 1) points.push({ fx: xs[i], fy: ys[i + 1] });
  }
  return points;
}

/** Monotonic staircase: steps that only ever move right and down. Entry top-left
 *  corner, exit bottom-right corner. Non-crossing by monotonicity. */
function buildStaircase(rng: () => number): MapPoint[] {
  const steps = 3 + Math.floor(rng() * 3); // 3, 4 or 5 corners
  const xs = spread(rng, steps, LO, HI, MIN_GAP);
  const ys = spread(rng, steps, LO, HI, MIN_GAP);

  const points: MapPoint[] = [{ fx: xs[0], fy: ys[0] }];
  for (let i = 1; i < steps; i++) {
    points.push({ fx: xs[i], fy: ys[i - 1] }); // right along the current row
    points.push({ fx: xs[i], fy: ys[i] });     // down to the next row
  }
  return points;
}

/** A straight cross-field run with a large rectangular detour (out-and-back bump).
 *  Entry left, exit right. Non-crossing: the base line and the bump own disjoint
 *  x-ranges. (One bump only: two would need six anchors ≥ MIN_GAP apart, which
 *  overflows the box — the sides of each bump are themselves parallel legs.) */
function buildDetour(rng: () => number): MapPoint[] {
  const detours = 1;
  const baseY = LO + MIN_LEG + rng() * Math.max(0, SPAN - 2 * MIN_LEG); // room to bump either way
  const xs = spread(rng, 2 * detours + 2, LO, HI, MIN_GAP); // start + rise + fall + end

  const points: MapPoint[] = [{ fx: xs[0], fy: baseY }];
  for (let j = 0; j < detours; j++) {
    const xRise = xs[1 + 2 * j];
    const xFall = xs[2 + 2 * j];
    // Bump up or down, whichever has room; magnitude at least MIN_LEG.
    let dir = rng() < 0.5 ? -1 : 1;
    if (dir < 0 && baseY - MIN_LEG < LO) dir = 1;
    if (dir > 0 && baseY + MIN_LEG > HI) dir = -1;
    const room = dir < 0 ? baseY - LO : HI - baseY;
    const bumpY = clamp(baseY + dir * (MIN_LEG + rng() * Math.max(0, room - MIN_LEG)), LO, HI);
    points.push({ fx: xRise, fy: baseY });
    points.push({ fx: xRise, fy: bumpY });
    points.push({ fx: xFall, fy: bumpY });
    points.push({ fx: xFall, fy: baseY });
  }
  points.push({ fx: xs[xs.length - 1], fy: baseY });
  return points;
}

/** A big "C"/"U": in along the top, across to the far side, back out along the
 *  bottom. Entry and exit on the *same* border. Non-crossing (three legs). */
function buildLoop(rng: () => number): MapPoint[] {
  const yTop = LO + rng() * (SPAN * 0.3);        // near the top
  const yBot = HI - rng() * (SPAN * 0.3);        // near the bottom (≥ ~0.28 apart)
  const xFar = HI - rng() * (SPAN * 0.1);        // belly reaches the right border
  return [
    { fx: LO, fy: yTop },
    { fx: xFar, fy: yTop },
    { fx: xFar, fy: yBot },
    { fx: LO, fy: yBot },
  ];
}

const ARCHETYPES: { name: string; build: (rng: () => number) => MapPoint[] }[] = [
  { name: 'serpentine', build: buildSerpentine },
  { name: 'staircase', build: buildStaircase },
  { name: 'detour', build: buildDetour },
  { name: 'loop', build: buildLoop },
];

// ─────────────────────────────── orientation ───────────────────────────────

/**
 * Map a normalized point under dihedral element `k` (0..7): `k & 3` rotations of
 * 90° about the box centre, with an x-mirror first when `k >= 4`. Every element
 * permutes the symmetric box `[LO, HI]²` onto itself, so outputs stay in range and
 * the non-crossing / min-gap properties are preserved.
 */
export function orientPoint(fx: number, fy: number, k: number): MapPoint {
  let x = fx;
  let y = fy;
  if (k >= 4) x = 1 - x; // mirror across the vertical axis
  const r = k & 3;
  for (let i = 0; i < r; i++) {
    const nx = 1 - y; // rotate +90° about (0.5, 0.5): (x,y) → (1-y, x)
    const ny = x;
    x = nx;
    y = ny;
  }
  return { fx: x, fy: y };
}

const orient = (points: MapPoint[], k: number): MapPoint[] =>
  points.map(p => orientPoint(p.fx, p.fy, k));

/** The border a normalized point is nearest to. Ties break left > right > top >
 *  bottom, so an archetype's corner endpoints report a stable, sensible edge. */
export function edgeOf(p: MapPoint): MapEdge {
  const candidates: [MapEdge, number][] = [
    ['left', p.fx],
    ['right', 1 - p.fx],
    ['top', p.fy],
    ['bottom', 1 - p.fy],
  ];
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i][1] < best[1]) best = candidates[i];
  }
  return best[0];
}

/**
 * Build a random-but-valid road layout for the given seed. The same seed always
 * produces the same layout; different seeds vary the archetype, its parameters,
 * and the dihedral orientation.
 */
export function generateMapLayout(seed: number): MapLayout {
  const rng = makeRng(seed);
  const archetype = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const raw = archetype.build(rng);
  const orientation = Math.floor(rng() * 8);
  const points = orient(raw, orientation);
  return {
    points,
    entry: edgeOf(points[0]),
    exit: edgeOf(points[points.length - 1]),
    archetype: archetype.name,
    orientation,
  };
}

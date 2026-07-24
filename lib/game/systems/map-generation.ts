/**
 * Procedural **path layout** generator — a pure, seeded module the engine calls at
 * the start of every run so the map is never the same twice, yet always a clean,
 * playable layout.
 *
 * The road is built as a left→right sequence of **chunks** — a serpentine zigzag or
 * a staircase — stitched end to end, so a single map can mix shapes ("a serpentine
 * then a staircase"). Two shapes that don't compose (a `detour` bump, a `loop`) are
 * rolled as standalone maps instead. Whatever is built, one of the eight **dihedral
 * orientations** of the square (four rotations × an optional mirror) is applied on
 * top, so entry/exit can land on any border.
 *
 * Every chunk is x-monotonic and every standalone archetype is **non-self-crossing**
 * with a minimum gap between parallel legs (room to build); chaining x-monotonic
 * chunks keeps the whole road x-monotonic, so it can never cross itself. Because each
 * orientation is an isometry of the unit square it *preserves* those properties and
 * maps borders to borders. The run's map therefore feels genuinely different each
 * time while always staying valid.
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

/** Min width a chunk range can be squeezed to; two of these fit the box (2 × 0.30 =
 *  0.60 ≤ 0.68) and each still holds at least one turn (3 anchors, 2 gaps = 0.30). */
const CHUNK_MIN_W = 0.3;

/** How many interior turn-columns a chunk of `width` can hold: `m` columns need
 *  `m + 2` anchors (entry + columns + exit) ⇒ `m + 1` gaps of ≥ MIN_GAP. */
const maxTurns = (width: number) => Math.max(1, Math.floor(width / MIN_GAP + 1e-9) - 1);

/**
 * Build a chunk's points from its x-anchors and y-rows so it **enters and exits
 * horizontally** (columns live strictly inside `(xlo, xhi)`): the road runs
 * `(xlo,y0) →H→ (c1,y0) →V→ (c1,y1) →H→ … →V→ (cm,ym) →H→ (xhi,ym)`. Entering and
 * exiting on a horizontal is what lets any two chunks chain at a shared boundary
 * *column-free*, so no two chunks' vertical legs can ever land on the same x and
 * double back. `xs = [xlo, c1..cm, xhi]` (length m+2); `ys = [y0..ym]` (length m+1).
 */
function chunkFromRows(xs: number[], ys: number[]): MapPoint[] {
  const m = ys.length - 1; // interior turn-columns
  const pts: MapPoint[] = [{ fx: xs[0], fy: ys[0] }];
  for (let i = 1; i <= m; i++) {
    pts.push({ fx: xs[i], fy: ys[i - 1] }); // horizontal to column i at the current row
    pts.push({ fx: xs[i], fy: ys[i] });     // vertical at column i to the next row
  }
  pts.push({ fx: xs[m + 1], fy: ys[m] });    // horizontal out to xhi
  return pts;
}

/**
 * A serpentine **chunk** over `[xlo, xhi]` starting at row `startY`: interior columns
 * whose rows **zigzag** up/down. Enters/exits horizontally (see {@link chunkFromRows}).
 */
function serpentineChunk(rng: () => number, xlo: number, xhi: number, startY: number): MapPoint[] {
  const m = Math.min(maxTurns(xhi - xlo), 1 + Math.floor(rng() * 3)); // 1..3 turns
  const xs = spread(rng, m + 2, xlo, xhi, MIN_GAP);
  const ys: number[] = [startY];
  let prev = startY;
  for (let i = 0; i < m; i++) {
    let dir = rng() < 0.5 ? -1 : 1;
    if (dir < 0 && prev - MIN_LEG < LO) dir = 1;
    if (dir > 0 && prev + MIN_LEG > HI) dir = -1;
    const room = dir < 0 ? prev - LO : HI - prev;
    prev = clamp(prev + dir * (MIN_LEG + rng() * Math.max(0, room - MIN_LEG)), LO, HI);
    ys.push(prev);
  }
  return chunkFromRows(xs, ys);
}

/**
 * A staircase **chunk** over `[xlo, xhi]` starting at row `startY`: interior columns
 * whose rows step **monotonically** in one direction (chosen toward the side with
 * room). Enters/exits horizontally (see {@link chunkFromRows}).
 */
function staircaseChunk(rng: () => number, xlo: number, xhi: number, startY: number): MapPoint[] {
  let m = Math.min(maxTurns(xhi - xlo), 1 + Math.floor(rng() * 3)); // 1..3 steps desired
  const roomUp = HI - startY;
  const roomDown = startY - LO;
  // Trim steps so the monotonic rise (m × MIN_GAP) fits at least one side of startY.
  while (m > 1 && m * MIN_GAP > Math.max(roomUp, roomDown)) m--;
  const need = m * MIN_GAP;
  const canDown = roomDown >= need;
  const canUp = roomUp >= need;
  const dir = canDown && canUp ? (rng() < 0.5 ? -1 : 1) : canDown ? -1 : 1;
  const room = dir < 0 ? roomDown : roomUp;
  const slack = Math.max(0, room - need);
  const weights = Array.from({ length: m }, () => rng());
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const ys: number[] = [startY];
  let prev = startY;
  for (let i = 0; i < m; i++) {
    prev = clamp(prev + dir * (MIN_GAP + slack * (weights[i] / wsum)), LO, HI);
    ys.push(prev);
  }
  const xs = spread(rng, m + 2, xlo, xhi, MIN_GAP);
  return chunkFromRows(xs, ys);
}

const CHUNK_BUILDERS: { name: string; build: (rng: () => number, xlo: number, xhi: number, startY: number) => MapPoint[] }[] = [
  { name: 'serpentine', build: serpentineChunk },
  { name: 'staircase', build: staircaseChunk },
];

/**
 * Chain 1–3 x-monotonic chunks (serpentine / staircase) across the field, threading
 * each chunk's end row into the next chunk's start. The whole road stays x-monotonic
 * (never crosses itself), and a single map can mix shapes. Returns the points plus a
 * `name` describing the mix (e.g. `serpentine+staircase`).
 */
function buildComposite(rng: () => number): { points: MapPoint[]; name: string } {
  const k = 1 + Math.floor(rng() * 2); // 1 or 2 chunks (two ≥ CHUNK_MIN_W fit the box)
  const bounds = spread(rng, k + 1, LO, HI, CHUNK_MIN_W); // k ranges, each ≥ CHUNK_MIN_W
  let startY = LO + rng() * SPAN;
  const points: MapPoint[] = [];
  const names: string[] = [];
  for (let i = 0; i < k; i++) {
    const builder = CHUNK_BUILDERS[Math.floor(rng() * CHUNK_BUILDERS.length)];
    const chunk = builder.build(rng, bounds[i], bounds[i + 1], startY);
    points.push(...(i === 0 ? chunk : chunk.slice(1))); // drop the shared junction point
    startY = chunk[chunk.length - 1].fy;
    names.push(builder.name);
  }
  return { points, name: names.join('+') };
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
 * produces the same layout; different seeds vary the archetype(s), their parameters,
 * and the dihedral orientation. Most maps are a chain of serpentine/staircase chunks
 * (which may mix); a minority are a standalone detour or loop, which don't compose.
 */
export function generateMapLayout(seed: number): MapLayout {
  const rng = makeRng(seed);
  const roll = rng();
  let raw: MapPoint[];
  let name: string;
  if (roll < 0.16) {
    raw = buildLoop(rng);
    name = 'loop';
  } else if (roll < 0.34) {
    raw = buildDetour(rng);
    name = 'detour';
  } else {
    const composite = buildComposite(rng);
    raw = composite.points;
    name = composite.name;
  }
  const orientation = Math.floor(rng() * 8);
  const points = orient(raw, orientation);
  return {
    points,
    entry: edgeOf(points[0]),
    exit: edgeOf(points[points.length - 1]),
    archetype: name,
    orientation,
  };
}

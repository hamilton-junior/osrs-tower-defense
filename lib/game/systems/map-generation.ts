/**
 * Procedural **path layout** generator — a pure, seeded module the engine calls at
 * the start of every run so the map is never the same twice, yet always a clean,
 * playable layout.
 *
 * The shape is a **column zigzag**: a handful of vertical "columns" march strictly
 * left→right across the field (x always increases), and the road snakes up/down
 * between a random row at each column. Because the columns are monotonic in x, the
 * road can **never cross or touch itself**, and a minimum column gap + minimum row
 * gap guarantee no two parallel legs run close enough to choke tower placement — so
 * every seed yields a valid serpentine with room to build, without any retry/repair.
 *
 * Output is **normalized** ([0,1] fractions of the field), so the engine's
 * `buildPath` can snap it onto the current tile grid at any canvas size (and
 * re-snap on resize) without changing the run's shape.
 */

/** One interior turn/corner of the road, in normalized [0,1] field coordinates. */
export interface MapPoint {
  fx: number;
  fy: number;
}

export interface MapLayout {
  /** Interior corner waypoints, left→right (fx strictly non-decreasing). The
   *  engine prepends an off-screen entry at the first point's fy and appends an
   *  off-screen exit at the last point's fy. */
  points: MapPoint[];
  /** Columns used to build it (3–5) — handy for tests / debug. */
  columns: number;
}

// Play-field margins: keep every turn comfortably on-screen so the entry/exit
// stubs and the base marker always have room.
const X_MIN = 0.16;
const X_MAX = 0.84;
const Y_MIN = 0.14;
const Y_MAX = 0.86;
/** Minimum horizontal gap between columns (fraction of width). Keeps parallel
 *  vertical legs far enough apart to slot towers between them. */
const MIN_COL_GAP = 0.15;
/** Minimum vertical leg length (fraction of height) — a real up/down, and enough
 *  clearance that stacked horizontal legs never touch. */
const MIN_ROW_GAP = 0.22;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

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

/**
 * Build a random-but-valid road layout for the given seed. The same seed always
 * produces the same layout; different seeds vary the column count, the column x
 * positions, and the row the road turns to at each column.
 */
export function generateMapLayout(seed: number): MapLayout {
  const rng = makeRng(seed);
  const columns = 3 + Math.floor(rng() * 3); // 3, 4 or 5

  // --- column x positions: span [X_MIN, X_MAX] with a guaranteed MIN_COL_GAP
  // between every pair, then a random share of the leftover slack added to each
  // gap. This is valid by construction (no clamp/repair) so every seed yields
  // well-separated columns with room to build between the vertical legs.
  const gaps = columns - 1;
  const slack = X_MAX - X_MIN - gaps * MIN_COL_GAP;
  const weights = Array.from({ length: gaps }, () => rng());
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  const xs: number[] = [X_MIN];
  for (let i = 0; i < gaps; i++) {
    xs.push(xs[i] + MIN_COL_GAP + slack * (weights[i] / wsum));
  }

  // --- row y per column: each turns at least MIN_ROW_GAP from the previous, in a
  // randomly chosen direction (flipped if it would leave the field).
  const ys: number[] = [];
  let prev = Y_MIN + rng() * (Y_MAX - Y_MIN);
  ys.push(prev);
  for (let i = 1; i < columns; i++) {
    let dir = rng() < 0.5 ? -1 : 1;
    if (dir < 0 && prev - MIN_ROW_GAP < Y_MIN) dir = 1;
    if (dir > 0 && prev + MIN_ROW_GAP > Y_MAX) dir = -1;
    const room = dir < 0 ? prev - Y_MIN : Y_MAX - prev;
    const mag = MIN_ROW_GAP + rng() * Math.max(0, room - MIN_ROW_GAP);
    prev = clamp(prev + dir * mag, Y_MIN, Y_MAX);
    ys.push(prev);
  }

  // --- corners: at each column, arrive at (x_i, y_i) then drop/rise to y_{i+1}.
  const points: MapPoint[] = [];
  for (let i = 0; i < columns; i++) {
    points.push({ fx: xs[i], fy: ys[i] });
    if (i < columns - 1) points.push({ fx: xs[i], fy: ys[i + 1] });
  }

  return { points, columns };
}

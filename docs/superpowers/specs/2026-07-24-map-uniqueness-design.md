# Map uniqueness per run — design

**Date:** 2026-07-24
**Status:** approved (design gate passed)
**Goal:** Make every run's battlefield feel genuinely different — the road
*silhouette* AND the surrounding field — so each run is its own placement
puzzle, while the board stays a fixed 1728×768 (54×24 tiles) for every player.

Map **zoom** is explicitly **out of scope** for this spec (deferred to its own
effort — it is a view-only camera over the fixed board and shouldn't be tangled
with map generation).

## Why

`systems/map-generation.ts` today produces exactly one topology: a left→right
column serpentine (strictly monotonic in x, so it never self-crosses). Column
count, x positions and turn rows vary, but the *silhouette* is always the same,
so runs feel same-y. And the off-road field is pure cosmetic scatter drawn ad
hoc in the renderer — it never changes how a run plays.

Two levers make a run unique:

1. **Road shape** — a small library of distinct road *archetypes*, each rolled
   per run and each freely oriented (the 8 square symmetries) so entry/exit can
   sit on any border.
2. **Terrain field** — a seeded, gameplay-affecting field of obstacles
   (block building), non-buildable zones, and biome decoration, that turns the
   empty space into a placement puzzle without ever making a road leg
   indefensible.

## Constraints (carried from project rules)

- Board is **fixed** `LOGIC_WIDTH=1728 × LOGIC_HEIGHT=768`, `GRID=32` → 54×24
  tiles. Nothing derives from screen size/DPR. No `fitOnce`/`resize()`.
- Generation is **pure + seeded + unit-tested** in `lib/game/systems/`. The
  engine orchestrates; the renderer draws; neither holds generation logic.
- **Assets come from OSRS only.** Resolved: terrain is drawn *procedurally* with
  the active biome's existing `decor` palette (`data/biomes.ts` is colours-only,
  and the renderer already draws rocks/bushes/flowers as shapes). No cache
  sourcing, no external hosts, no new sprites.
- In-game strings stay English. Reply/commentary in pt-BR.

---

## 1. Road archetypes + orientation

### The idea

An **archetype** is a pure function `(rng) => MapPoint[]` producing normalized
interior waypoints ([0,1] of the field) that is **guaranteed non-self-crossing**
and keeps a minimum gap between parallel legs (room to build). On top of the raw
points we apply an **orientation transform** — one of the 8 dihedral symmetries
of the unit square (4 rotations × optional mirror). Because each transform is an
isometry of the unit square, it **preserves** non-self-crossing and min-gap for
*any* archetype, and it maps borders to borders — so entry/exit stay on the
board edges. This multiplies each archetype's silhouette by up to 8 for free.

`generateMapLayout(seed)` keeps its signature and, per seed, rolls
`archetype × orientation`, applies the transform, then derives the entry/exit
edges from the transformed endpoints.

### Archetypes (v1)

All keep entry and exit **on borders** (so the base/exit stays an edge marker
and the portal keeps cropping at the board edge).

- **Serpentine** — the existing column zigzag (horizontal legs joined by
  vertical drops). Monotonic-x ⇒ non-crossing. Entry left / exit right
  (pre-orientation). This is the baseline and stays behaviourally identical
  when its orientation roll is the identity.
- **Staircase** — monotonic in **both** x and y (diagonal steps). Entry and exit
  on opposite corners. Non-crossing by monotonicity.
- **Detour** — mostly straight across one axis with 1–2 large rectangular
  detours (out-and-back bumps). Non-crossing as long as detours don't overlap
  along the main axis (enforced by construction).
- **Loop / Cee** — a large "C"/"U": entry and exit on the **same** border, the
  belly reaching the opposite border. Very different silhouette. Non-crossing by
  construction (three legs, none overlapping).

### Data shape

```ts
export type MapEdge = 'left' | 'right' | 'top' | 'bottom';

export interface MapPoint { fx: number; fy: number; }

export interface MapLayout {
  points: MapPoint[];          // interior corner waypoints (transformed)
  entry: MapEdge;              // border the entry stub extends from
  exit: MapEdge;               // border the exit stub extends from
  archetype: string;          // e.g. 'serpentine' — for tests/debug
  orientation: number;        // 0..7 dihedral index — for tests/debug
}
```

`entry`/`exit` are **derived**: for `points[0]`, the edge is whichever of
`fx, 1-fx, fy, 1-fy` is smallest (the nearest border); likewise `exit` from the
last point. Loop/Cee correctly reports the same edge for both.

### Orientation transform (pure)

`orient(points, k)` maps each `(fx, fy)` under dihedral element `k ∈ 0..7`:
rotations by 0/90/180/270° about the unit-square centre, optionally pre-mirrored
in x. All outputs stay within `[0,1]`. Unit tests assert it preserves the
non-crossing property (no two non-adjacent segments intersect) for every
archetype × every `k`.

### Invariants (tested)

For every seed in a wide sweep, and every archetype × orientation:
- points are within the play margins;
- no two non-adjacent segments intersect (non-crossing);
- every parallel leg pair is ≥ the min-gap apart (buildable room);
- `entry`/`exit` land on a border and are consistent with the endpoints;
- determinism: same seed → identical layout.

---

## 2. Engine: generalized entry/exit

`buildPath` currently hardcodes the entry stub at `(-GRID, points[0].y)` and the
exit at `(width+GRID, last.y)`. Generalize it to extend the stub **perpendicular
to the reported edge**:

- `left` → `(-GRID, y)` · `right` → `(width+GRID, y)`
- `top` → `(x, -GRID)` · `bottom` → `(x, height+GRID)`

where `(x, y)` is the snapped first/last waypoint. `portalPoint` already walks
`path[0] → path[1]` by direction, so it works unchanged for any edge (the portal
still crops at whichever board edge the road enters). The exit stub is likewise
off-screen on its edge; the leak/"reach the base" logic is unchanged (enemies
still walk to the final waypoint).

No screen/DPR math is introduced — the stubs use `width`/`height`/`GRID`
constants exactly as today.

---

## 3. Terrain field

### Data shape

```ts
export type TileFlag = 'open' | 'blocked' | 'unbuildable';

export interface TerrainDecoration { col: number; row: number; kind: number; }

export interface TerrainField {
  cols: number;               // 54
  rows: number;               // 24
  tiles: TileFlag[];          // row-major, length cols*rows
  decorations: TerrainDecoration[];  // cosmetic only
}
```

- **blocked** — hard obstacle (rock/water/tree, drawn in biome palette): can't
  build, drawn opaque and tile-sized.
- **unbuildable** — soft zone (swamp/tall grass): can't build, drawn as a tint
  overlay; visually passable.
- **open** — normal buildable ground.
- **decorations** — cosmetic props, no gameplay effect (replaces the renderer's
  current ad-hoc scatter, now seeded from the field).

### Generator (pure)

`generateTerrain(seed, path, cols, rows, grid)` → `TerrainField`. (`path` is the
built polyline so the generator knows the road tiles; it never needs the DOM.)

Algorithm:
1. Mark **road tiles**: any tile whose centre is within the road clearance of a
   path segment. These are never obstacles/zones/decoration.
2. Mark the **build corridor**: tiles within Chebyshev distance ≤ 2 of a road
   tile stay `open` (never `blocked`/`unbuildable`) — this is the real tower
   lane, so it's always defensible.
3. **Cluster placement** (seeded): scatter obstacle/zone cluster seeds over the
   remaining field, growing small blobs, until coverage reaches a cap
   (≤ ~22% of eligible tiles). Obstacle vs zone is a per-cluster roll.
4. **Defensibility repair** (deterministic): for every road tile, count `open`
   tiles within Chebyshev radius 3; if fewer than `K` (e.g. 6), remove the
   nearest `blocked`/`unbuildable` tiles (turn them `open`) until satisfied.
   This guarantees no road leg is walled off, without any retry loop.
5. **Decorations**: scatter cosmetic props on `open`, non-corridor tiles.

Derived seed: `terrainSeed = mapSeed ^ 0x9e3779b9` so terrain varies
independently of the road but stays deterministic per run.

### Invariants (tested)

- No road tile is ever `blocked`/`unbuildable` (nor a decoration).
- Build corridor (dist ≤ 2) is always `open`.
- Coverage ≤ cap.
- Post-repair: every road tile has ≥ K `open` tiles within radius 3
  (defensibility).
- Determinism: same seed → identical field.

---

## 4. Placement integration

`isValidPlacement` gains an optional blocked-tile check. Cleanest: pass a
predicate/set so it stays pure and the existing callers are unaffected by
default.

```ts
export function isValidPlacement(
  x, y, path, towers,
  pathClearance = 40, towerClearance = 30,
  isBlockedTile?: (x: number, y: number) => boolean, // NEW, optional
): boolean
```

The engine supplies a closure over its `TerrainField` (snap `(x,y)` → tile →
reject if `blocked` or `unbuildable`). Every engine placement call site
(`placeTower`, blueprint paste, auto-place, drag-build) passes it; tests for the
existing signature keep working because the new arg is optional.

The engine holds `terrain: TerrainField`, regenerated in `generateMap` alongside
the layout/biome, and cleared/rebuilt on `restart` like the map.

---

## 5. Renderer

`drawDecorations` is replaced by drawing from `engine.terrain`:
- **blocked** tiles: a tile-sized rock/water/tree shape in the biome `decor`
  palette (opaque), so obstacles read as impassable.
- **unbuildable** tiles: a semi-transparent tint (biome-tinted) over the tile.
- **decorations**: the existing bush/rock/flower shapes, now placed from
  `terrain.decorations` instead of the renderer's own hash.

Drawing stays procedural (no sprites), keyed off the biome palette — identical
style to today, just sourced from the shared field. The road is drawn on top of
terrain as now, so an obstacle never visually covers the road.

---

## 6. Files

- `lib/game/systems/map-generation.ts` — archetypes + `orient()` + endpoint edge
  derivation; `MapLayout` gains `entry/exit/archetype/orientation`. (+test)
- `lib/game/systems/terrain-generation.ts` — **new**, the pure generator. (+test)
- `lib/game/systems/geometry.ts` — `isValidPlacement` optional `isBlockedTile`.
  (+test for the new arg)
- `lib/game/core/engine.ts` — generalized `buildPath`; `terrain` state;
  placement call sites pass the blocked closure.
- `lib/game/core/renderer.ts` — draw terrain (obstacles/zones/decorations).
- `lib/game/types.ts` — `MapEdge`, `TileFlag`, `TerrainField`,
  `TerrainDecoration` (re-exported as needed).

## 7. Verification

- `npx tsc --noEmit` + `npx vitest run` green at each step.
- Headless drive of the exported game (game-verify) to see a few runs' maps +
  terrain render and confirm placement rejects obstacle tiles.
- Balance/feel is the user's playtest — not part of this gate.

## 8. Out of scope

- **Map zoom / camera** — deferred to its own effort.
- New biomes or new obstacle art — obstacles reuse each biome's palette.

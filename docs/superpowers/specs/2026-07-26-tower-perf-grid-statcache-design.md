# Tower spam & performance — Design (A3)

**Date:** 2026-07-26
**Status:** Approved (brainstorm). Next step: implementation plan.

## Goal

Keep the game smooth when the board fills with towers and enemies, **without
changing anything the player experiences**. Today a late, crowded board drops
frames at 5× speed. A3 makes the per-frame combat work cheaper while producing a
**bit-identical** simulation: the same tower fires at the same target for the same
damage on the same tick as before. No new rule, no tower cap, no UI change.

This is sub-spec **A3** of the late-game balance theme (Tema A). Its siblings:

- **A1 — Victory + Endless** (shipped, branch `wip`).
- **A2 — Cards & economy in the late game** (shipped, branch `wip`).
- **A4 — New Game+ / harder difficulty tier** (near-future). Not this spec.

## Source suggestion

- **#26.1 / #27 — tower spam & 5× lag.** A crowded late board stutters. The user
  chose the narrowest possible reading: **performance only** — no gameplay change,
  no curb on how many towers a player may build.

## Scope decisions (locked in brainstorm)

1. **Core = performance only.** No game-rule change, no tower limit, no draft/curve
   change. Purely how the engine computes each frame.
2. **Exactness bar = bit-identical.** Every optimisation must produce an identical
   simulation result — same target selection, same damage, same timing — proven by
   equivalence tests, not by eyeballing.
3. **Scope = spatial grid + stat cache + headless benchmark.** Both levers: cut the
   `towers × enemies` range-query cost with a spatial grid, and cut the `towers²`
   per-tick stat recompute with an epoch-invalidated cache. A benchmark quantifies
   the win and guards regressions.

### Explicit non-goals

- **No tower cap, no spawn throttle, no rule change.** Performance work only.
- **No `UIState`, render, or visual change.** Nothing crosses the engine→React
  boundary differently; `core/renderer.ts` is untouched.
- **No change to any simulation output.** Target, damage, cooldown, kill order,
  RNG consumption — all identical, at every wave, every speed.

## Current state (verified against code)

- `update(dt)` is sub-stepped `gameSpeed`× per frame
  (`engine.ts:860-887` — `for (let s=0; s<this.gameSpeed; s++) this.update(dt)`).
- The tower firing loop (`engine.ts:3768-3819`) runs, **per tower, per tick**:
  1. `calculateTowerStats(tower, ctx)` — inside it, a scan over **all towers** for
     nearby Utility-mage auras (`tower-combat.ts:183-193`). Across the firing loop
     that is **O(towers²) per tick**.
  2. Range check via `this.enemies.filter(inReach)` (`engine.ts:3807`) — O(enemies)
     per tower, i.e. **O(towers × enemies) per tick**.
  3. `selectTarget(pool, …)` over that pool.
- Range is a **square**: `inSquareRange(e.x, e.y, tower.x, tower.y, half + enemyRadius(e))`
  where `half = squareRange(stats.range, GRID)` (`engine.ts:3785-3792`).
- Reselection happens only when `!target || !inReach(target)` (`engine.ts:3806`).
  The current target is otherwise sticky.
- **Placement synergy is already cached** by `towerLayoutVersion`
  (`synergyCache`, `engine.ts:670`; `bumpTowerLayout()`, `engine.ts:1136`, fires on
  place/remove/move/upgrade/synergy-card/road-change). It is **not** a target of this
  work — only the utility-aura scan and the range query are.
- **`selectTarget` tie-breaks are order-dependent.** It reduces over the pool with
  strict-inequality comparisons (`targeting.ts`), so on a tie it keeps the
  earlier-in-array enemy. The pool today is `this.enemies.filter(inReach)`, i.e.
  **`this.enemies` order**. Any replacement MUST present candidates in that same
  order or target selection can differ on ties. This is the central correctness
  constraint.

## Design

### Block 1 — Spatial grid (kills the `towers × enemies` term)

**File:** `lib/game/systems/spatial-grid.ts` — new, pure, unit-tested. No `this`,
no DOM, no engine knowledge.

A uniform grid over the fixed `1728 × 768` board. Cell size is a tuned constant
(`CELL ≈ 96px`, ~3 tiles); the benchmark decides the final value.

- `build(enemies)` — one pass over the enemy list, bucketing each enemy into the
  cell containing its centre. O(enemies). Rebuilt **once per sub-step** (enemies
  move each sub-step) and reused by every tower in that sub-step.
- `queryRange(x, y, half)` — returns a **super-set** of candidate enemies whose
  cells overlap the tower's range square `[x-half, x+half] × [y-half, y+half]`.
  Because range is square, this is a rectangular block of cells.

**Wiring (the only engine change in this block).** Replace `this.enemies.filter(inReach)`
at `engine.ts:3807` with:

1. `grid.queryRange(tower.x, tower.y, half + maxEnemyRadius)` → candidate super-set.
2. The **same precise `inReach`** filter on each candidate (`!doomed`,
   `!moleIsHidden`, `inSquareRange` with the per-enemy radius) — the grid never
   replaces the exact test, only narrows who it runs on.
3. **Reorder the survivors by their index in `this.enemies`** before `selectTarget`,
   so the pool is byte-identical to today's `filter` result.

The grid query must use a `half` padded by the **maximum** enemy radius so no
in-range body is missed by a super-set keyed on centres; the precise `inReach`
then trims the extras. `maxEnemyRadius` is a small constant bound over enemy sizes.

The two other slayer scans in the loop (`engine.ts:3803` sticky-drop and the
favoured-target `.some`) are boolean/order-independent and stay as-is; routing them
through the grid is an optional later optimisation, not part of this spec.

**Equivalence test (correctness gate).** For random boards (varied N towers, M
enemies, positions, ranges, enemy states incl. doomed/hidden): for **every**
targeting priority, assert the grid-derived pool + `selectTarget` picks the
**identical** target as the brute-force `this.enemies.filter(inReach)` + `selectTarget`.

### Block 2 — Stat cache (kills the `towers²` term)

**Files:** `lib/game/core/engine.ts` (internal only).

A single global `combatEpoch: number` counter and a `bumpCombatEpoch()`
choke-point. Each tower carries `statsEpoch` + a cached `ComputedTowerStats`;
`calculateTowerStats` is called only when `tower.statsEpoch !== this.combatEpoch`,
otherwise the cached value is reused for that tick.

The cache is valid because every input to `calculateTowerStats` is constant between
mutations: prayers/potions/runMods/mageBuff/event-mods are flat multipliers while
active (they do not ramp per tick), auras depend only on tower positions/levels, and
meta upgrades are fixed for the run. So in a steady tick with no mutation, a tower's
stats are genuinely invariant.

**Invalidation — every stat-affecting event bumps the epoch:**

| Event | Site |
|---|---|
| Place / remove / move / upgrade a tower; synergy card; road change | **fold `bumpCombatEpoch()` into `bumpTowerLayout()`** (`engine.ts:1136`) — already fires on all of these |
| Equip / unequip an item on a tower | add a bump at the equipment-change site |
| Change a wizard's element / ancient / mageMode | add a bump at the mode-change site |
| Toggle a prayer | add a bump in the prayer-toggle path |
| Drink a potion (start) | add a bump where the potion is pushed to `this.ge.active` |
| **Potion expires (time-based)** | **add a bump at the potion-expiry removal site inside `update()`** |
| Apply a draft card / relic that changes `runMods` or `mageBuff` | add a bump in the apply path (`engine.ts:5071-5096`, mageBuff `~5118`) |
| Wave event starts (sets `eventTowerMods`) | add a bump at event start |
| **Wave event ends (time-based)** | **add a bump at event end inside `update()`** |

The two **time-based** expiries (potion vencendo, event ending) are the trap:
they have no user click, they fire on a timer inside `update()`. The plan MUST pin
their exact call sites and cover them with the cache equivalence test below.

Folding the layout bump in means all layout-driven invalidation (which also covers
the aura inputs, since auras read `this.towers`) comes for free and can never drift
from the synergy cache's own invalidation.

A global epoch over-invalidates slightly (toggling one prayer recomputes every
tower next tick), which is intended: these events are rare relative to per-tick, and
the win is that a mutation-free stretch recomputes nothing.

**Cache equivalence test (correctness gate).** Start a temporary effect
(potion/prayer) on a tower, step several ticks **including the tick the effect
expires**, and assert cached stats equal freshly-computed (no-cache) stats at every
tick — proving both that active effects are cached correctly and that expiry
invalidates on the same tick as today.

### Block 3 — Headless benchmark & the gate

- **Stress scenario** via the existing headless harness: a full board (many towers +
  many enemies), run at 5×, measure **ms/frame** before and after. Reports two
  concrete numbers and guards against future regression.
- **Correctness** is proven by the two pure equivalence tests above, not the
  benchmark.
- **Gate:** `npx tsc --noEmit` + `npx vitest run` + `npm run build`, green at each
  step.

## Files touched

- `lib/game/systems/spatial-grid.ts` — new pure grid module.
- `lib/game/systems/spatial-grid.test.ts` — grid unit tests + brute-force
  equivalence test across all priorities.
- `lib/game/core/engine.ts` — grid build per sub-step; replace the range `filter`
  with grid query + precise `inReach` + `this.enemies`-index reorder; `combatEpoch`
  + `bumpCombatEpoch()`; per-tower `statsEpoch`/cached stats; all invalidation sites.
- A cache equivalence test (co-located with the engine's testable seam, or a small
  extracted helper if needed to keep it pure).
- Benchmark scenario under the existing `scripts/dev/` harness.

## Out of scope (recorded, not built)

- Any tower cap, spawn throttle, or gameplay change (#26.1's other readings).
- Routing the slayer sticky/favoured scans through the grid (optional later win).
- Broader engine profiling beyond these two hot terms.
- Changing the synergy cache (already cached; untouched).

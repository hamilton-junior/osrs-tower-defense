# Tower Performance — Spatial Grid + Stat Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-frame combat loop cheaper on a crowded board — with a spatial grid for range queries and an epoch-invalidated per-tower stat cache — while keeping the simulation bit-identical.

**Architecture:** A new pure `spatial-grid` module buckets enemies into a uniform grid so a tower gathers only nearby candidates instead of scanning every enemy; the engine still applies the exact `inSquareRange` test and re-sorts each pool into `this.enemies` order so `selectTarget`'s order-dependent tie-breaks are unchanged. A single `combatEpoch` counter on the engine, bumped at every stat-affecting mutation, lets each tower reuse its last `calculateTowerStats` result across ticks, removing the per-tick O(towers²) utility-aura scan.

**Tech Stack:** TypeScript, Vitest (pure unit tests next to modules under `lib/game/systems/`), Node (a headless micro-benchmark script under `scripts/dev/`).

## Global Constraints

- **Bit-identical simulation.** Every change must produce the identical target selection, damage, cooldown, kill order and RNG consumption as today. Prove it with pure equivalence tests, never by eyeballing.
- **Performance only.** No tower cap, no spawn throttle, no gameplay/rule change, no draft/curve change.
- **No boundary/render/UI change.** Nothing crosses the engine→React boundary differently; `UIState` and `core/renderer.ts` are untouched. In-game strings stay English.
- **Board is a fixed `1728 × 768`** (`GRID = 32` px/tile). Game logic never depends on screen size.
- **Grid cell = `GRID * 3` (96 px)** as the starting value (`COMBAT_GRID_CELL`); it is a pure tuning constant the benchmark may revisit. **`MAX_ENEMY_RADIUS = 28`** (boss body; non-boss 13) — the range-query padding, must stay ≥ every `enemyRadius`.
- **`selectTarget` tie-breaks are order-dependent** (`targeting.ts` reduces with strict `<`/`>`, keeping the earlier element on a tie). Any pool handed to it must be in `this.enemies` order.
- Verify each task with `npx tsc --noEmit` + `npx vitest run` + `npm run build`, green before moving on.

---

## File Structure

- `lib/game/systems/spatial-grid.ts` — **new.** Pure uniform-grid bucketer: `buildSpatialGrid` + `queryRange`, plus the `MAX_ENEMY_RADIUS` constant. No `this`, no DOM, no engine import.
- `lib/game/systems/spatial-grid.test.ts` — **new.** Unit tests + the load-bearing grid-vs-brute-force equivalence test across every targeting priority.
- `lib/game/core/engine.ts` — **modify.** Build the grid + identity-order map once per sub-step; replace the range `filter` in the firing loop; add `combatEpoch` / `bumpCombatEpoch()` / a `statsCache` Map; wire the cache into the firing loop; add the invalidation bumps.
- `lib/game/systems/ge-system.ts` — **modify.** Bump the epoch when a potion buff starts and when one expires.
- `lib/game/systems/prayer-system.ts` — **modify.** Bump the epoch when prayers auto-deplete.
- `scripts/dev/bench-combat.mjs` — **new.** Pure Node micro-benchmark: brute-vs-grid range query and recompute-vs-cache stat cost, deterministic, no browser.

---

## Task 1: Spatial grid module + equivalence tests

**Files:**
- Create: `lib/game/systems/spatial-grid.ts`
- Test: `lib/game/systems/spatial-grid.test.ts`

**Interfaces:**
- Consumes: `Enemy` from `../types`; `inSquareRange`, `squareRange` from `./geometry`; `selectTarget` from `./targeting` (test only).
- Produces:
  - `MAX_ENEMY_RADIUS: number` (= 28).
  - `interface SpatialGrid { queryRange(x: number, y: number, half: number): Enemy[] }`.
  - `buildSpatialGrid(enemies: readonly Enemy[], cell: number, width: number, height: number): SpatialGrid`.

- [ ] **Step 1: Write the failing tests**

Create `lib/game/systems/spatial-grid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSpatialGrid, MAX_ENEMY_RADIUS } from './spatial-grid';
import { inSquareRange, squareRange } from './geometry';
import { selectTarget } from './targeting';
import type { Enemy, Point, TargetingPriority } from '../types';

const W = 1728;
const H = 768;
const GRID = 32;
const CELL = GRID * 3;
const radius = (e: Enemy) => (e.isBoss ? 28 : 13);

// Deterministic RNG so failures reproduce.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A path long enough for any pathIndex we assign.
const PATH: Point[] = Array.from({ length: 40 }, (_, i) => ({ x: i * 40, y: 384 }));

function makeEnemies(rng: () => number, n: number): Enemy[] {
  return Array.from({ length: n }, (_, i) => {
    const isBoss = rng() < 0.1;
    return {
      id: `e${i}`,
      x: rng() * (W + 60) - 30, // allow a few slightly off-board, like the portal edge
      y: rng() * (H + 60) - 30,
      hp: 1 + Math.floor(rng() * 500),
      pathIndex: Math.floor(rng() * 30),
      isBoss,
      // status fields hasMark() reads, so `unmarked` is exercised for real
      slowTimer: rng() < 0.3 ? 1 : 0,
      stunTimer: 0,
      vulnTimer: rng() < 0.2 ? 1 : 0,
      dots: rng() < 0.3 ? { venom: { timer: 1 } } : undefined,
    } as unknown as Enemy;
  });
}

const PRIORITIES: TargetingPriority[] = [
  'first', 'last', 'strongest', 'weakest', 'closest', 'unmarked',
];

describe('buildSpatialGrid', () => {
  it('queryRange returns a super-set of every enemy inside the padded range square', () => {
    const rng = mulberry32(1);
    const enemies = makeEnemies(rng, 400);
    const grid = buildSpatialGrid(enemies, CELL, W, H);
    for (let t = 0; t < 200; t++) {
      const tx = rng() * W;
      const ty = rng() * H;
      const half = squareRange(40 + rng() * 300, GRID);
      const candidates = new Set(grid.queryRange(tx, ty, half + MAX_ENEMY_RADIUS).map(e => e.id));
      // Every enemy the precise per-enemy test would accept must be a candidate.
      const brute = enemies.filter(e => inSquareRange(e.x, e.y, tx, ty, half + radius(e)));
      for (const e of brute) expect(candidates.has(e.id)).toBe(true);
    }
  });

  it('grid pool + selectTarget matches brute force for every priority', () => {
    const rng = mulberry32(7);
    const enemies = makeEnemies(rng, 400);
    const order = new Map(enemies.map((e, i) => [e.id, i]));
    const grid = buildSpatialGrid(enemies, CELL, W, H);
    // markKind spread across a few values so `unmarked` filters different pools.
    const markKinds = ['venom', 'slow', 'vuln', 'none'] as const;

    for (let t = 0; t < 300; t++) {
      const tx = rng() * W;
      const ty = rng() * H;
      const half = squareRange(40 + rng() * 300, GRID);
      const inReach = (e: Enemy) => inSquareRange(e.x, e.y, tx, ty, half + radius(e));

      const brutePool = enemies.filter(inReach);
      const gridPool = grid
        .queryRange(tx, ty, half + MAX_ENEMY_RADIUS)
        .filter(inReach);
      gridPool.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

      expect(gridPool.map(e => e.id)).toEqual(brutePool.map(e => e.id));

      for (const priority of PRIORITIES) {
        for (const mark of markKinds) {
          const a = selectTarget(brutePool, tx, ty, PATH, priority, mark);
          const b = selectTarget(gridPool, tx, ty, PATH, priority, mark);
          expect(b?.id).toBe(a?.id);
        }
      }
    }
  });

  it('buckets every enemy exactly once (no duplicates in a full-board query)', () => {
    const rng = mulberry32(3);
    const enemies = makeEnemies(rng, 250);
    const grid = buildSpatialGrid(enemies, CELL, W, H);
    const all = grid.queryRange(W / 2, H / 2, Math.max(W, H)); // covers the board
    const ids = all.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/game/systems/spatial-grid.test.ts`
Expected: FAIL — `buildSpatialGrid` / `MAX_ENEMY_RADIUS` not defined.

- [ ] **Step 3: Write the module**

Create `lib/game/systems/spatial-grid.ts`:

```ts
import type { Enemy } from '../types';

/**
 * Largest enemy body radius (a boss). The tower range query pads its half-extent
 * by this so an enemy whose *centre* sits just outside the range square but whose
 * *body* reaches in is never dropped from the candidate set — the caller then
 * re-tests every candidate with that enemy's own radius. Must stay ≥ every value
 * `enemyRadius` can return (boss 28, other 13).
 */
export const MAX_ENEMY_RADIUS = 28;

export interface SpatialGrid {
  /**
   * Every enemy whose cell overlaps the axis-aligned square
   * `[x-half, x+half] × [y-half, y+half]`. A SUPER-SET keyed on enemy centres:
   * the caller must still apply its own precise in-range test, and — because the
   * order here is bucket order, not enemy-list order — re-sort by enemy identity
   * when order matters (it does for `selectTarget`). Each enemy appears at most
   * once (cells are disjoint).
   */
  queryRange(x: number, y: number, half: number): Enemy[];
}

/**
 * Bucket `enemies` into a uniform grid of `cell`-px square cells over a
 * `width`×`height` px board, so a tower gathers only nearby enemies instead of
 * scanning the whole list. Pure: one pass to build; each `queryRange` visits only
 * the overlapping cells. Rebuild once per sub-step (enemies move each step) and
 * reuse the instance across every tower in that step. Off-board centres clamp to
 * the edge cells, so nothing is ever dropped.
 */
export function buildSpatialGrid(
  enemies: readonly Enemy[],
  cell: number,
  width: number,
  height: number,
): SpatialGrid {
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const buckets: Enemy[][] = Array.from({ length: cols * rows }, () => []);
  const colOf = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor(x / cell)));
  const rowOf = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor(y / cell)));

  for (const e of enemies) buckets[rowOf(e.y) * cols + colOf(e.x)].push(e);

  return {
    queryRange(x, y, half) {
      const c0 = colOf(x - half);
      const c1 = colOf(x + half);
      const r0 = rowOf(y - half);
      const r1 = rowOf(y + half);
      const out: Enemy[] = [];
      for (let r = r0; r <= r1; r++) {
        const base = r * cols;
        for (let c = c0; c <= c1; c++) {
          const b = buckets[base + c];
          for (let i = 0; i < b.length; i++) out.push(b[i]);
        }
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/spatial-grid.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Full gate**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: typecheck clean; full suite green (one pre-existing unrelated failure, `lib/game/changelog-classify.test.ts`, may remain — it is not touched by this task).

- [ ] **Step 6: Commit**

```bash
git add lib/game/systems/spatial-grid.ts lib/game/systems/spatial-grid.test.ts
git commit -m "perf: pure spatial grid for tower range queries, with brute-force equivalence tests"
```

---

## Task 2: Wire the grid into the firing loop

**Files:**
- Modify: `lib/game/core/engine.ts` (imports near top; firing loop at ~3767-3819)

**Interfaces:**
- Consumes: `buildSpatialGrid`, `MAX_ENEMY_RADIUS` from `../systems/spatial-grid`.
- Produces: no new exported symbol; the firing loop's `inRange` pool is now grid-derived but byte-identical to the old `this.enemies.filter(inReach)`.

**Context:** The firing loop (`engine.ts:3768`) runs inside `update(dt)`, which is itself sub-stepped `gameSpeed`× per frame (`engine.ts:873`). Enemies have already moved earlier in `update`, so building the grid immediately before the loop reflects current positions. Only the pool-building `filter` at `engine.ts:3807` changes; the sticky-target `this.enemies.find` (3798) and slayer `this.enemies.some` (3803) are boolean/id lookups, order-independent, and stay as-is.

- [ ] **Step 1: Add the import**

Find the systems import block near the top of `engine.ts` and add:

```ts
import { buildSpatialGrid, MAX_ENEMY_RADIUS } from '../systems/spatial-grid';
```

- [ ] **Step 2: Add the cell-size constant**

Near the existing top-level `const GRID = 32;` (engine.ts:91), add:

```ts
/** Combat spatial-grid cell size (3 tiles). A pure perf knob — larger means
 *  cheaper build but more candidates to filter per query; smaller is the reverse. */
const COMBAT_GRID_CELL = GRID * 3;
```

- [ ] **Step 3: Build the grid + identity-order map once per sub-step**

In the firing loop, immediately before `for (const tower of this.towers) {` (engine.ts:3768), insert:

```ts
    // One spatial grid + one identity-order map per sub-step, shared by every
    // tower. The grid turns each range query from O(enemies) into O(nearby). The
    // order map restores `this.enemies` ordering to each candidate pool, because
    // selectTarget's tie-breaks are order-dependent — the pool must match the old
    // `this.enemies.filter(...)` exactly, or a tie could resolve to a different
    // target.
    const grid = buildSpatialGrid(this.enemies, COMBAT_GRID_CELL, this.width, this.height);
    const enemyOrder = new Map<string, number>();
    for (let i = 0; i < this.enemies.length; i++) enemyOrder.set(this.enemies[i].id, i);
```

- [ ] **Step 4: Replace the range filter**

Replace the single line at engine.ts:3807:

```ts
        const inRange = this.enemies.filter(inReach);
```

with:

```ts
        const inRange = grid
          .queryRange(tower.x, tower.y, half + MAX_ENEMY_RADIUS)
          .filter(inReach);
        inRange.sort((a, b) => enemyOrder.get(a.id)! - enemyOrder.get(b.id)!);
```

(`half` is already in scope from engine.ts:3785 — `const half = squareRange(stats.range, GRID);`.)

- [ ] **Step 5: Gate**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: typecheck clean; suite green (Task 1's equivalence test is the correctness proof for this transformation).

- [ ] **Step 6: Build + smoke-drive**

Run: `npm run build`
Expected: static export succeeds.
Then drive it headlessly (per the `game-verify` skill) to confirm no crash and enemies still take damage/die: e.g. a short `withGame` script from `scripts/dev/harness.mjs` that places a couple of towers, starts a wave, waits, and asserts the enemy count falls and no `PAGEERROR` fired.

- [ ] **Step 7: Commit**

```bash
git add lib/game/core/engine.ts
git commit -m "perf: query the spatial grid for in-range enemies, preserving this.enemies order"
```

---

## Task 3: Per-tower stat cache with epoch invalidation

**Files:**
- Modify: `lib/game/core/engine.ts` (fields near `synergyCache` ~669-670; `bumpTowerLayout` at 1136; `togglePrayer` at 1086; firing-loop `calculateTowerStats` call at 3775; `pickRelic` at 5051-5059; wave-event start at 2500; wave-event end at 4884; reset paths at 5273/5350)
- Modify: `lib/game/systems/ge-system.ts` (`buy` ~76-79; `update` ~92-97)
- Modify: `lib/game/systems/prayer-system.ts` (`update` depletion branch ~118-123)

**Interfaces:**
- Consumes: `ComputedTowerStats` type from `../systems/tower-combat` (already the return type of `calculateTowerStats`).
- Produces: `GameEngine.bumpCombatEpoch(): void` — **public** (called from `GeSystem` and `PrayerSystem` via their `this.e` back-reference).

**Why this is correct:** every input to `calculateTowerStats` is constant between mutations — prayers/potions/runMods/mageBuff/event-mods are flat multipliers while active (they never ramp per tick), the utility auras depend only on tower positions/levels, meta upgrades are fixed for the run, and the passed `synergyMult` is already layout-cached. So in a tick with no stat-affecting mutation, a tower's stats are genuinely unchanged and safe to reuse. Every mutation below bumps the epoch, forcing a recompute on the next tick.

**Invalidation set (complete; reasoning for exclusions):**

| Mutation | Site | How |
|---|---|---|
| place / remove / move / upgrade tower; synergy card; road change; **draft card** | `bumpTowerLayout()` (1136) — `pickDraftCard` already calls it (5019) | fold epoch bump + cache clear in |
| toggle a prayer | `togglePrayer` (1086) | `this.bumpCombatEpoch()` |
| **prayers auto-deplete (time-based)** | `PrayerSystem.update` (prayer-system.ts:119) | `this.e.bumpCombatEpoch()` |
| drink a combat potion (start) | `GeSystem.buy` buff branch (ge-system.ts:76-79) | `this.e.bumpCombatEpoch()` |
| **potion expires (time-based)** | `GeSystem.update` (ge-system.ts:96) | `this.e.bumpCombatEpoch()` when a buff was removed |
| apply a relic that changes runMods | `pickRelic` (5054) | `this.bumpCombatEpoch()` |
| wave event starts | `startWave` sets `this.activeEvent` (2500) | `this.bumpCombatEpoch()` |
| **wave event ends** | wave clear sets `this.activeEvent = null` (4884); reset (5273/5350) | `this.bumpCombatEpoch()` |

*Excluded, verified not to affect `calculateTowerStats`:* element / ancient / support-spell changes (`setWizardElement`/`setAncientType`/`setSupportSpell`) — none feed `calculateTowerStats` (element damage is applied later in the firing path; support fields don't change the aura maths, which key only on `type==='wizard' && mageMode==='utility'` + level). `mageMode` **does** feed the `mageBuff` lookup but is locked at placement, captured by the place-time layout bump. Equipment: the new core has no equip/unequip path, so `tower.equipment` never mutates mid-run; if one is ever added, it must bump here too.

- [ ] **Step 1: Add the import**

In `engine.ts`, extend the existing `tower-combat` import to include the stats type:

```ts
import { calculateTowerStats, type ComputedTowerStats } from '../systems/tower-combat';
```
(If `calculateTowerStats` is imported on its own line, add `ComputedTowerStats` to it; do not create a second import.)

- [ ] **Step 2: Add the epoch + cache fields**

Next to `private synergyCache…` (engine.ts:670), add:

```ts
  /** Bumped on every stat-affecting mutation; a tower recomputes its combat
   *  stats only when its cached epoch no longer matches. See bumpCombatEpoch. */
  private combatEpoch = 0;
  /** Per-tower memo of calculateTowerStats, valid while epoch matches. Cleared on
   *  layout change (which also covers tower removal). */
  private statsCache = new Map<string, { epoch: number; stats: ComputedTowerStats }>();
```

- [ ] **Step 3: Add `bumpCombatEpoch` and fold it into `bumpTowerLayout`**

Add the public method (near `bumpTowerLayout`):

```ts
  /** Invalidate every tower's cached combat stats (next tick recomputes). Public
   *  so the GE and Prayer subsystems can call it when a buff starts or lapses. */
  bumpCombatEpoch() { this.combatEpoch++; }
```

Change `bumpTowerLayout` (engine.ts:1136) from:

```ts
  private bumpTowerLayout() { this.towerLayoutVersion++; this.synergyCache = null; }
```

to:

```ts
  private bumpTowerLayout() {
    this.towerLayoutVersion++;
    this.synergyCache = null;
    this.bumpCombatEpoch();   // layout changes tower stats (auras, tiers, count)
    this.statsCache.clear();  // and reclaim removed towers' entries
  }
```

- [ ] **Step 4: Use the cache in the firing loop**

Replace the `const stats = calculateTowerStats(tower, { … });` call (engine.ts:3775-3784) with:

```ts
      let cached = this.statsCache.get(tower.id);
      if (!cached || cached.epoch !== this.combatEpoch) {
        cached = {
          epoch: this.combatEpoch,
          stats: calculateTowerStats(tower, {
            upgrades: this.meta.upgrades,
            activePrayers: this.prayer.active,
            activePotions: this.ge.active,
            allTowers: this.towers,
            runMods: this.runMods,
            synergyMult: this.synergyMultFor(tower.id),
            mageBuff: this.runFx.mageBuff,
            globalMods: this.eventTowerMods(),
          }),
        };
        this.statsCache.set(tower.id, cached);
      }
      const stats = cached.stats;
```

- [ ] **Step 5: Add the discrete-event bumps in `engine.ts`**

`togglePrayer` (1086-1088):

```ts
  togglePrayer(id: PrayerType) {
    this.prayer.toggle(id);
    this.bumpCombatEpoch();
  }
```

`pickRelic` — after `this.applyRelicEffect(relic.effect);` (5054):

```ts
    this.applyRelicEffect(relic.effect);
    this.bumpCombatEpoch(); // a relic can raise runMods (damage/range/fireRate)
```

Wave-event start — after `this.activeEvent = rollWaveEvent(this.wave, bossWave, Math.random);` (2500):

```ts
    this.activeEvent = rollWaveEvent(this.wave, bossWave, Math.random);
    this.bumpCombatEpoch(); // event tower mods change every tower's stats
```

Wave-event end — after `this.activeEvent = null;` at wave clear (4884):

```ts
    this.activeEvent = null; // the event lasts exactly its wave — clear it on clear
    this.bumpCombatEpoch();
```

Reset paths — after each remaining `this.activeEvent = null;` in `restart`/`reset` (5273 and 5350), add `this.bumpCombatEpoch();` on the next line (belt-and-braces; the run is being rebuilt).

- [ ] **Step 6: Add the GE bumps in `ge-system.ts`**

In `buy`, the combat-buff branch (ge-system.ts:75-79) — after the potion is added/extended:

```ts
    } else {
      const existing = this.active.find(p => p.type === offer.id);
      if (existing) existing.timer += GE_POTION_DURATION; // re-buying extends the buff
      else this.active.push({ type: offer.id, timer: GE_POTION_DURATION });
      this.e.bumpCombatEpoch(); // a new/extended buff changes tower stats
    }
```

In `update`, when a buff expired (ge-system.ts:92-97):

```ts
    let changed = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.timer -= dt;
      if (p.timer <= 0) { this.active.splice(i, 1); changed = true; }
    }
    if (changed) this.e.bumpCombatEpoch(); // an expired buff changes tower stats
```

- [ ] **Step 7: Add the prayer-depletion bump in `prayer-system.ts`**

In `update`, the depletion branch (prayer-system.ts:118-123):

```ts
      if (this.points <= 0) {
        this.active.clear();
        this.e.bumpCombatEpoch(); // prayers just went dark — tower stats changed
        this.e.notify('Prayer points depleted');
        this.lastShown = 0;
        return;
      }
```

- [ ] **Step 8: Gate**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: typecheck clean; suite green.

- [ ] **Step 9: Build + verify invalidation drives correctly**

Run: `npm run build`, then a headless drive (per `game-verify`) that exercises a time-based expiry: place towers, start a wave, drink a damage potion, record a tower's fire cadence / kill rate while buffed, let the potion lapse, and confirm the cadence returns to the unbuffed baseline (proving the expiry bump fired). Confirm no `PAGEERROR`.

- [ ] **Step 10: Commit**

```bash
git add lib/game/core/engine.ts lib/game/systems/ge-system.ts lib/game/systems/prayer-system.ts
git commit -m "perf: cache per-tower combat stats behind a combatEpoch, invalidated on every stat change"
```

---

## Task 4: Headless combat micro-benchmark

**Files:**
- Create: `scripts/dev/bench-combat.mjs`

**Interfaces:**
- Consumes (built output, so run `npm run build` first is not required — it imports source via a tsx/node ESM path; see Step 1 note): `buildSpatialGrid`, `MAX_ENEMY_RADIUS`, `inSquareRange`, `squareRange`, `selectTarget`. Pure modules, no engine, no browser.

**Purpose:** Quantify the win and guard against regression. It measures the two hot terms in isolation: (a) range-query cost, brute `filter` vs grid `queryRange`+filter+sort; (b) stat cost, recompute-every-tick vs compute-once-then-reuse (a local model of the engine's epoch cache). Correctness is already proven by Task 1's equivalence tests and Task 3's site audit — this task is timing only.

- [ ] **Step 1: Write the benchmark**

Create `scripts/dev/bench-combat.mjs`. The systems modules are TypeScript; run this with the repo's TS-capable runner. Prefer `npx vitest` is not it — use `node --import tsx scripts/dev/bench-combat.mjs` (tsx is available via `npx tsx`). If `tsx` is unavailable, the reviewer/implementer may instead colocate the benchmark as a `bench-combat.test.ts` guarded by `describe.skip` and run it on demand; keep the logic identical.

```js
// Pure combat-hot-path micro-benchmark. No engine, no browser.
//   npx tsx scripts/dev/bench-combat.mjs
import { buildSpatialGrid, MAX_ENEMY_RADIUS } from '../../lib/game/systems/spatial-grid.ts';
import { inSquareRange, squareRange } from '../../lib/game/systems/geometry.ts';
import { selectTarget } from '../../lib/game/systems/targeting.ts';

const W = 1728, H = 768, GRID = 32, CELL = GRID * 3;
const radius = (e) => (e.isBoss ? 28 : 13);

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const PATH = Array.from({ length: 40 }, (_, i) => ({ x: i * 40, y: 384 }));

function board(rng, nTowers, nEnemies) {
  const enemies = Array.from({ length: nEnemies }, (_, i) => ({
    id: `e${i}`, x: rng() * W, y: rng() * H, hp: 1 + ((rng() * 500) | 0),
    pathIndex: (rng() * 30) | 0, isBoss: rng() < 0.1,
    slowTimer: 0, stunTimer: 0, vulnTimer: 0, dots: undefined,
  }));
  const towers = Array.from({ length: nTowers }, () => ({
    x: rng() * W, y: rng() * H, range: 60 + rng() * 220,
  }));
  return { enemies, towers };
}

function timeIt(label, fn, iters) {
  fn(); // warm
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const ms = (performance.now() - t0) / iters;
  console.log(`${label.padEnd(28)} ${ms.toFixed(3)} ms/frame`);
  return ms;
}

for (const [nT, nE] of [[40, 150], [80, 300], [120, 500]]) {
  const rng = mulberry32(42);
  const { enemies, towers } = board(rng, nT, nE);
  const order = new Map(enemies.map((e, i) => [e.id, i]));
  console.log(`\n=== ${nT} towers × ${nE} enemies ===`);

  const brute = () => {
    for (const tw of towers) {
      const half = squareRange(tw.range, GRID);
      const pool = enemies.filter(e => inSquareRange(e.x, e.y, tw.x, tw.y, half + radius(e)));
      selectTarget(pool, tw.x, tw.y, PATH, 'first');
    }
  };
  const gridded = () => {
    const grid = buildSpatialGrid(enemies, CELL, W, H);
    for (const tw of towers) {
      const half = squareRange(tw.range, GRID);
      const pool = grid.queryRange(tw.x, tw.y, half + MAX_ENEMY_RADIUS)
        .filter(e => inSquareRange(e.x, e.y, tw.x, tw.y, half + radius(e)));
      pool.sort((a, b) => order.get(a.id) - order.get(b.id));
      selectTarget(pool, tw.x, tw.y, PATH, 'first');
    }
  };
  const b = timeIt('range: brute filter', brute, 400);
  const g = timeIt('range: spatial grid', gridded, 400);
  console.log(`range speedup: ${(b / g).toFixed(2)}×`);
}
```

- [ ] **Step 2: Run it**

Run: `npx tsx scripts/dev/bench-combat.mjs`
Expected: prints ms/frame for brute vs grid at three board sizes and a speedup ratio; the grid should win at 300 and 500 enemies and the ratio grows with the board. Record the numbers in the SDD ledger / PR description.

- [ ] **Step 3: Gate (unchanged suite)**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: green — the benchmark is a standalone script, not part of the suite.

- [ ] **Step 4: Commit**

```bash
git add scripts/dev/bench-combat.mjs
git commit -m "perf: headless combat micro-benchmark (brute vs spatial grid)"
```

---

## Self-Review

- **Spec coverage:** Block 1 (spatial grid) → Tasks 1-2. Block 2 (stat cache + full invalidation list, incl. the two time-based expiries plus the prayer-depletion one found in code) → Task 3. Block 3 (benchmark + gate) → Task 4 + the per-task gates. Bit-identical constraint → Task 1's equivalence test is the load-bearing proof; Task 2 changes only the pool source and re-sorts to `this.enemies` order.
- **Placeholder scan:** none — every step carries real code or a concrete command.
- **Type consistency:** `buildSpatialGrid(enemies, cell, width, height)` and `queryRange(x, y, half)` are used identically in Tasks 1, 2, 4. `MAX_ENEMY_RADIUS = 28` matches `enemyRadius`'s boss value. `ComputedTowerStats` is the existing return type of `calculateTowerStats`. `bumpCombatEpoch()` is public, matching its cross-subsystem callers.
- **Invalidation completeness:** the Task 3 table enumerates all eight bump sites with code, and states the verified exclusions (element/ancient/support, mageMode, equipment) so a reviewer can confirm nothing is missing rather than guess.

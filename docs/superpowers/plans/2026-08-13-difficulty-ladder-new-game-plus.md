# Difficulty Ladder (New Game+) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vertical difficulty ladder (New Game+) where winning a tier unlocks the next harder one, orthogonal to game mode, reusing the existing victory + enemy-scaling machinery, rewarding only non-monetary records.

**Architecture:** A new pure module `systems/difficulty.ts` holds the tier table and unlock math (unit-tested). `scaleEnemyStats` gains an optional difficulty argument so tier HP/speed/gold flow through the one place enemy stats are computed. The engine holds a `difficultyTier` field (persists across `restart` like `gameMode`), applies its lives delta and enemy mults at run start, and emits the cleared `(mode, tier)` on victory. `GameRoot` persists a new `osrs_td_difficulty` store, renders a tier selector on the start screen, and adds a Difficulty collection-log entry. Tier 0 (Normal) is byte-for-byte today's game, guaranteed by identity mods + default args + a test.

**Tech Stack:** TypeScript, Next.js static export, Vitest (pure `systems/` only), the game's imperative `GameEngine` + React `GameRoot` bridge.

## Global Constraints

- Reply to the user in **Brazilian Portuguese**; every in-game UI string and all code identifiers stay in **English**.
- **Assets only from the local OSRS cache** — never hot-link, invent a placeholder, or distort a sprite. This feature needs no new sprite (tier names render as typographic marks, like the existing `★ Champion`).
- Rewards are **non-monetary** — never inflate gold. The gold lever only ever *reduces* the reward multiplier.
- **Tier 0 (Normal) must be byte-for-byte today's game.** Guaranteed by identity mods + default args; test-enforced.
- Tier names are the **real OSRS Combat Achievement tiers** (Normal/Easy/Medium/Hard/Elite/Master/Grandmaster) — a real OSRS progression, never invented.
- The board is a **fixed logic resolution** identical for every player; nothing here touches board sizing, the fit effect, or `paintedBox`.
- Every floating panel over the board is a `MovablePanel`; the start screen is a full-screen overlay, not a board panel, so this does not apply to the tier selector.
- The **tutorial mirrors the UI**: `LEARN_STEPS` and `TLDR` in `GameRoot.tsx` must both gain the difficulty line (game-ui tutorial-mirror rule).
- Verify with the `game-verify` gate: `npx tsc --noEmit` → `npx vitest run` → `npm run build`. Engine/GameRoot have no unit tests — drive the game headlessly (game-verifier subagent) for UI/wiring tasks. **Balance/tuning of the numbers is the user's job — never a verification step, never a suggested playtest checklist.**
- Do not push to any remote and never merge to `main`; going live is the user's explicit call.

---

### Task 1: Pure difficulty module

**Files:**
- Create: `lib/game/systems/difficulty.ts`
- Test: `lib/game/systems/difficulty.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `type DifficultyTier = 0 | 1 | 2 | 3 | 4 | 5 | 6`
  - `interface TierMods { enemyHp: number; enemySpeed: number; gold: number; livesDelta: number }`
  - `const DIFFICULTY_TIERS: readonly { id: DifficultyTier; name: string; mods: TierMods }[]`
  - `const MIN_LIVES = 5`
  - `const MAX_TIER: DifficultyTier = 6`
  - `function tierMods(tier: DifficultyTier): TierMods` — tier 0 = identity
  - `function highestUnlockedTier(highestCleared: number): DifficultyTier` — `clamp(highestCleared + 1, 0, 6)`
  - `function isTierUnlocked(tier: DifficultyTier, highestCleared: number): boolean`
  - `function clampTier(n: number): DifficultyTier` — coerce any number to a valid tier id (defence for stored/injected values)
  - `function effectiveStartLives(baseLives: number, tier: DifficultyTier): number` — `Math.max(MIN_LIVES, baseLives + tierMods(tier).livesDelta)`; the run-start lives floor lives here (one tested place), and Task 4's engine calls it instead of inlining the clamp. The raw table may hold aggressive `livesDelta` values (e.g. Grandmaster −20 with START_LIVES 20 → clamped to 5); the floor, not the table, guarantees winnability.

- [ ] **Step 1: Write the failing test**

Create `lib/game/systems/difficulty.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY_TIERS, MIN_LIVES, MAX_TIER,
  tierMods, highestUnlockedTier, isTierUnlocked, clampTier, effectiveStartLives,
  type DifficultyTier,
} from './difficulty';

const TIERS: DifficultyTier[] = [0, 1, 2, 3, 4, 5, 6];

describe('difficulty tiers', () => {
  it('has one row per tier id, in order, named after CA tiers', () => {
    expect(DIFFICULTY_TIERS.map((t) => t.id)).toEqual(TIERS);
    expect(DIFFICULTY_TIERS.map((t) => t.name)).toEqual([
      'Normal', 'Easy', 'Medium', 'Hard', 'Elite', 'Master', 'Grandmaster',
    ]);
  });

  it('tier 0 is the identity (today\'s game, unchanged)', () => {
    expect(tierMods(0)).toEqual({ enemyHp: 1, enemySpeed: 1, gold: 1, livesDelta: 0 });
  });

  it('is monotonic non-decreasing in difficulty across the ladder', () => {
    for (let i = 1; i < TIERS.length; i++) {
      const prev = tierMods(TIERS[i - 1]);
      const cur = tierMods(TIERS[i]);
      expect(cur.enemyHp).toBeGreaterThanOrEqual(prev.enemyHp);
      expect(cur.enemySpeed).toBeGreaterThanOrEqual(prev.enemySpeed);
      expect(cur.gold).toBeLessThanOrEqual(prev.gold);        // economy only tightens
      expect(cur.livesDelta).toBeLessThanOrEqual(prev.livesDelta); // lives only fall
    }
  });

  it('effectiveStartLives floors the raw table so no tier is unwinnable', () => {
    // START_LIVES is 20 in the engine. The raw table may cut aggressively
    // (Grandmaster −20 → 0), but the clamp keeps effective lives ≥ MIN_LIVES.
    const START_LIVES = 20;
    for (const t of TIERS) {
      expect(effectiveStartLives(START_LIVES, t)).toBeGreaterThanOrEqual(MIN_LIVES);
    }
    expect(effectiveStartLives(20, 0)).toBe(20);  // Normal: no cut
    expect(effectiveStartLives(20, 3)).toBe(15);  // Hard: −5, above the floor
    expect(effectiveStartLives(20, 6)).toBe(5);   // Grandmaster: −20 clamped up to 5
  });

  it('unlock math: nothing cleared exposes only Normal + Easy', () => {
    expect(highestUnlockedTier(-1)).toBe(0);
    expect(isTierUnlocked(0, -1)).toBe(true);
    expect(isTierUnlocked(1, -1)).toBe(false);
    // Clearing Normal (highestCleared 0) unlocks Easy (1).
    expect(highestUnlockedTier(0)).toBe(1);
    expect(isTierUnlocked(1, 0)).toBe(true);
    expect(isTierUnlocked(2, 0)).toBe(false);
  });

  it('unlock math: clearing Master exposes Grandmaster and caps there', () => {
    expect(highestUnlockedTier(5)).toBe(6);
    expect(highestUnlockedTier(6)).toBe(6);   // already maxed, no tier 7
    expect(highestUnlockedTier(99)).toBe(MAX_TIER);
    expect(isTierUnlocked(6, 5)).toBe(true);
  });

  it('clampTier coerces junk to a valid tier id', () => {
    expect(clampTier(-3)).toBe(0);
    expect(clampTier(4)).toBe(4);
    expect(clampTier(42)).toBe(6);
    expect(clampTier(2.9)).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/difficulty.test.ts`
Expected: FAIL — `Cannot find module './difficulty'`.

- [ ] **Step 3: Write the module**

Create `lib/game/systems/difficulty.ts`:

```ts
/**
 * The vertical difficulty ladder (New Game+). Winning a tier unlocks the next.
 * Tiers are named after the real OSRS Combat Achievement tiers. Tier 0 (Normal)
 * is the identity — byte-for-byte today's game — so the whole ladder is opt-in.
 *
 * Pure and unit-tested: the engine reads {@link tierMods} at run start and the UI
 * reads the unlock helpers. Every number here is the user's to tune, in one place.
 */

export type DifficultyTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TierMods {
  /** × on base enemy HP (≥ 1). Stacks with the per-wave and Endless HP terms. */
  enemyHp: number;
  /** × on base enemy speed (≥ 1). */
  enemySpeed: number;
  /** × on gold per kill (≤ 1) — a tighter economy, never inflated. */
  gold: number;
  /** Added to START_LIVES / maxLives at run start (≤ 0), floored at MIN_LIVES. */
  livesDelta: number;
}

/** Effective starting lives never drop below this — a tier is hard, never
 *  structurally unwinnable. Chosen against START_LIVES = 20. */
export const MIN_LIVES = 5;

export const MAX_TIER: DifficultyTier = 6;

/** The ladder. Numbers are illustrative shapes — tune freely; the monotonicity
 *  and identity invariants are what the tests protect. */
export const DIFFICULTY_TIERS: readonly { id: DifficultyTier; name: string; mods: TierMods }[] = [
  { id: 0, name: 'Normal',      mods: { enemyHp: 1.00, enemySpeed: 1.00, gold: 1.00, livesDelta: 0 } },
  { id: 1, name: 'Easy',        mods: { enemyHp: 1.15, enemySpeed: 1.00, gold: 0.95, livesDelta: 0 } },
  { id: 2, name: 'Medium',      mods: { enemyHp: 1.35, enemySpeed: 1.03, gold: 0.90, livesDelta: 0 } },
  { id: 3, name: 'Hard',        mods: { enemyHp: 1.60, enemySpeed: 1.05, gold: 0.85, livesDelta: -5 } },
  { id: 4, name: 'Elite',       mods: { enemyHp: 1.90, enemySpeed: 1.08, gold: 0.80, livesDelta: -10 } },
  { id: 5, name: 'Master',      mods: { enemyHp: 2.30, enemySpeed: 1.10, gold: 0.75, livesDelta: -15 } },
  { id: 6, name: 'Grandmaster', mods: { enemyHp: 2.80, enemySpeed: 1.12, gold: 0.70, livesDelta: -20 } },
] as const;

/** Coerce any number to a valid tier id (defence for stored / injected values). */
export function clampTier(n: number): DifficultyTier {
  const i = Math.max(0, Math.min(MAX_TIER, Math.floor(n)));
  return i as DifficultyTier;
}

/** Mods for a tier (tier 0 = identity). */
export function tierMods(tier: DifficultyTier): TierMods {
  return DIFFICULTY_TIERS[clampTier(tier)].mods;
}

/** The highest tier a player may select for a mode, given the highest they have
 *  cleared (-1 = nothing cleared): cleared + 1, capped at Grandmaster. */
export function highestUnlockedTier(highestCleared: number): DifficultyTier {
  return clampTier(highestCleared + 1);
}

/** Guard: is `tier` selectable given `highestCleared`? */
export function isTierUnlocked(tier: DifficultyTier, highestCleared: number): boolean {
  return tier <= highestUnlockedTier(highestCleared);
}

/** Starting lives for a run at `tier`, given the game's base START_LIVES. The
 *  floor lives here (one tested place) so the raw table can cut aggressively
 *  without ever making a tier unwinnable by construction. The engine calls this
 *  rather than inlining the clamp. */
export function effectiveStartLives(baseLives: number, tier: DifficultyTier): number {
  return Math.max(MIN_LIVES, baseLives + tierMods(tier).livesDelta);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/game/systems/difficulty.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/game/systems/difficulty.ts lib/game/systems/difficulty.test.ts
git commit -m "feat: pure difficulty-ladder module (tiers, mods, unlock math)"
```

---

### Task 2: Thread difficulty multipliers through `scaleEnemyStats`

**Files:**
- Modify: `lib/game/systems/enemy-scaling.ts:60-70`
- Test: `lib/game/systems/enemy-scaling.test.ts` (add cases; create if absent)

**Interfaces:**
- Consumes: nothing new.
- Produces: `scaleEnemyStats(base, wave, endlessMult?, diff?)` where
  `diff: { hp: number; speed: number; reward: number } = { hp: 1, speed: 1, reward: 1 }`.
  The default arg keeps every existing caller and test unchanged.

- [ ] **Step 1: Write the failing test**

If `lib/game/systems/enemy-scaling.test.ts` exists, append; otherwise create it with the import block below plus these cases. Add:

```ts
import { scaleEnemyStats } from './enemy-scaling';

describe('scaleEnemyStats — difficulty multipliers', () => {
  const base = { hp: 100, speed: 40, reward: 10 };

  it('omitting diff is identical to today (default arg = identity)', () => {
    const withDefault = scaleEnemyStats(base, 5);
    const withIdentity = scaleEnemyStats(base, 5, 1, { hp: 1, speed: 1, reward: 1 });
    expect(withDefault).toEqual(withIdentity);
  });

  it('applies hp / speed / reward diff multipliers, floored', () => {
    const plain = scaleEnemyStats(base, 5);
    const diffed = scaleEnemyStats(base, 5, 1, { hp: 2, speed: 1.5, reward: 0.5 });
    // hp scales up, reward scales down, speed scales up — each floored independently.
    expect(diffed.hp).toBe(Math.floor((plain.hp / 1) * 2)); // see note below
    expect(diffed.hp).toBeGreaterThan(plain.hp);
    expect(diffed.reward).toBeLessThan(plain.reward);
    expect(diffed.speed).toBeGreaterThan(plain.speed);
  });

  it('diff.hp stacks multiplicatively with the endless term', () => {
    const a = scaleEnemyStats(base, 20, 1.5, { hp: 2, speed: 1, reward: 1 });
    const b = scaleEnemyStats(base, 20, 1.5, { hp: 1, speed: 1, reward: 1 });
    expect(a.hp).toBeGreaterThan(b.hp);
  });
});
```

Note on the exact-value assertion: because the base function floors *after* multiplying, assert the direction and the recomputed floored value directly rather than dividing a floored result. Prefer:

```ts
    expect(diffed.hp).toBe(Math.floor(base.hp * (plainHpMult) * 2));
```

where `plainHpMult` you can read from the exported `hpScaleForWave(5)`. Import `hpScaleForWave` and compute the expected value exactly: `Math.floor(base.hp * hpScaleForWave(5) * 1 * 2)`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/enemy-scaling.test.ts`
Expected: FAIL — the 4-arg call and/or the multiplier assertions fail against the current 3-arg signature.

- [ ] **Step 3: Extend the function**

In `lib/game/systems/enemy-scaling.ts`, replace `scaleEnemyStats` (currently lines 60-70) with:

```ts
export function scaleEnemyStats(
  base: ScalableEnemyStats,
  wave: number,
  endlessMult = 1,
  diff: { hp: number; speed: number; reward: number } = { hp: 1, speed: 1, reward: 1 },
): ScalableEnemyStats {
  return {
    hp: Math.floor(base.hp * hpScaleForWave(wave) * endlessMult * diff.hp),
    speed: Math.floor(base.speed * (1 + (wave - 1) * 0.01) * diff.speed),
    reward: Math.floor(base.reward * (1 + (wave - 1) * 0.15) * diff.reward),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/enemy-scaling.test.ts`
Expected: PASS, and the pre-existing enemy-scaling cases stay green (default arg unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/game/systems/enemy-scaling.ts lib/game/systems/enemy-scaling.test.ts
git commit -m "feat: optional difficulty multipliers on scaleEnemyStats (identity default)"
```

---

### Task 3: Persist `difficultyTier` in the in-progress run save

**Files:**
- Modify: `lib/game/systems/run-save.ts` (interface `RunSave`; `RUN_SAVE_VERSION`; `sanitizeRunSave`)
- Test: `lib/game/systems/run-save.test.ts` (add cases; create if absent)

**Interfaces:**
- Consumes: `DifficultyTier`, `clampTier` from `./difficulty` (Task 1).
- Produces: `RunSave.difficultyTier: DifficultyTier`; `RUN_SAVE_VERSION = 3`.

- [ ] **Step 1: Write the failing test**

Add to `lib/game/systems/run-save.test.ts` (build a minimal valid raw save; a run save requires `towers` (array with `id`/`type`/finite `x`/`y`), `runMods`, `runFx`, `relicFx` objects, and `version === RUN_SAVE_VERSION`):

```ts
import { sanitizeRunSave, RUN_SAVE_VERSION } from './run-save';

function validRaw(over: Record<string, unknown> = {}) {
  return {
    version: RUN_SAVE_VERSION,
    towers: [{ id: 't1', type: 'archer', x: 10, y: 10 }],
    runMods: {}, runFx: {}, relicFx: {},
    gameMode: 'classic', wave: 5, money: 100, maxLives: 20, lives: 20,
    ...over,
  };
}

describe('run-save — difficultyTier', () => {
  it('round-trips a valid difficultyTier', () => {
    const save = sanitizeRunSave(validRaw({ difficultyTier: 3 }));
    expect(save?.difficultyTier).toBe(3);
  });

  it('defaults a missing difficultyTier to 0 (old save = Normal)', () => {
    const save = sanitizeRunSave(validRaw({}));
    expect(save?.difficultyTier).toBe(0);
  });

  it('clamps an out-of-range difficultyTier', () => {
    expect(sanitizeRunSave(validRaw({ difficultyTier: 99 }))?.difficultyTier).toBe(6);
    expect(sanitizeRunSave(validRaw({ difficultyTier: -4 }))?.difficultyTier).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/run-save.test.ts`
Expected: FAIL — `difficultyTier` is `undefined` on the returned save.

- [ ] **Step 3: Add the field, bump the version, sanitize it**

In `lib/game/systems/run-save.ts`:

Add the import at the top (alongside the existing type imports):

```ts
import { clampTier, type DifficultyTier } from './difficulty';
```

Add the field to the `RunSave` interface (near `gameMode`):

```ts
  gameMode: GameMode;
  /** The New Game+ tier this run is being played at. Absent on saves written
   *  before the ladder shipped → they resume at tier 0 (Normal). */
  difficultyTier: DifficultyTier;
```

Bump the version constant:

```ts
export const RUN_SAVE_VERSION = 3;
```

In `sanitizeRunSave`, add to the returned object (next to `gameMode:`):

```ts
    gameMode: raw.gameMode === 'classic' ? 'classic' : 'roguelite',
    difficultyTier: clampTier(num(raw.difficultyTier, 0)),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/run-save.test.ts`
Expected: PASS. (The version bump means any older-format test fixtures are rejected — that is the intended behaviour; update any fixture that hard-codes `version: 2` to `RUN_SAVE_VERSION`.)

- [ ] **Step 5: Commit**

```bash
git add lib/game/systems/run-save.ts lib/game/systems/run-save.test.ts
git commit -m "feat: persist difficultyTier in the run save (version 3, defaults to 0)"
```

---

### Task 4: Engine — hold the tier, apply it, emit it

**Files:**
- Modify: `lib/game/core/engine.ts`
  - imports (~line 12): add `difficulty` imports
  - `UIState` interface (~line 365, near `gameMode: GameMode;`): add `difficultyTier` + extend the `victory` shape
  - new field near `gameMode` (~line 701)
  - `restart()` (~5591-5612): apply `livesDelta`
  - both `scaleEnemyStats` call sites (~2714, ~2786): pass the tier enemy mults
  - `snapshot()` victory + gameMode emit (~1072-1078, ~1126): emit `difficultyTier` and `victory.tier`
  - new `setDifficultyTier` (after `setMode`, ~5288)
  - `snapshotRun()` (~5452): write `difficultyTier`
  - `loadRun()` (~5512): restore `difficultyTier`

**Interfaces:**
- Consumes: `tierMods`, `clampTier`, `highestUnlockedTier`, `DifficultyTier` from `../systems/difficulty`; the extended `scaleEnemyStats` (Task 2); `RunSave.difficultyTier` (Task 3).
- Produces: `engine.difficultyTier`, `engine.setDifficultyTier(tier)`, `UIState.difficultyTier`, `UIState.victory.tier`.

No unit tests (engine is untested); verify via the gate + a headless drive in Task 6's verification. Each step below is a discrete edit — after all edits, Step 9 typechecks.

- [ ] **Step 1: Imports**

At `lib/game/core/engine.ts:12`, alongside the enemy-scaling import, add:

```ts
import { scaleEnemyStats, endlessHpMult } from '../systems/enemy-scaling';
import { tierMods, clampTier, highestUnlockedTier, effectiveStartLives, type DifficultyTier } from '../systems/difficulty';
```

- [ ] **Step 2: The field**

Near the `gameMode` field (~line 701), add:

```ts
  /** The New Game+ tier this run is played at. Like {@link gameMode}, it belongs
   *  to the whole run: set before wave 1 via {@link setDifficultyTier} and it
   *  persists across {@link restart}. Tier 0 (Normal) is today's game exactly. */
  difficultyTier: DifficultyTier = 0;
```

- [ ] **Step 3: Cache the enemy mults as a getter**

Add a small private helper near the other run-derived getters so both spawn paths and the preview read one source (place it just above `snapshotRun` or near the combat helpers):

```ts
  /** Enemy stat multipliers for the current run's difficulty tier — passed into
   *  scaleEnemyStats at every spawn / preview. Tier 0 returns all-ones. */
  private get diffEnemyMults(): { hp: number; speed: number; reward: number } {
    const m = tierMods(this.difficultyTier);
    return { hp: m.enemyHp, speed: m.enemySpeed, reward: m.gold };
  }
```

- [ ] **Step 4: Pass the mults at both call sites**

At ~2714 (spawn):

```ts
        ? scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, this.wave, endless, this.diffEnemyMults)
```

At ~2786 (wave preview):

```ts
    const scaled = scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, wave, endless, this.diffEnemyMults);
```

(Read the exact current lines — line 2714 is inside a ternary; keep the surrounding structure, only append the 4th argument.)

- [ ] **Step 5: Apply the lives delta in `restart()`**

In `restart()`, replace the two lives lines (5606-5607):

```ts
    this.lives = START_LIVES;
    this.maxLives = START_LIVES;
```

with:

```ts
    // The difficulty tier is a run-wide lever set before wave 1; it persists
    // across restart (like gameMode). effectiveStartLives applies its lives
    // delta and floors it, so a tier is hard, never structurally unwinnable.
    const startLives = effectiveStartLives(START_LIVES, this.difficultyTier);
    this.lives = startLives;
    this.maxLives = startLives;
```

(`effectiveStartLives` is already imported in Step 1 — no `MIN_LIVES` import needed in the engine; the floor is encapsulated in the helper.)

- [ ] **Step 6: `setDifficultyTier` (mirror of `setMode`)**

Immediately after `setMode` (ends ~5288), add:

```ts
  /** Choose the New Game+ tier for the next run. Like {@link setMode}, only
   *  honoured before wave 1 begins. Clamps against what the mode has unlocked as
   *  defence-in-depth, then restarts so the run boots at the chosen difficulty. */
  setDifficultyTier(tier: DifficultyTier, highestCleared: number) {
    const wanted = clampTier(tier);
    const allowed = Math.min(wanted, highestUnlockedTier(highestCleared)) as DifficultyTier;
    if (allowed === this.difficultyTier) return;
    if (this.wave !== 1 || this.waveActive) { this.notify('Finish the run to change difficulty'); return; }
    this.difficultyTier = allowed;
    this.restart();
  }
```

- [ ] **Step 7: Emit it in `snapshot()`**

In `snapshot()`, next to `gameMode: this.gameMode,` (~1126) add:

```ts
      gameMode: this.gameMode,
      difficultyTier: this.difficultyTier,
```

And extend the `victory` object (~1072-1078) to carry the tier:

```ts
      victory: this.won
        ? {
            wave: this.victoryWave,
            seconds: this.runSeconds,
            bosses: Object.keys(this.bossesKilledThisRun).length,
            mode: this.gameMode,
            tier: this.difficultyTier,
          }
        : null,
```

- [ ] **Step 8: Extend `UIState` + persist in the run save**

In the `UIState` interface, near `gameMode: GameMode;` (~365), add `difficultyTier: DifficultyTier;` and add `tier: DifficultyTier;` to the inline `victory` object's type (find the `victory:` field on `UIState` and add the property to match the emitted shape).

Also seed the initial UIState constant (`INITIAL`/default UIState around line 294 in `GameRoot.tsx` is separate — that is Task 5; here only the engine-side `UIState` type changes).

In `snapshotRun()` (~5452), next to `gameMode: this.gameMode,` add:

```ts
      gameMode: this.gameMode,
      difficultyTier: this.difficultyTier,
```

In `loadRun()` (~5512), next to `this.gameMode = save.gameMode;` add:

```ts
    this.gameMode = save.gameMode;
    this.difficultyTier = save.difficultyTier;
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `UIState` is emitted anywhere with an object literal that must now include `difficultyTier`, the excess/missing-property check will point at it — add the key there too.

- [ ] **Step 10: Commit**

```bash
git add lib/game/core/engine.ts
git commit -m "feat: engine holds/applies/emits the difficulty tier (lives, enemy mults, save)"
```

---

### Task 5: GameRoot — persist progress, record wins, tier selector

**Files:**
- Modify: `components/game/GameRoot.tsx`
  - `SAVE_KEYS` (~331): add `difficulty` key
  - default UIState literal (~294): add `difficultyTier: 0`
  - new `DifficultyProgress` type + `EMPTY_DIFFICULTY` + `loadDifficulty()` (near `Victories`, ~336-353)
  - state + load effect (near `victories` state, ~655-656)
  - victory-record effect (~917-932): also update `osrs_td_difficulty`
  - `StartScreen` props + tier selector JSX (~4545 onward)
  - the `StartScreen` call site (~3207-3212): pass difficulty props + `onSelectTier`

**Interfaces:**
- Consumes: `DIFFICULTY_TIERS`, `highestUnlockedTier`, `isTierUnlocked`, `type DifficultyTier` from `lib/game/systems/difficulty`; `engine.setDifficultyTier`; `ui.difficultyTier`; `ui.victory.tier`.
- Produces: `osrs_td_difficulty` store shape (below), a start-screen tier selector.

No unit tests; verify via the gate + headless (Step 8).

- [ ] **Step 1: Storage key + progress type + loader**

Add `difficulty: 'osrs_td_difficulty'` to the `SAVE_KEYS` object (~331).

Near the `Victories` type (~336), add:

```ts
/** New Game+ progress — a non-monetary meta record kept separate from Victories
 *  so the already-validated Victories store is untouched. Highest tier cleared
 *  per mode (-1 = nothing cleared → only Normal selectable), plus best records. */
type DifficultyProgress = {
  highestCleared: { classic: number; roguelite: number };
  records: Record<string /* `${mode}:${tier}` */, { fastestSeconds: number | null; highestEndlessWave: number }>;
};
const EMPTY_DIFFICULTY: DifficultyProgress = {
  highestCleared: { classic: -1, roguelite: -1 },
  records: {},
};

function loadDifficulty(): DifficultyProgress {
  if (typeof window === 'undefined') return EMPTY_DIFFICULTY;
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEYS.difficulty) ?? 'null');
    if (raw && typeof raw === 'object') {
      return {
        ...EMPTY_DIFFICULTY,
        ...raw,
        highestCleared: { ...EMPTY_DIFFICULTY.highestCleared, ...(raw.highestCleared ?? {}) },
        records: { ...(raw.records ?? {}) },
      };
    }
  } catch { /* ignore */ }
  return EMPTY_DIFFICULTY;
}
```

- [ ] **Step 2: Default UIState + state hook**

In the default UIState literal (~294), add `difficultyTier: 0,` (matching the engine `UIState` type).

Near the `victories` state (~655), add:

```ts
  const [difficulty, setDifficulty] = useState<DifficultyProgress>(EMPTY_DIFFICULTY);
  useEffect(() => { setDifficulty(loadDifficulty()); }, []);
  // The tier the player has selected on the start screen for the current mode.
  const [selectedTier, setSelectedTier] = useState<DifficultyTier>(0);
```

- [ ] **Step 3: Record the tier on victory**

Extend the existing victory-record effect (~917-932). After the `setVictories(...)` block, still inside the same effect (it already reads `const { seconds, mode } = ui.victory;`), add a `tier` read and a difficulty update:

```ts
    const { seconds, mode, tier } = ui.victory;
    // ...existing setVictories(...) block stays as-is...
    setDifficulty((d) => {
      const key = `${mode}:${tier}`;
      const prev = d.records[key] ?? { fastestSeconds: null, highestEndlessWave: 0 };
      const next: DifficultyProgress = {
        highestCleared: { ...d.highestCleared, [mode]: Math.max(d.highestCleared[mode], tier) },
        records: {
          ...d.records,
          [key]: {
            fastestSeconds: prev.fastestSeconds == null ? seconds : Math.min(prev.fastestSeconds, seconds),
            highestEndlessWave: prev.highestEndlessWave,
          },
        },
      };
      try { localStorage.setItem(SAVE_KEYS.difficulty, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
```

Also extend the Endless-loss effect (~936-944) to fold `highestEndlessWave` into the `(mode, tier)` record, keyed by `ui.gameMode` + `ui.difficultyTier`:

```ts
  useEffect(() => {
    if (!ui.gameOver || ui.runPhase !== 'endless') return;
    const key = `${ui.gameMode}:${ui.difficultyTier}`;
    setDifficulty((d) => {
      const prev = d.records[key] ?? { fastestSeconds: null, highestEndlessWave: 0 };
      if (ui.wave <= prev.highestEndlessWave) return d;
      const next = { ...d, records: { ...d.records, [key]: { ...prev, highestEndlessWave: ui.wave } } };
      try { localStorage.setItem(SAVE_KEYS.difficulty, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [ui.gameOver, ui.runPhase, ui.wave, ui.gameMode, ui.difficultyTier]);
```

(Leave the existing Victories `highestEndlessWave` effect in place — the two stores track the stat independently.)

- [ ] **Step 4: Default the selected tier to the mode's highest unlocked**

Add an effect that, whenever the mode or the loaded progress changes and the run has not started, re-seeds `selectedTier` to that mode's highest unlocked tier (returning players resume at their level, freely lowerable):

```ts
  useEffect(() => {
    if (runStarted) return;
    const cleared = difficulty.highestCleared[ui.gameMode];
    setSelectedTier(highestUnlockedTier(cleared));
  }, [ui.gameMode, difficulty, runStarted]);
```

- [ ] **Step 5: Thread the tier into `setDifficultyTier`**

The engine's `setDifficultyTier(tier, highestCleared)` needs the mode's cleared count. Add a handler in GameRoot that the selector calls:

```ts
  const chooseTier = (t: DifficultyTier) => {
    setSelectedTier(t);
    engineRef.current?.setDifficultyTier(t, difficulty.highestCleared[ui.gameMode]);
  };
```

- [ ] **Step 6: Tier selector in `StartScreen`**

Extend `StartScreen`'s props:

```ts
function StartScreen({ mode, saved, champion, wins, difficulty, selectedTier, onSelect, onSelectTier, onStart, onContinue, onDiscard, onHelp }: {
  mode: GameMode;
  saved: RunSave | null;
  champion: boolean;
  wins: number;
  difficulty: DifficultyProgress;
  selectedTier: DifficultyTier;
  onSelect: (m: GameMode) => void;
  onSelectTier: (t: DifficultyTier) => void;
  onStart: () => void;
  onContinue: () => void;
  onDiscard: () => void;
  onHelp: () => void;
}) {
```

After the mode cards, before the Start button, render the ladder (hidden in `compact`/resume mode, mirroring how the mode blurbs are dropped there). Unlocked tiers are selectable; the first locked tier shows a 🔒 target; deeper locked tiers are dimmed:

```tsx
{!compact && (
  <div className="rs-panel-inset p-[0.6em] mt-[0.8em]">
    <div className="text-[0.72em] text-[#cdbe91] uppercase tracking-wide mb-[0.5em]">Difficulty</div>
    <div className="flex flex-wrap gap-[0.35em]">
      {DIFFICULTY_TIERS.map((t) => {
        const cleared = difficulty.highestCleared[mode];
        const unlocked = isTierUnlocked(t.id, cleared);
        const nextTarget = t.id === highestUnlockedTier(cleared) && !isTierUnlocked(t.id, cleared);
        const on = t.id === selectedTier;
        return (
          <button
            key={t.id}
            disabled={!unlocked}
            className={`rs-tab px-[0.7em] py-[0.3em] text-[0.8em] ${on ? 'rs-tab-on' : ''} ${!unlocked ? 'opacity-40' : ''}`}
            title={unlocked ? `Play at ${t.name}` : `Locked — win the tier below to unlock ${t.name}`}
            onClick={() => unlocked && onSelectTier(t.id)}
          >
            {!unlocked && '🔒 '}{t.name}
          </button>
        );
      })}
    </div>
    <div className="text-[0.68em] text-[#a89870] mt-[0.5em] leading-snug">
      Win a tier to unlock the next. Higher tiers give tougher enemies and a
      tighter economy — the reward is the record, not power.
    </div>
  </div>
)}
```

(Use the real `rs-tab` / `rs-tab-on` classes — the same "stone" language as the mode pills. Verify the exact class names against `app/globals.css`; if the mode cards use a different selectable-pill class, match that instead. The `nextTarget` local is illustrative — drop it if unused, or use it to accentuate the single next 🔒.)

- [ ] **Step 7: Pass the props at the call site**

At the `StartScreen` usage (~3207), add:

```tsx
<StartScreen
  mode={ui.gameMode}
  saved={savedRun}
  champion={victories.total > 0}
  wins={victories.total}
  difficulty={difficulty}
  selectedTier={selectedTier}
  onSelect={(m) => engineRef.current?.setMode(m)}
  onSelectTier={chooseTier}
  onStart={() => { clearRunSave(); setSavedRun(null); setRunStarted(true); }}
  onContinue={() => { /* unchanged */ }}
  onDiscard={() => { clearRunSave(); setSavedRun(null); }}
  ...
/>
```

- [ ] **Step 8: Verify (gate + headless)**

Run the gate:

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Then drive it headless (game-verifier subagent, or a throwaway `scripts/dev/tmp-*.mjs` deleted after): with `skipRun: true`, assert the start screen renders 7 difficulty pills, only `Normal` is enabled on a fresh profile (localStorage cleared), and the higher ones are `disabled`. Then, seeding `localStorage['osrs_td_difficulty'] = JSON.stringify({ highestCleared: { classic: 2, roguelite: -1 }, records: {} })` and reloading, assert `Normal…Hard` are enabled in Classic and switching to Roguelite re-gates to only `Normal`. Report the actual counts observed — not "looks right".

- [ ] **Step 9: Commit**

```bash
git add components/game/GameRoot.tsx
git commit -m "feat: New Game+ tier selector + per-mode difficulty progress store"
```

---

### Task 6: Collection-log Difficulty entry + tutorial mirror

**Files:**
- Modify: `components/game/GameRoot.tsx`
  - the collection-log tabs + `LogDetail`/Victories rendering (~5115-5300)
  - `LEARN_STEPS` (~4217) and `TLDR` (~4311)

**Interfaces:**
- Consumes: `DifficultyProgress` (Task 5), `DIFFICULTY_TIERS`.
- Produces: a Difficulty view in the collection log; a difficulty line in both tutorial surfaces.

- [ ] **Step 1: Read the collection-log structure**

Read the `CollectionLog` component and its tab list (around 5115-5300, where `isVictories` and the `victories` tab are handled). The Difficulty view reuses the same Victories-style layout (a record readout, no enemy grid), so model it on the `isVictories` branch.

- [ ] **Step 2: Add a Difficulty tab/view**

Add a `difficulty` tab beside `victories`. Its body lists, per mode, each tier row with: name (as the typographic mark — reuse the `text-osrs-yellow`/`★ Champion` styling for a *cleared* tier, dimmed for locked/uncleared), clear state, `fastestSeconds` (formatted like the Victories fastest time), and `highestEndlessWave` from `difficulty.records[`${mode}:${tier}`]`. No sprite is invented — the tier name *is* the mark. Pass `difficulty` into the `CollectionLog` component the same way `victories` is passed (~5119).

Example row shape (English UI strings):

```tsx
{DIFFICULTY_TIERS.map((t) => {
  const rec = difficulty.records[`${mode}:${t.id}`];
  const cleared = t.id <= difficulty.highestCleared[mode];
  return (
    <div key={t.id} className="flex items-center justify-between py-[0.3em]">
      <span className={cleared ? 'text-osrs-yellow font-bold' : 'text-[#8a7d5c]'}>
        {cleared ? '★ ' : ''}{t.name}
      </span>
      <span className="text-[0.8em] text-[#cdbe91]">
        {rec?.fastestSeconds != null ? fmtTime(rec.fastestSeconds) : '—'}
        {rec && rec.highestEndlessWave > 0 ? ` · Endless ${rec.highestEndlessWave}` : ''}
      </span>
    </div>
  );
})}
```

(Use the codebase's existing time formatter — find how the Victories tab renders `fastestSeconds` and reuse that exact helper rather than inventing `fmtTime`.)

- [ ] **Step 3: Tutorial mirror — LEARN_STEPS + TLDR**

The ladder is a start-screen concept, so no new `data-tut` board anchor. Add a difficulty line to **both** surfaces so they stay in sync (game-ui tutorial-mirror rule):

- In `LEARN_STEPS` (~4217), the existing `victory` step already teaches winning + Endless + the Victories tab. Extend its `body` with one sentence: winning a difficulty tier unlocks the next harder one, tracked in the Collection Log's Difficulty tab (non-monetary — the record, not power).
- In `TLDR` (~4311), extend the matching victory paragraph with the same fact in the cheat-sheet's voice.

Keep both in English; keep them describing the *same* real interface at different depth.

- [ ] **Step 4: Verify**

Gate: `npx tsc --noEmit && npx vitest run && npm run build`. Then headless: open the collection log, switch to the Difficulty tab, and confirm 7 rows per mode render with the seeded record (reuse the Task 5 seeding). Read the screenshot to confirm cleared tiers show the mark and locked ones are dimmed. Report what you saw.

- [ ] **Step 5: Commit**

```bash
git add components/game/GameRoot.tsx
git commit -m "feat: Difficulty collection-log entry + tutorial mirror line"
```

---

## Self-Review (completed at plan-authoring time)

- **Spec coverage:** ladder table + names (Task 1) · four levers (HP/speed/gold via Task 2 + engine Task 4; lives via Task 4) · per-mode unlock (Task 1 math + Task 5 store) · victory-unchanged (Task 4 reads existing `won`, never touches it) · run-save persistence (Task 3) · non-monetary reward (Task 6 collection-log entry) · start-screen selector (Task 5) · tutorial mirror (Task 6) · tier-0 identity (Tasks 1+2 tests) · lives floor (Task 1 test + Task 4 clamp) · defence-in-depth locked-tier clamp (Task 4 `setDifficultyTier`). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step carries real code. Two spots deliberately say "read the exact current line / find the existing helper" (engine ternary at 2714; the Victories time formatter) because the implementer must match surrounding structure — these are anchored, not vague.
- **Type consistency:** `DifficultyTier`, `TierMods`, `tierMods`, `highestUnlockedTier`, `isTierUnlocked`, `clampTier`, `MIN_LIVES`, `MAX_TIER` are defined in Task 1 and consumed with those exact names in Tasks 3-6. `scaleEnemyStats`'s 4th arg shape `{ hp, speed, reward }` matches `diffEnemyMults` (Task 4). `RunSave.difficultyTier` (Task 3) is read/written in Task 4. `DifficultyProgress` shape is identical in Tasks 5 and 6.
- **Non-goals honoured:** no horizontal mutators, no per-tier accumulating rules, no leak-cost scaling, no win-condition change.

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session via executing-plans, batch with checkpoints.

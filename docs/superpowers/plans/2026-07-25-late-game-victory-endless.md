# Late-game: Victory, Endless & a curve that overtakes — Implementation Plan (A1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a run a finish line — defeating every scheduled boss wins the run — then let the player continue into an Endless phase whose difficulty curve is reshaped so a static board is eventually overtaken by the threat.

**Architecture:** Two pure, unit-tested curve helpers (`endlessHpMult`, `softCapMult`) plus a per-run boss-march parameter added to the existing pure wave-generation. The engine gains four run-scoped fields (`bossesKilledThisRun`, `won`, `runPhase`, `victoryWave`), records boss kills, fires victory on wave-clear, and threads the Endless HP term into enemy scaling. `GameRoot.tsx` adds a victory stop-screen (mirroring the game-over overlay, **not** a MovablePanel), a non-monetary `osrs_td_victories` record, and mirrors it in the tutorial.

**Tech Stack:** TypeScript, Next.js (App Router, static export), Vitest for the pure `lib/game/systems/` layer. Canvas 2D engine (`lib/game/core/`). React bridge in `components/game/GameRoot.tsx`.

## Global Constraints

Copied verbatim from the spec (`docs/superpowers/specs/2026-07-25-late-game-victory-endless-design.md`) and the project standing rules. **Every task's requirements implicitly include this section.**

- Board is a fixed `1728×768`; game logic **never** depends on screen size, window size, or `devicePixelRatio`.
- Assets come **only** from the local OSRS cache; never hot-link an external host, never invent a placeholder. If an asset can't be sourced, ask.
- Rewards are **non-monetary**; never inflate gold. The victory reward is a record + a champion mark — no power, no gold.
- In-game strings stay in **English** regardless of conversation language.
- The tutorial mirrors the UI: `LEARN_STEPS` (contextual tips) **and** `TLDR` (How-to-Play cheat sheet), both in `GameRoot.tsx`, must describe any UI added. Change one, change the other.
- **Balance numbers are the user's to tune.** This plan fixes the *shapes* (monotonic, concave, bounded; exponential Endless term). The concrete constants below (`DAMAGE_MULT_CEILING = 8`, `ENDLESS_HP_BASE = 1.03`) are named, single-source-of-truth tuning knobs — put each in one exported const so the user can retune in one place.
- Pure logic lives in `lib/game/systems/` with a matching `*.test.ts`. The engine (`core/engine.ts`) and `GameRoot.tsx` carry **no** unit tests — verify those with the `game-verifier` agent (tsc + vitest + static export + headless drive), never by claiming a unit test covers them.
- Changelog convention: the commit type *is* the player-facing badge (`feat`→New, `balance`→Balanced, etc.). Pick the type by what the player perceives. See the `changelog-convention` skill.
- Verification gate for every task: `npx tsc --noEmit` + `npx vitest run` must stay green; `npm run build` (static export) must still succeed. Pure tasks add real unit tests; engine/UI tasks are driven headlessly.

## Current-state facts the implementer needs (verified against code)

- **Enemy HP scaling** is quadratic: `hpScaleForWave(wave) = baseHpScale(wave) * progressionHpMult(wave)`, both linear (`lib/game/systems/enemy-scaling.ts:38`). `scaleEnemyStats(base, wave)` floors hp/speed/reward (`:46`).
- **Player card damage** folds as an **unbounded product** per style: `damageMultiplier *= ctx.runMods.damage[s]` (`lib/game/systems/tower-combat.ts:208`), where `s` is `TOWER_STYLES[tower.type]?.style ?? 'melee'` (`:207`). `range`/`fireRate` fold the same way on the next two lines — **leave those untouched**; lever (a) targets damage only. `diminishingSum(bonuses, factor=0.5)` already lives in this file (`:66`) as the repo's precedent for concave stacking.
- **Boss schedule** (`lib/game/systems/wave-generation.ts`): `rollWaveBosses(wave, bossesSeen, rng)` (`:68`) picks the next lifetime-unseen boss on each 10th wave, then goes random once all are lifetime-seen. `SCHEDULABLE_BOSSES` is imported at `:3`. `isBossWave` (`:42`), `unseenBosses` (`:47`). `buildWaveConfigs` calls it at `:130`, gated on `opts.bossesSeen`. `BuildWaveOptions` is at `:5`.
- **Engine** (`lib/game/core/engine.ts`): run-scoped fields are declared around `:675–705` and `:775–781`; `bossesSeen` at `:781`. Boss kills land in the `!enemy.debug && !enemy.escort` block at `:4692–4708` (`this.kills += 1` at `:4696`). `checkWaveEnd()` at `:4843`; wave advances at `:4875`; the final `this.emit()` is `:4898`. `snapshot()` at `:909` (`gameOver: this.gameOver` at `:925`). `computeWaveConfigs()` at `:2408` passes `bossesSeen` at `:2422`. `scaleEnemyStats` is called in `wavePreview` (`:2443`, keyed off `this.wave`) and in `makeEnemy` (`:2513`, keyed off the `wave` arg). `restart()` at `:5252` resets run state (`this.wave = 1` at `:5281`, `this.realTime = 0` at `:5309`). `get runSeconds()` at `:772` exposes the run clock. `UIState` is defined at `:248`. `SCHEDULABLE_BOSSES` is **not yet** in the engine's `boss-mechanics` import block (`:55–68`) — Task 4 adds it.
- **GameRoot** (`components/game/GameRoot.tsx`): `UIState` default at `:262`; `SAVE_KEYS` at `:297` (`{ essence, upgrades, killCounts, cardCounts, bossesSeen, run }`); `loadSave()` at `:328`; the persistence effect writes each key around `:820–846`. The game-over overlay (the template for the victory screen) is `:2825–2857`; the start screen is `:2860–2874`. `GoStat`, `fmt`, `fmtTime`, `ASSETS`, `hideBrokenImg` are all in scope there.

---

### Task 1: `endlessHpMult` + Endless term in enemy scaling

**Files:**
- Modify: `lib/game/systems/enemy-scaling.ts`
- Test: `lib/game/systems/enemy-scaling.test.ts`

**Interfaces:**
- Produces: `export const ENDLESS_HP_BASE = 1.03;` · `export function endlessHpMult(wave: number, victoryWave: number): number` · `scaleEnemyStats(base, wave, endlessMult?: number)` (new optional 3rd param, default `1`, multiplies **hp only**).
- Consumed by: Task 4 (engine `makeEnemy` / `wavePreview`).

- [ ] **Step 1: Write the failing tests**

Append to `lib/game/systems/enemy-scaling.test.ts`:

```ts
import { endlessHpMult, ENDLESS_HP_BASE, scaleEnemyStats } from './enemy-scaling';

describe('endlessHpMult', () => {
  it('is exactly 1 up to and at the victory wave', () => {
    expect(endlessHpMult(50, 90)).toBe(1);
    expect(endlessHpMult(90, 90)).toBe(1);
  });

  it('strictly increases after the victory wave', () => {
    expect(endlessHpMult(91, 90)).toBeGreaterThan(1);
    expect(endlessHpMult(92, 90)).toBeGreaterThan(endlessHpMult(91, 90));
  });

  it('grows as ENDLESS_HP_BASE^(wavesPastVictory)', () => {
    expect(endlessHpMult(93, 90)).toBeCloseTo(ENDLESS_HP_BASE ** 3, 6);
  });

  it('eventually exceeds any constant', () => {
    expect(endlessHpMult(90 + 500, 90)).toBeGreaterThan(1000);
  });
});

describe('scaleEnemyStats endless term', () => {
  it('defaults to no endless bonus', () => {
    const base = { hp: 100, speed: 50, reward: 10 };
    expect(scaleEnemyStats(base, 30)).toEqual(scaleEnemyStats(base, 30, 1));
  });

  it('multiplies hp only, leaving speed and reward untouched', () => {
    const base = { hp: 100, speed: 50, reward: 10 };
    const plain = scaleEnemyStats(base, 30, 1);
    const endless = scaleEnemyStats(base, 30, 2);
    expect(endless.hp).toBe(Math.floor(plain.hp * 2 / 1)); // hp doubled pre-floor
    expect(endless.speed).toBe(plain.speed);
    expect(endless.reward).toBe(plain.reward);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/game/systems/enemy-scaling.test.ts`
Expected: FAIL — `endlessHpMult` is not exported; `scaleEnemyStats` takes 2 args.

- [ ] **Step 3: Implement**

In `lib/game/systems/enemy-scaling.ts`, add after `PROGRESSION_ANCHOR_MULT` (near `:10`):

```ts
/**
 * Endless-only HP acceleration. The normal run to victory is untouched — this is
 * exactly 1 up to and including the victory wave — then it climbs *exponentially*
 * in waves-past-victory. Paired with the bounded player-damage ceiling
 * (`softCapMult`), an exponential enemy term overtakes any fixed board with
 * certainty. `ENDLESS_HP_BASE` is a tuning knob (numbers are the user's to tune).
 */
export const ENDLESS_HP_BASE = 1.03;

export function endlessHpMult(wave: number, victoryWave: number): number {
  const past = wave - victoryWave;
  return past <= 0 ? 1 : ENDLESS_HP_BASE ** past;
}
```

Then change `scaleEnemyStats` (at `:46`) to take the endless multiplier and apply it to hp only:

```ts
export function scaleEnemyStats(
  base: ScalableEnemyStats,
  wave: number,
  endlessMult = 1,
): ScalableEnemyStats {
  return {
    hp: Math.floor(base.hp * hpScaleForWave(wave) * endlessMult),
    speed: Math.floor(base.speed * (1 + (wave - 1) * 0.01)),
    reward: Math.floor(base.reward * (1 + (wave - 1) * 0.15)),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/enemy-scaling.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game/systems/enemy-scaling.ts lib/game/systems/enemy-scaling.test.ts
git commit -m "feat: an Endless phase where enemy HP finally outruns the board"
```

---

### Task 2: `softCapMult` — a bounded ceiling on stacked card damage

**Files:**
- Create: `lib/game/systems/run-modifiers.ts`
- Modify: `lib/game/systems/tower-combat.ts:206-211`
- Test: `lib/game/systems/run-modifiers.test.ts`

**Interfaces:**
- Produces: `export const DAMAGE_MULT_CEILING = 8;` · `export function softCapMult(raw: number, ceiling?: number): number`.
- Consumed by: `tower-combat.ts` (the runMods damage fold).

**Design rationale (why the product soft-cap, not spec §4a's re-accumulation):** the spec's chosen shape is "concave, bounded, first-unit ≈ full value," and it listed *soft-capping the final product* as the considered alternative. Re-accumulating as an additive per-style sum would require changing `runMods` storage from a product to a sum, rippling through `applyStyleMult` (`engine.ts:5082`), `run-save.ts` serialization, `ui-diff.ts`, and `snapshot()`. Soft-capping the **product** at the single use site achieves the identical curve shape with none of that blast radius, so this plan takes it. `range`/`fireRate` folds are **not** touched — lever (a) is damage-only.

- [ ] **Step 1: Write the failing tests**

Create `lib/game/systems/run-modifiers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { softCapMult, DAMAGE_MULT_CEILING } from './run-modifiers';

describe('softCapMult', () => {
  it('is identity at 1 (no cards → no change)', () => {
    expect(softCapMult(1)).toBe(1);
  });

  it('passes penalties (<1) through untouched', () => {
    expect(softCapMult(0.7)).toBe(0.7);
  });

  it('gives early stacks nearly full value (first-unit ≈ full)', () => {
    // A single +20% card lands within 2% of its raw value.
    expect(softCapMult(1.2)).toBeGreaterThan(1.18);
    expect(softCapMult(1.2)).toBeLessThanOrEqual(1.2);
  });

  it('caps the upside below the raw product for large stacks', () => {
    expect(softCapMult(20)).toBeLessThan(20);
  });

  it('is strictly increasing', () => {
    expect(softCapMult(5)).toBeGreaterThan(softCapMult(3));
    expect(softCapMult(3)).toBeGreaterThan(softCapMult(1.5));
  });

  it('is concave (each further unit adds less)', () => {
    const d1 = softCapMult(2) - softCapMult(1);
    const d2 = softCapMult(3) - softCapMult(2);
    expect(d2).toBeLessThan(d1);
  });

  it('never reaches the ceiling but approaches it', () => {
    expect(softCapMult(1000)).toBeLessThan(DAMAGE_MULT_CEILING);
    expect(softCapMult(1000)).toBeGreaterThan(DAMAGE_MULT_CEILING - 0.01);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/game/systems/run-modifiers.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

Create `lib/game/systems/run-modifiers.ts`:

```ts
/**
 * The asymptotic ceiling on the *stacked card damage multiplier* per combat style.
 * A tuning knob (numbers are the user's to tune) — retune here, in one place.
 */
export const DAMAGE_MULT_CEILING = 8;

/**
 * Fold a raw stacked damage multiplier through a concave curve that approaches a
 * ceiling. Card damage folds as an unbounded product (`runMods.damage[style]`),
 * which is what let a long run's board out-scale enemy HP forever. This tapers it:
 *
 * - `raw <= 1` (no cards, or a net penalty) → returned unchanged; only the upside caps.
 * - the first units pay ≈ full value (the curve's slope at `raw = 1` is 1), so early
 *   cards still matter,
 * - and the effective multiplier rises monotonically and concavely toward `ceiling`
 *   without ever reaching it.
 *
 * Shape: `1 + (C-1)·(1 - e^{-(raw-1)/(C-1)})`. Pure.
 */
export function softCapMult(raw: number, ceiling = DAMAGE_MULT_CEILING): number {
  if (raw <= 1) return raw;
  const span = ceiling - 1;
  return 1 + span * (1 - Math.exp(-(raw - 1) / span));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/run-modifiers.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply it at the runMods damage fold**

In `lib/game/systems/tower-combat.ts`, add the import near the top (beside the other `./` imports):

```ts
import { softCapMult } from './run-modifiers';
```

Then change the damage line inside `if (ctx.runMods) {` (`:206-211`) — **only** the damage line:

```ts
  if (ctx.runMods) {
    const s = TOWER_STYLES[tower.type]?.style ?? 'melee';
    damageMultiplier *= softCapMult(ctx.runMods.damage[s]);
    rangeMultiplier *= ctx.runMods.range[s];
    speedMultiplier *= ctx.runMods.fireRate[s];
  }
```

- [ ] **Step 6: Run the full suite to verify nothing regressed**

Run: `npx vitest run lib/game/systems/tower-combat.test.ts lib/game/systems/run-modifiers.test.ts`
Expected: PASS. (Existing tower-combat tests that stack damage cards may assert the old unbounded product — if any fails, it is asserting the pre-cap behaviour: update that assertion to the softCapped value, do **not** weaken the new cap.)

- [ ] **Step 7: Commit**

```bash
git add lib/game/systems/run-modifiers.ts lib/game/systems/run-modifiers.test.ts lib/game/systems/tower-combat.ts
git commit -m "balance: stacked damage cards taper toward a ceiling instead of compounding forever"
```

---

### Task 3: Per-run boss march + a "run won" predicate

**Files:**
- Modify: `lib/game/systems/wave-generation.ts` (`BuildWaveOptions` `:5`, `rollWaveBosses` `:68`, `buildWaveConfigs` `:130`)
- Test: `lib/game/systems/wave-generation.test.ts`

**Interfaces:**
- Produces:
  - `export function allSchedulableBossesCleared(killedThisRun: Record<string, number>): boolean`
  - `rollWaveBosses(wave, bossesSeen, rng, killedThisRun?)` — new optional 4th param drives the ordered march per-run; when omitted, falls back to lifetime `bossesSeen` (legacy behaviour, keeps existing tests green).
  - `BuildWaveOptions.bossKillsThisRun?: Record<string, number>` — threaded into `rollWaveBosses`.
- Consumed by: Task 4 (engine passes `this.bossesKilledThisRun`, and calls `allSchedulableBossesCleared` for the victory check).

- [ ] **Step 1: Write the failing tests**

Append to `lib/game/systems/wave-generation.test.ts` (reuse the file's existing imports from `./wave-generation` and `./boss-mechanics`):

```ts
import { allSchedulableBossesCleared, rollWaveBosses } from './wave-generation';
import { SCHEDULABLE_BOSSES } from './boss-mechanics';

describe('per-run boss march', () => {
  const rng = () => 0; // deterministic

  it('marches a veteran through every boss in SCHEDULABLE_BOSSES order regardless of lifetime bossesSeen', () => {
    // Veteran: every boss lifetime-seen, so the *lifetime* schedule would go random.
    const seen: Record<string, number> = {};
    for (const b of SCHEDULABLE_BOSSES) seen[b] = 1;
    const killedThisRun: Record<string, number> = {};
    const got: string[] = [];
    for (let i = 0; i < SCHEDULABLE_BOSSES.length; i++) {
      const wave = (i + 1) * 10;
      const [boss] = rollWaveBosses(wave, seen, rng, killedThisRun);
      got.push(boss);
      killedThisRun[boss] = 1; // the engine records the kill before the next boss wave
    }
    expect(got).toEqual([...SCHEDULABLE_BOSSES]);
  });

  it('allSchedulableBossesCleared is true exactly when the last is met', () => {
    const killed: Record<string, number> = {};
    for (const b of SCHEDULABLE_BOSSES.slice(0, -1)) killed[b] = 1;
    expect(allSchedulableBossesCleared(killed)).toBe(false);
    killed[SCHEDULABLE_BOSSES[SCHEDULABLE_BOSSES.length - 1]] = 1;
    expect(allSchedulableBossesCleared(killed)).toBe(true);
  });

  it('falls back to lifetime bossesSeen when no per-run set is passed (legacy)', () => {
    const seen: Record<string, number> = {}; // new account, nothing seen
    const [boss] = rollWaveBosses(10, seen, rng);
    expect(boss).toBe(SCHEDULABLE_BOSSES[0]); // still the gentlest first
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/game/systems/wave-generation.test.ts`
Expected: FAIL — `allSchedulableBossesCleared` not exported; `rollWaveBosses` ignores a 4th arg.

- [ ] **Step 3: Implement**

In `lib/game/systems/wave-generation.ts`:

Add the predicate near `unseenBosses` (`:47`):

```ts
/** Whether every schedulable boss has been killed *this run* — the victory trigger. */
export function allSchedulableBossesCleared(killedThisRun: Record<string, number>): boolean {
  return SCHEDULABLE_BOSSES.every((b) => killedThisRun[b]);
}
```

Change `rollWaveBosses` (`:68`) to accept the per-run set and drive the ordered march off it:

```ts
export function rollWaveBosses(
  wave: number,
  bossesSeen: Record<string, number>,
  rng: () => number,
  killedThisRun?: Record<string, number>,
): EnemyType[] {
  if (wave < BOSS_WAVE_INTERVAL) return [];
  const pool = SCHEDULABLE_BOSSES as readonly EnemyType[];
  // Per-run march when provided (every run, veteran or not, meets bosses gentle→hard);
  // otherwise fall back to the lifetime schedule the legacy engine relies on.
  const marchSet = killedThisRun ?? bossesSeen;
  const unmet = (SCHEDULABLE_BOSSES as readonly EnemyType[]).filter((b) => !marchSet[b]);
  const pick = () => pool[Math.floor(rng() * pool.length)];
  const out: EnemyType[] = [];

  if (isBossWave(wave)) out.push(unmet.length ? unmet[0] : pick());

  // Extras are the endgame regime — only once nothing is left to meet this run,
  // and not before EXTRA_BOSS_MIN_WAVE, so the first boss wave is never a pile-up.
  if (!unmet.length && wave >= EXTRA_BOSS_MIN_WAVE && rng() < EXTRA_BOSS_CHANCE) {
    const extra = Math.floor(rng() * (EXTRA_BOSS_MAX + 1)); // 0..MAX, so it can whiff
    for (let i = 0; i < extra; i++) out.push(pick());
  }
  return out;
}
```

Add the option to `BuildWaveOptions` (after `bossesSeen?` at `:16`):

```ts
  /** Per-run boss kills (the engine's `bossesKilledThisRun`). Drives the ordered
   *  march so every run meets bosses gentle→hard; falls back to `bossesSeen` when
   *  omitted. */
  bossKillsThisRun?: Record<string, number>;
```

Thread it through the `buildWaveConfigs` call (`:130`):

```ts
  const bosses = opts.bossesSeen
    ? rollWaveBosses(waveNum, opts.bossesSeen, rng, opts.bossKillsThisRun)
    : [];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/wave-generation.test.ts`
Expected: PASS (new tests + all existing wave-generation tests, which pass no 4th arg and are unaffected).

- [ ] **Step 5: Commit**

```bash
git add lib/game/systems/wave-generation.ts lib/game/systems/wave-generation.test.ts
git commit -m "feat: every run marches through the whole boss roster, gentlest to hardest"
```

---

### Task 4: Engine spine — victory, Endless phase, boss-kill tracking

**Files:**
- Modify: `lib/game/core/engine.ts` (import `:55-68`; new fields near `:675`; `snapshot()` `:909`; `computeWaveConfigs` `:2413`; `wavePreview` `:2443`; `makeEnemy` `:2513`; boss-kill block `:4692`; `checkWaveEnd` `:4843`; `restart()` `:5252`; add `continueEndless()`)
- Modify: `lib/game/core/engine.ts` `UIState` (`:248`) — add `won`, `runPhase`, victory-summary keys
- Modify: `components/game/GameRoot.tsx` `UIState` default (`:262`) — seed the new keys

**Interfaces:**
- Consumes: `endlessHpMult` (Task 1), `allSchedulableBossesCleared` (Task 3), `SCHEDULABLE_BOSSES`.
- Produces (engine → UI, on `UIState`):
  - `won: boolean` · `runPhase: 'normal' | 'endless'`
  - `victory: { wave: number; seconds: number; bosses: number; mode: GameMode } | null` — the run summary shown on the stop-screen, null until won.
- Produces (engine methods for the UI): `continueEndless(): void` (dismiss the victory screen, `runPhase = 'endless'`, unpause).

**No unit test:** the engine is untested by design. Verification for this task is `npx tsc --noEmit`, `npx vitest run` (nothing should regress), `npm run build`, and the `game-verifier` agent driving a run to a scripted victory. The *logic* under this task is already unit-tested in Tasks 1 and 3.

- [ ] **Step 1: Add `SCHEDULABLE_BOSSES` to the engine's boss-mechanics import**

In the `from '../systems/boss-mechanics'` block (`:55-68`), add `SCHEDULABLE_BOSSES,` alongside `MECHANIC_BOSSES,`. Also add the two systems imports near the other `../systems/*` imports at the top of the file:

```ts
import { endlessHpMult } from '../systems/enemy-scaling'; // extend the existing enemy-scaling import if one exists
import { allSchedulableBossesCleared } from '../systems/wave-generation'; // extend the existing wave-generation import
```

(If `enemy-scaling` / `wave-generation` are already imported, add the names to those existing import statements rather than adding new lines.)

- [ ] **Step 2: Declare the run-scoped fields**

After `runMods: RunModifiers = freshRunMods();` (`:679`), add:

```ts
  /** Schedulable bosses killed *this run* (reset each run). Drives the ordered boss
   *  march and the victory trigger — distinct from lifetime `bossesSeen`. */
  bossesKilledThisRun: Record<string, number> = {};
  /** True once every schedulable boss has fallen this run. Latches the victory screen. */
  won = false;
  /** `'normal'` until victory; `'endless'` after the player chooses to continue. */
  runPhase: 'normal' | 'endless' = 'normal';
  /** The wave victory fired on — the anchor for the Endless HP acceleration. */
  private victoryWave = 0;
```

- [ ] **Step 3: Record boss kills**

In the `!enemy.debug && !enemy.escort` block (`:4692-4708`), right after `this.kills += 1;` (`:4696`), add:

```ts
      if (enemy.isBoss && SCHEDULABLE_BOSSES.includes(enemy.type as never)) {
        this.bossesKilledThisRun = {
          ...this.bossesKilledThisRun,
          [enemy.type]: (this.bossesKilledThisRun[enemy.type] ?? 0) + 1,
        };
      }
```

- [ ] **Step 4: Fire victory on wave-clear**

In `checkWaveEnd()`, insert the victory check just before the final `this.emit();` (`:4898`), after the `if (!this.gameOver) this.slayer.assignTask();` line (`:4897`):

```ts
    // Victory: the wave that clears the last still-unmet schedulable boss ends the
    // run (mid-combat is too abrupt — this is the wave-clear beat). It latches once;
    // Endless play past it never re-triggers because `won` stays true.
    if (!this.won && this.runPhase === 'normal' && !this.gameOver
        && allSchedulableBossesCleared(this.bossesKilledThisRun)) {
      this.won = true;
      this.victoryWave = this.wave - 1; // the wave just cleared (wave already advanced)
      this.paused = true;
      this.sound.play('interface_open');
    }
```

- [ ] **Step 5: Thread the Endless HP term into enemy spawning and preview**

In `makeEnemy` (`:2513`), replace the `scaleEnemyStats` call:

```ts
    const endless = this.runPhase === 'endless' ? endlessHpMult(wave, this.victoryWave) : 1;
    const scaled = scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, wave, endless);
```

In `wavePreview` (`:2442-2444`), match it so the Start Wave preview stays exact:

```ts
      const endless = this.runPhase === 'endless' ? endlessHpMult(this.wave, this.victoryWave) : 1;
      const s = def
        ? scaleEnemyStats({ hp: def.hp, speed: def.speed, reward: def.reward }, this.wave, endless)
        : { hp: 0, speed: 0, reward: 0 };
```

- [ ] **Step 6: Pass the per-run boss set to wave generation**

In `computeWaveConfigs` (`:2413-2423`), add the option to the `buildWaveConfigs` call:

```ts
      bossesSeen: this.bossesSeen,
      // Per-run march: every run meets bosses gentle→hard and has a real "last boss".
      bossKillsThisRun: this.bossesKilledThisRun,
```

- [ ] **Step 7: Add `continueEndless()`**

Add near the other lifecycle/debug methods (e.g. just above `restart()` at `:5252`):

```ts
  /** Dismiss the victory screen and play on. The run keeps its board and progress;
   *  only the difficulty curve changes (Endless HP acceleration from `victoryWave`). */
  continueEndless() {
    if (!this.won) return;
    this.runPhase = 'endless';
    this.paused = false;
    this.previewCache = null; // force the next preview to reflect the Endless HP term
    this.emit();
  }
```

- [ ] **Step 8: Reset the new state on restart**

In `restart()`, beside `this.runMods = freshRunMods();` (`:5270`) add:

```ts
    this.bossesKilledThisRun = {};
    this.won = false;
    this.runPhase = 'normal';
    this.victoryWave = 0;
```

- [ ] **Step 9: Emit the new keys**

In `snapshot()` (`:909`), beside `gameOver: this.gameOver,` (`:925`) add:

```ts
      won: this.won,
      runPhase: this.runPhase,
      victory: this.won
        ? {
            wave: this.victoryWave,
            seconds: this.runSeconds,
            bosses: Object.keys(this.bossesKilledThisRun).length,
            mode: this.gameMode,
          }
        : null,
```

Add the keys to the `UIState` interface (`:248`), after `gameOver: boolean;` (`:270`):

```ts
  /** Latched once every schedulable boss has fallen this run — shows the victory screen. */
  won: boolean;
  /** `'normal'` until victory; `'endless'` after the player continues past it. */
  runPhase: 'normal' | 'endless';
  /** Run summary for the victory stop-screen (null until `won`). */
  victory: { wave: number; seconds: number; bosses: number; mode: GameMode } | null;
```

In `components/game/GameRoot.tsx`, extend the `UIState` default literal (`:262`) so the initial render is well-typed:

```ts
  won: false, runPhase: 'normal', victory: null,
```

- [ ] **Step 10: Verify (typecheck + suite + build)**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all green; static export succeeds.

- [ ] **Step 11: Commit**

```bash
git add lib/game/core/engine.ts components/game/GameRoot.tsx
git commit -m "feat: winning a run is now a real state — beat every boss to claim victory"
```

---

### Task 5: Victory stop-screen + Endless indicator

**Files:**
- Modify: `components/game/GameRoot.tsx` (new overlay beside the game-over block `:2825`; start-screen champion mark `:2860`)

**Interfaces:**
- Consumes: `ui.won`, `ui.victory`, `ui.runPhase` (Task 4); `engineRef.current?.continueEndless()`, `engineRef.current?.restart()`.

**Verification:** `game-verifier` (headless) — drive a run to a scripted victory (debug wave-jump + boss kills), confirm the overlay renders, **Continue** unpauses into `runPhase: 'endless'`, and **New Run** resets.

- [ ] **Step 1: Add the victory overlay**

Immediately after the game-over overlay block (closing at `:2857`), add a sibling overlay. It mirrors the game-over panel's structure (centered, `rs-panel`, `GoStat` grid) — **not** a `MovablePanel` (a full-stop screen, like start/game-over):

```tsx
      {ui.won && ui.victory && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-30 p-4 overflow-auto">
          <div className="rs-panel p-6 text-center w-[26em] max-w-full">
            <div className="rs-panel-title text-base">Victory</div>
            <p className="text-[0.78em] text-[#d3c3a0] mt-2 uppercase tracking-wider">
              {ui.victory.mode === 'roguelite' ? 'Roguelite run' : 'Classic run'}
            </p>
            <p className="text-osrs-yellow mt-1 mb-0 text-[1.7em] font-bold leading-none">
              Every boss felled
            </p>
            <p className="text-[0.8em] text-[#d3c3a0] mb-4 uppercase tracking-wide">
              cleared on wave {ui.victory.wave}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4 text-[0.95em]">
              <GoStat icon={ASSETS.misc.multicombat_icon} label="Bosses" value={fmt(ui.victory.bosses)} />
              <GoStat icon={ASSETS.misc.compass} label="Cleared in" value={fmtTime(ui.victory.seconds)} />
              <GoStat icon={ASSETS.misc.attack_icon} label="Slain" value={fmt(engineRef.current?.kills ?? 0)} />
              <GoStat icon={ASSETS.misc.coins_icon} label="Earned" value={`${fmt(engineRef.current?.goldEarned ?? 0)} gp`} />
            </div>
            <button
              className="rs-btn rs-btn-primary px-6 py-2 w-full mb-2"
              title="Play on — the threat now accelerates"
              onClick={() => engineRef.current?.continueEndless()}
            >
              ▶ Continue (Endless)
            </button>
            <button
              className="rs-btn px-6 py-2 w-full"
              title="Start a fresh run"
              onClick={() => { clearRunSave(); setSavedRun(null); engineRef.current?.restart(); setRunStarted(false); }}
            >
              New Run
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Show an Endless badge during Endless play**

The HUD's wave readout should signal Endless. Find the wave display in the HUD (search `Wave {ui.wave}` in `GameRoot.tsx`) and append, in the same element, an Endless tag gated on `ui.runPhase === 'endless'`:

```tsx
{ui.runPhase === 'endless' && (
  <span className="ml-[0.4em] text-[0.7em] text-osrs-orange uppercase tracking-wider">Endless</span>
)}
```

- [ ] **Step 3: Verify headlessly**

Dispatch the `game-verifier` agent: build the static export, drive a run, use the debug console (`Ctrl+'`) to jump waves and spawn/kill each schedulable boss, and confirm: the Victory panel appears and pauses; **Continue (Endless)** dismisses it, unpauses, and the HUD shows the Endless badge; **New Run** returns to the start screen. Expected verdict: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/game/GameRoot.tsx
git commit -m "feat: a victory screen to claim the run, then carry on into Endless"
```

---

### Task 6: Non-monetary victory record + Champion mark

**Files:**
- Modify: `components/game/GameRoot.tsx` (`SAVE_KEYS` `:297`; `loadSave`/a victories loader `:328`; a persistence effect near `:820`; the collection-log modal — search `LogDetail` / the collection-log tab list; start-screen champion mark `:2860`)

**Interfaces:**
- The record shape (single source of truth — declare it once near `SAVE_KEYS`):

```ts
type Victories = {
  total: number;
  fastestSeconds: number | null;   // best clear time (null until first win)
  highestEndlessWave: number;      // furthest wave reached in Endless, any run
  byMode: { classic: number; roguelite: number };
};
const EMPTY_VICTORIES: Victories = { total: 0, fastestSeconds: null, highestEndlessWave: 0, byMode: { classic: 0, roguelite: 0 } };
```

**Verification:** `game-verifier` (headless) — win a run, confirm `localStorage['osrs_td_victories']` is written; die in Endless, confirm `highestEndlessWave` updates; reload, confirm the champion mark shows on the start screen and the Victories section renders the record.

- [ ] **Step 1: Add the storage key + loader**

Extend `SAVE_KEYS` (`:297`) with `victories: 'osrs_td_victories'`. Add a loader beside `loadSave` (`:328`):

```ts
function loadVictories(): Victories {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEYS.victories) ?? 'null');
    if (raw && typeof raw === 'object') return { ...EMPTY_VICTORIES, ...raw, byMode: { ...EMPTY_VICTORIES.byMode, ...(raw.byMode ?? {}) } };
  } catch { /* ignore */ }
  return EMPTY_VICTORIES;
}
```

Hold it in React state in the `GameRoot` component: `const [victories, setVictories] = useState<Victories>(loadVictories);`

- [ ] **Step 2: Record a win**

Add an effect keyed on `ui.won` that updates the record exactly once per win (guard against the latched `won` re-running with a `useRef`):

```ts
const recordedWin = useRef(false);
useEffect(() => {
  if (!ui.won || !ui.victory) { recordedWin.current = false; return; }
  if (recordedWin.current) return;
  recordedWin.current = true;
  setVictories((v) => {
    const next: Victories = {
      total: v.total + 1,
      fastestSeconds: v.fastestSeconds == null ? ui.victory!.seconds : Math.min(v.fastestSeconds, ui.victory!.seconds),
      highestEndlessWave: v.highestEndlessWave,
      byMode: { ...v.byMode, [ui.victory!.mode]: v.byMode[ui.victory!.mode] + 1 },
    };
    try { localStorage.setItem(SAVE_KEYS.victories, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
}, [ui.won, ui.victory]);
```

- [ ] **Step 3: Record the furthest Endless wave on death**

Add an effect keyed on `ui.gameOver`: when the run ends in `runPhase === 'endless'`, fold `ui.wave` into `highestEndlessWave`:

```ts
useEffect(() => {
  if (!ui.gameOver || ui.runPhase !== 'endless') return;
  setVictories((v) => {
    if (ui.wave <= v.highestEndlessWave) return v;
    const next = { ...v, highestEndlessWave: ui.wave };
    try { localStorage.setItem(SAVE_KEYS.victories, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
}, [ui.gameOver, ui.runPhase, ui.wave]);
```

- [ ] **Step 4: Champion mark on the start screen**

Pass `champion={victories.total > 0}` (and the record, if the start screen shows stats) into `<StartScreen .../>` (`:2861`). In `StartScreen` (same file), when `champion`, render a small mark beside the title using an OSRS cache asset already in `ASSETS` (e.g. a trophy/quest-point icon — pick an existing key from `lib/game/assets.ts`; do **not** hot-link). Keep the copy English: title attribute `"Champion — you have won ${total} run(s)"`.

- [ ] **Step 5: Victories section in the collection log**

Find the collection-log modal (search `LogDetail` in `GameRoot.tsx`) and add a "Victories" entry to its tab/section list that reuses the `LogDetail` styling. Render the record as an `rs-panel` stats block (mirror the `GoStat` grid from Task 5):

- Total victories · Fastest clear (`fmtTime(fastestSeconds)`, or `—` when null) · Highest Endless wave · per-mode counts (Classic / Roguelite).

Read the existing collection-log tab wiring first and match its shape exactly — this is a new section in the existing modal, not a new modal.

- [ ] **Step 6: Verify headlessly**

Dispatch `game-verifier`: win a run (debug), assert `osrs_td_victories` written with `total: 1` and a `fastestSeconds`; continue to Endless and die, assert `highestEndlessWave` set; reload the page, assert the champion mark renders and the Victories section shows the record. Expected verdict: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/game/GameRoot.tsx
git commit -m "feat: a champion's record of wins, fastest clears and furthest Endless"
```

---

### Task 7: Tutorial mirror + changelog

**Files:**
- Modify: `components/game/GameRoot.tsx` (`LEARN_STEPS` and `TLDR` — search both names)

**Interfaces:** none (copy only). The rule: `LEARN_STEPS` and `TLDR` must both describe the victory milestone + Endless.

**Verification:** `npx tsc --noEmit`; grep to confirm both mention victory/Endless.

- [ ] **Step 1: Add a `TLDR` line**

Find the `TLDR` cheat-sheet array/section in `GameRoot.tsx` and add an English entry describing the win condition and Endless, in the sheet's existing voice, e.g.:

> **Winning** — defeat every boss in the roster (about wave 90) to win the run. You can then continue into **Endless**, where the threat keeps accelerating, or start fresh. Wins are recorded in the collection log.

- [ ] **Step 2: Add a matching `LEARN_STEPS` tip**

Add a contextual tip to `LEARN_STEPS` anchored to an existing `data-tut` target (`startwave` or `hud` — reuse one, do not invent an anchor), gated so it surfaces in the late game (e.g. `ui.wave >= 60`). Keep it to one sentence, English, mirroring the TLDR line at shallower depth, e.g. "Beat every boss to win the run — then it's your call to push into Endless."

- [ ] **Step 3: Verify the mirror**

Run: `npx tsc --noEmit`
Then grep both blocks:
```bash
grep -n -i "endless\|win the run\|every boss" components/game/GameRoot.tsx
```
Expected: hits inside both `TLDR` and `LEARN_STEPS`.

- [ ] **Step 4: Commit**

```bash
git add components/game/GameRoot.tsx
git commit -m "docs: teach the victory milestone and Endless in the tutorial"
```

Note: this commit is `docs` and drops from the player changelog by design — the player-facing "New" entries were already emitted by Tasks 1–6. The changelog JSON regenerates at the next `prebuild`; run `node scripts/build-changelog.mjs` to preview.

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-25-late-game-victory-endless-design.md`):

| Spec section | Task |
|---|---|
| §1 Per-run boss march + victory trigger | Task 3 (march + predicate) + Task 4 (`bossesKilledThisRun`, victory on wave-clear, `won`/`runPhase`) |
| §2 Victory screen + flow (Continue / New Run, stop-screen not MovablePanel) | Task 5 |
| §3 Victory record (persisted, non-monetary; total/fastest/highest-Endless/per-mode; champion mark; collection-log detail) | Task 6 |
| §4a Diminishing returns on stacked damage mults | Task 2 (`softCapMult`) |
| §4b Endless-only exponential HP term | Task 1 (`endlessHpMult`) + Task 4 (wiring) |
| §5 Testing (softCapMult, endlessHpMult, per-run march pure tests) | Tasks 1, 2, 3 |
| §6 Files touched | Tasks 1–7 cover each listed file |
| Constraints (fixed board, OSRS assets, non-monetary, English, tutorial mirror) | Global Constraints + Task 6 (assets) + Task 7 (mirror) |

No gaps. §4a is implemented as the product soft-cap (the spec's documented alternative) with rationale recorded in Task 2.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step carries real code. Two steps (Task 5 Step 2 HUD badge, Task 6 Step 5 Victories section) instruct the implementer to *locate and match* existing structures rather than pasting them — that is deliberate (the surrounding JSX is large and its exact shape is the local source of truth), and each names the concrete search term, the exact record fields to render, and the styling to mirror.

**3. Type consistency:** `bossesKilledThisRun: Record<string, number>` is consistent across engine field, `rollWaveBosses(…, killedThisRun?)`, `allSchedulableBossesCleared(killedThisRun)`, and `BuildWaveOptions.bossKillsThisRun`. `runPhase: 'normal' | 'endless'` and `won: boolean` match between the engine fields, `UIState`, the GameRoot default, and every consumer. `victory` summary shape (`{ wave, seconds, bosses, mode }`) matches between `snapshot()`, `UIState`, and Task 5/6 reads. `Victories` type is declared once (Task 6) and used by loader, effects, and the collection-log section. `scaleEnemyStats(base, wave, endlessMult?)` third-arg is consistent between Task 1 (definition) and Task 4 (two call sites). `softCapMult` / `endlessHpMult` / `ENDLESS_HP_BASE` / `DAMAGE_MULT_CEILING` names match across definition, tests, and use.

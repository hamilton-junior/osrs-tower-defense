# Difficulty Ladder (New Game+) — Design

**Date:** 2026-08-13
**Status:** approved (design), pending spec review → plan
**Relates to:** `late-game-victory-endless` (A4), `game-modes-roadmap`, `content-design-direction`, `validate-osrs-progressions`

## Goal

Add a **vertical difficulty ladder** to the game: escalating tiers of a run,
where **winning the current tier unlocks the next, harder one**. It is
orthogonal to the game mode (applies to both Classic and Roguelite), reuses the
existing victory condition and scaling machinery, and rewards only with
non-monetary records — no permanent power, no gold. This is the A4 "New Game+"
milestone, unblocked now that the A1/A2 late-game spine has shipped.

## Non-goals (YAGNI — explicitly out of v1)

- **Horizontal mutators** (opt-in rule-changers like "no prayer", "double
  spawns", "iron man"). The vertical ladder is v1; the horizontal kit layers on
  top of it later without rework.
- **Accumulating modifiers per tier** (Slay-the-Spire Ascension style, where each
  tier adds a *distinct rule*). v1 tiers differ only by degree (numbers), not by
  rule. A later version can attach a signature rule per tier.
- **New enemy-damage / leak-cost scaling.** Enemy pressure is expressed through
  the four levers below; scaling per-leak life cost is a future knob, not v1.
- Any change to the win condition itself, or to the pre-existing pre-victory /
  Endless curves. The tier multiplier composes *on top* of them.

## The ladder

Tier names use the **real OSRS Combat Achievement tiers** (validates against a
real OSRS progression; never invent tiers):

| Tier | Name | Unlock |
|-----:|------|--------|
| 0 | **Normal** | always available; all multipliers = 1.0 (identical to today's game) |
| 1 | **Easy** | clear Normal |
| 2 | **Medium** | clear Easy |
| 3 | **Hard** | clear Medium |
| 4 | **Elite** | clear Hard |
| 5 | **Master** | clear Elite |
| 6 | **Grandmaster** | clear Master |

**Unlock is per game mode.** The existing victory record is already `byMode`
(`classic` / `roguelite`); a tier cleared in Roguelite advances only the
Roguelite ladder. Tier 0 is always available in both. "Clear" = the existing win
condition (`allSchedulableBossesCleared` → `won`), unchanged — you just faced a
tougher board.

## What escalates per tier (the four levers)

Four run-wide multipliers, applied once at run start, layered on top of the
existing per-wave scaling. Tier 0 is the identity (all 1.0 / +0), guaranteed by
test.

1. **Enemy HP ×** (primary lever) — folds into `scaleEnemyStats`, so it stacks
   multiplicatively with `hpScaleForWave(wave)` and the Endless `endlessHpMult`
   term. This is what makes a high tier + Endless genuinely brutal.
2. **Enemy speed ×** (light) — folds into the same function's speed term; enemies
   reach the gate sooner, compressing reaction time.
3. **Gold-per-kill ×** (< 1) — a *tighter* economy. We cut the reward multiplier;
   we never inflate gold. Fewer towers/upgrades for the same wave.
4. **Starting lives Δ** (≤ 0 at high tiers) — fewer lives from `START_LIVES`
   (and `maxLives`), floored at a hard minimum (≥ 5) so a tier is never
   unwinnable by construction. This is how "enemy pressure" is expressed in v1
   without touching leak sites.

**Illustrative numbers (shapes only — every number is the user's to tune, in one
place):**

| Tier | HP × | Speed × | Gold × | Lives Δ |
|------|-----:|--------:|-------:|--------:|
| Normal | 1.00 | 1.00 | 1.00 | +0 |
| Easy | 1.15 | 1.00 | 0.95 | +0 |
| Medium | 1.35 | 1.03 | 0.90 | +0 |
| Hard | 1.60 | 1.05 | 0.85 | −5 |
| Elite | 1.90 | 1.08 | 0.80 | −10 |
| Master | 2.30 | 1.10 | 0.75 | −15 |
| Grandmaster | 2.80 | 1.12 | 0.70 | −20 |

**Invariant (test-enforced):** difficulty is monotonic non-decreasing across
tiers — HP/speed never fall, gold never rises, lives Δ never rises, from one
tier to the next. Tier 0 is exactly identity.

## Architecture

Follows the established pattern: pure logic in `systems/` with a unit test; the
engine orchestrates and holds state; `GameRoot` renders and persists.

### New pure module — `lib/game/systems/difficulty.ts` (+ `difficulty.test.ts`)

```ts
export type DifficultyTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TierMods {
  enemyHp: number;    // × on base HP (≥ 1)
  enemySpeed: number; // × on base speed (≥ 1)
  gold: number;       // × on kill reward (≤ 1)
  livesDelta: number; // added to START_LIVES / maxLives (≤ 0)
}

export const DIFFICULTY_TIERS: readonly { id: DifficultyTier; name: string; mods: TierMods }[];

/** Mods for a tier (tier 0 = identity). Pure. */
export function tierMods(tier: DifficultyTier): TierMods;

/** The highest tier a player may select for a mode, given the highest they've
 *  cleared: cleared + 1, capped at Grandmaster. (Unlock = beat the tier below.) */
export function highestUnlockedTier(highestCleared: number): DifficultyTier;

/** Guard: is `tier` selectable given `highestCleared`? */
export function isTierUnlocked(tier: DifficultyTier, highestCleared: number): boolean;
```

Tests: tier 0 is identity; monotonicity across the ladder; `MIN_LIVES` floor
never breached; unlock math (`highestUnlockedTier`/`isTierUnlocked`) at the
boundaries (nothing cleared → only Normal + Easy selectable; all cleared →
Grandmaster).

### `systems/enemy-scaling.ts` — thread the difficulty multipliers

Extend `scaleEnemyStats` to take an optional difficulty argument so HP/speed/gold
tier mods flow through the one place enemy stats are computed:

```ts
export function scaleEnemyStats(
  base: ScalableEnemyStats,
  wave: number,
  endlessMult = 1,
  diff: { hp: number; speed: number; reward: number } = { hp: 1, speed: 1, reward: 1 },
): ScalableEnemyStats;
```

Applied as `base.hp * hpScaleForWave(wave) * endlessMult * diff.hp`, speed
`* diff.speed`, reward `* diff.reward`. Default arg keeps every existing caller
and test unchanged (Classic/tier-0 identical to today). Both engine call sites
(`spawnEnemy` ~2712, the wave-preview scaler ~2785) pass the run's tier mods.

### Engine — `lib/game/core/engine.ts`

- New field `difficultyTier: DifficultyTier = 0`, persisted across `restart`
  like `gameMode` (the ladder choice belongs to the whole run, set before wave 1).
- `setDifficultyTier(tier)` — mirror of `setMode`: only honoured before the run
  starts (wave 1, not yet begun); emits.
- At run start / `restart`, resolve `const d = tierMods(this.difficultyTier)`:
  apply `livesDelta` to `START_LIVES` and `maxLives` (floored at `MIN_LIVES`);
  cache the enemy `{ hp, speed, reward }` multipliers to pass into
  `scaleEnemyStats` at both call sites.
- On victory (`won` set at ~5214), the engine exposes the cleared `(mode, tier)`
  so `GameRoot` can persist the unlock (engine emits; GameRoot writes storage —
  same division as the existing `Victories` flow).
- Emit `difficultyTier` in `UIState` (add the key to `UIState`) so the UI can
  show/gate the current tier.

### In-progress run save — `systems/run-save.ts`

`snapshotRun()` must include `difficultyTier`, and `sanitizeRunSave` must
validate/default it, so a run resumed via **Continue** keeps its difficulty.
Bump `RUN_SAVE_VERSION` (its meaning changed) — an older save without the field
defaults to tier 0.

### Persistence & rewards — `GameRoot.tsx`

- **New store `osrs_td_difficulty`**, kept separate from `osrs_td_victories` so
  the already-validated `Victories` sanitizer is untouched. Shape:

  ```ts
  interface DifficultyProgress {
    // highest tier cleared, per mode. Range −1..6: −1 = nothing cleared yet →
    // only Normal (0) is selectable; clearing Normal sets it to 0 and unlocks Easy (1).
    highestCleared: { classic: number; roguelite: number };
    // best record per (mode, tier): fastest clear time + highest Endless wave
    records: Record<string /* `${mode}:${tier}` */, { fastestSeconds: number | null; highestEndlessWave: number }>;
  }
  ```

- On the engine's victory emit, update `highestCleared[mode]` (max) and the
  `(mode, tier)` record.
- **Reward = non-monetary**, reusing the Collection-Log `LogDetail` pattern: a
  new **Difficulty** entry in the collection log, listing per mode each tier with
  its clear state, fastest time, and highest Endless wave. Clearing a tier shows
  that tier's **name as a typographic mark** (like the existing `★ Champion` gold
  text — no invented sprite). No power, no gold. (Kept as its own entry rather
  than folded into the Victories tab so the already-validated `Victories` store
  stays untouched.)

### UI — start / mode-select screen (`GameRoot.tsx`)

Beside the existing Classic/Roguelite selector, a **tier selector** in the same
OSRS "stone"/pill language:

- Shows unlocked tiers for the currently selected mode as selectable; the next
  locked tier shows as 🔒 (the visible target), higher ones hidden or dimmed.
- Switching mode re-reads that mode's `highestCleared` and re-gates the tiers.
- Default selected tier = the mode's **highest unlocked** tier (returning players
  resume at their level), freely lowerable.
- Locks in together with the mode on wave 1 (`setDifficultyTier` shares the
  existing wave-1-only gate that `setMode` uses).
- Tutorial mirror: the ladder is a start-screen concept (like mode choice); no
  in-board `data-tut` anchor needed, but the **How-to-Play / TL;DR** copy gains a
  line describing difficulty tiers so `LEARN_STEPS`/`TLDR` stay in sync
  (game-ui tutorial-mirror rule).

## Data flow

```
start screen: pick mode + tier
  → engine.setMode / engine.setDifficultyTier   (wave-1-only)
  → startWave: run begins
      run start applies tierMods:  START_LIVES/maxLives (− livesDelta),
                                   cache {hp,speed,reward} mults
      each spawn/preview: scaleEnemyStats(base, wave, endless, diffMults)
  → victory (allSchedulableBossesCleared → won)
      engine emits cleared (mode, tier)
      GameRoot persists osrs_td_difficulty: highestCleared, (mode,tier) record
      → next tier becomes selectable on the start screen
```

## Error handling / edge cases

- **Tier 0 must be byte-for-byte today's game.** Guaranteed by identity mods +
  default args on `scaleEnemyStats` (existing callers/tests unchanged) + a test
  asserting `tierMods(0)` is identity.
- **Lives floor.** `livesDelta` is clamped so effective starting lives ≥
  `MIN_LIVES` (≥ 5); a tier can be hard, never structurally unwinnable.
- **Selecting a locked tier is impossible** through the UI (only unlocked render
  as selectable); the engine also clamps `setDifficultyTier` against the mode's
  `highestUnlockedTier` as defence-in-depth so a stale/injected value can't start
  a locked tier.
- **Old in-progress save** without `difficultyTier` → defaults to tier 0 (Normal)
  via `sanitizeRunSave`; version bump prevents silent misreads.
- **Endless interaction.** The tier HP mult multiplies the Endless exponential —
  intended: a Grandmaster Endless run is meant to end fast. The player-damage
  soft-cap + Endless term already guarantee eventual loss; the tier just moves
  the wall in.

## Testing

- `difficulty.test.ts` — identity at tier 0, monotonicity, lives floor, unlock
  math at boundaries.
- `enemy-scaling` existing tests stay green (default arg); add cases asserting
  the `diff` multipliers apply and that omitting them equals today.
- `run-save` tests — round-trip `difficultyTier`; old-version save defaults to 0.
- Engine/GameRoot have no unit tests: verify via the `game-verify` gate (tsc +
  vitest + build) and a headless drive of the start-screen tier selector + a
  short run at a non-zero tier (game-verifier subagent). Balance/tuning of the
  numbers is the user's job — not a verification step.

## Open tuning knobs (user's, one place each)

- The seven rows of the tier table (HP/speed/gold/lives) in `DIFFICULTY_TIERS`.
- `MIN_LIVES` floor.
- Number of tiers (currently 7, matching the CA ladder).

# Combat Achievements — design

**Date:** 2026-08-16
**Roadmap item:** M2 (`docs/feedback-ledger.md`, "Open work", item 6)
**Status:** approved design, ready for an implementation plan

## Goal

Give the game a permanent, account-wide **Combat Achievements** ladder: 40 named tasks
across the six real OSRS CA tiers (Easy → Grandmaster), completed by *how* the player
wins rather than by how long they grind. Completing a task fires a collection-log-style
popup and lights an entry in a new Collection Log tab. Completing a whole tier grants a
**cosmetic title** — no gold, no essence, no power.

This closes a thematic gap: the New Game+ difficulty ladder shipped on 2026-08-16 already
names its seven tiers after the OSRS Combat Achievement tiers, but nothing in the game
referenced the achievements those names come from.

## What exists today, and what does not

`lib/game/data/achievements.ts` holds eight legacy entries (`Complete Wave 1`,
`Accumulate 1000 GP`, `Have 10 towers on the field`) consumed only by the legacy
`lib/game/engine.ts` and `components/game-ui/AchievementsModal.tsx`, neither of which is
rendered. The new core has **no** achievement code at all.

That table is deliberately **not** reused. It is progression trivia, not combat
achievements, and three of its eight entries duplicate what the Collection Log already
tracks. It stays where it is, untouched, as legacy.

Seams the new subsystem plugs into, all of which already exist:

| Seam | Location | Use |
|---|---|---|
| `UnlockItem` / `announceUnlocks` | `lib/game/core/engine.ts:103-111`, `:1167` | the completion popup; its doc comment already names achievements as the intended second producer |
| Per-run counters | `lib/game/core/engine.ts:800-808`, reset ~`:5660` | the template and the reset point for `runStats` |
| `checkWaveEnd()` | `lib/game/core/engine.ts:5160` | the wave-end checkpoint, right beside the existing `checkPrayerUnlocks()` call at `:5198` |
| `sellTower(towerId)` | `lib/game/core/engine.ts:2658` | `towersSold` |
| Life loss | `lib/game/core/engine.ts:3973` (leak cost), `:5193` | `livesLostRun` / `livesLostThisWave` |
| Win detection | `lib/game/core/engine.ts:5223` | the run-end checkpoint |
| `runPhase` | `lib/game/core/engine.ts:719` | Endless-only tasks |
| Collection Log tabs | `components/game/GameRoot.tsx:682` | the sixth tab |
| `SAVE_KEYS` | `components/game/GameRoot.tsx:332` | the new account store, modelled on `victories` / `difficulty` |
| Boss mechanic constants | `lib/game/systems/boss-mechanics.ts` | Jad healers, Hydra vents, Zulrah phases, Dusk/Dawn escort |

## Architecture

**Facts plus pure predicates, evaluated at checkpoints.** The engine records *facts*
about the run — never events — into a flat `runStats` object. A pure module holds the
task table and an `evaluate()` that returns the ids newly satisfied. The engine calls it
at three checkpoints.

The decisive property: tasks that read like events ("kill Jad in under 60 seconds")
become recorded facts (`bossKillSeconds.jad = 47`), so every one of the 40 predicates
stays a pure function of state. One concept covers the whole table, and the entire
ruleset is unit-testable without instantiating an engine.

Rejected alternatives:

- **A typed event bus.** More expressive for sequence tasks, but it introduces
  infrastructure nothing else in the core uses, and cumulative tasks degenerate into
  state machines. Not worth it for 40 tasks.
- **Imperative hooks per task** inside `damageEnemy` / `checkWaveEnd`. Cheap now,
  ungovernable by the third content drop, and contrary to the repo's pure-`systems/`
  pattern.

### File layout

| Layer | File | Responsibility |
|---|---|---|
| Content | `lib/game/data/combat-achievements.ts` | the 40 `CaTask` definitions, and nothing else |
| Pure logic | `lib/game/systems/combat-achievements.ts` | every type (`CaTier`, `CaTask`, `RunStats`, `CaAccount`) plus `emptyRunStats()`, `evaluate()`, `tierProgress()`, `earnedTitles()`, `highestTitle()` |
| Tests | `lib/game/systems/combat-achievements.test.ts` | the ruleset's regression net |
| Engine | `lib/game/core/engine.ts` | owns `runStats`, records facts, runs the checkpoints, fires the popup, emits UI state |
| Persistence | `components/game/GameRoot.tsx` | `osrs_td_achievements` account store |
| Run resume | `lib/game/systems/run-save.ts` | optional `caStats` field |
| UI | `components/game/GameRoot.tsx` | sixth Collection Log tab, plus the title on the victory and start screens |

### Types

**Layering.** All types live in `systems/combat-achievements.ts`; `data/combat-achievements.ts`
imports them and exports only the table. The reverse — the data file importing `GameMode`
from `core/engine.ts`, which imports the table — would be a circular import. `systems/`
already takes a type-only import from `core/engine.ts` (`systems/run-save.ts` does), so the
`GameMode` / `DifficultyTier` / `EnemyType` / `CombatStyle` references belong there.

```ts
// systems/combat-achievements.ts
export type CaTier = 'easy' | 'medium' | 'hard' | 'elite' | 'master' | 'grandmaster';

export const CA_TIERS: readonly CaTier[] =
  ['easy', 'medium', 'hard', 'elite', 'master', 'grandmaster'];

export interface CaTask {
  /** Stable id — this is the persisted key. Never rename one in place. */
  id: string;
  tier: CaTier;
  /** English, OSRS-flavoured. Shown in the popup and the log. */
  name: string;
  /** One line saying exactly how to complete it. */
  desc: string;
  /** Set only on the two mode-exclusive tasks. */
  mode?: GameMode;
  check(s: RunStats, a: CaAccount): boolean;
}
```

```ts
// systems/combat-achievements.ts
export interface RunStats {
  mode: GameMode;
  tier: DifficultyTier;
  runPhase: 'normal' | 'endless';
  won: boolean;
  runSeconds: number;
  maxWaveReached: number;

  livesLostRun: number;
  livesLostThisWave: number;
  cleanWaveStreak: number;

  towersBuilt: number;
  towersSold: number;
  maxTowersOnField: number;
  hadAllSixAtOnce: boolean;
  killsByTower: Record<string, number>;
  stylesUsed: CombatStyle[];

  slayerTasksDone: number;
  prayerEverUsed: boolean;
  prayerActiveAtWaveEnd: boolean;

  bossKillSeconds: Partial<Record<EnemyType, number>>;
  livesLostDuringBoss: Partial<Record<EnemyType, number>>;
  bossFlags: {
    jadHealed: boolean;
    hydraVentsBroken: number;
    hydraVentHealed: boolean;
    duskDawnClean: boolean;
    cerberusSoulLeaked: boolean;
  };
}

export interface CaAccount { completed: ReadonlySet<string>; }

/** Ids satisfied now and not already in `account.completed`. Pure; never mutates. */
export function evaluate(s: RunStats, account: CaAccount): string[];
```

`evaluate` filters out a task whose `mode` differs from `s.mode`, evaluates the rest, and
returns only ids absent from `account.completed`. It is therefore idempotent: a completed
task can never fire twice.

### Checkpoints

The engine calls `checkAchievements()` at exactly three points:

1. **Wave end** — in `checkWaveEnd()`, immediately after `this.wave += 1`, beside the
   existing `checkPrayerUnlocks()` call.
2. **Boss death** — where a boss is removed and `bossesKilledThisRun` is written, after
   `bossKillSeconds` / `livesLostDuringBoss` are recorded.
3. **Run end** — where the victory is declared (`engine.ts:5223`).

`checkAchievements()` builds the `RunStats` snapshot, calls `evaluate`, and on a non-empty
result adds the ids to the account set, calls `announceUnlocks` with the new
`kind: 'achievement'`, and emits.

`UnlockItem.kind` widens from `'prayer'` to `'prayer' | 'achievement'`. The popup's
per-kind title map in `GameRoot.tsx:330` (`UNLOCK_LABEL`) gains
`achievement: 'Combat Achievement'`.

`UIState` gains one key: `achievements: string[]` — the completed ids, as a plain array.
The snapshot crosses the boundary `structuredClone`d, so the engine emits an array even
though it holds a `Set` internally. `GameRoot` writes that array straight to
`osrs_td_achievements`, the same way it already persists `killCounts` on change.

## The 40 tasks

Names and descriptions are English (in-game strings always are). Ids are kebab-case and
permanent.

### Easy (6) — teach the systems, reachable inside the first ~20 waves

| id | Name | Condition |
|---|---|---|
| `rat-catcher` | Rat Catcher | Defeat Scurrius |
| `first-contract` | First Contract | Complete a Slayer task |
| `answered-prayer` | Answered Prayer | Finish a wave with a tower prayer active |
| `full-house` | Full House | Have all six tower types on the field at once |
| `not-a-scratch` | Not a Scratch | Clear any wave without losing a life |
| `ledger-opened` | Ledger Opened | Reach wave 20 |

### Medium (7)

| id | Name | Condition |
|---|---|---|
| `bodyguard` | Bodyguard | Defeat Brutus without losing a life |
| `molehill` | Molehill | Defeat the Giant Mole |
| `sun-and-moon` | Sun and Moon | Defeat Dusk and Dawn in the correct order, with no revive |
| `thrifty` | Thrifty | Reach wave 30 having built at most 8 towers |
| `specialist` | Specialist | Get 100 kills with a single tower |
| `taskmaster` | Taskmaster | Complete 5 Slayer tasks in one run |
| `untouchable` | Untouchable | Clear 5 waves in a row without losing a life |

### Hard (7)

| id | Name | Condition |
|---|---|---|
| `fire-cape` | Fire Cape | Defeat TzTok-Jad without a Yt-HurKot healing it |
| `vent-breaker` | Vent Breaker | Break both of the Alchemical Hydra's vents |
| `hellhounds-master` | Hellhound's Master | Defeat Cerberus with no Summoned Soul escaping |
| `snake-charmer` | Snake Charmer | Defeat Zulrah in under 90 seconds |
| `dragonfire-drill` | Dragonfire Drill | Defeat Vorkath without losing a life |
| `minimalist` | Minimalist | Reach wave 50 with at most 6 towers on the field |
| `purist` | Purist | Reach wave 40 without selling a tower |

### Elite (7)

| id | Name | Condition |
|---|---|---|
| `champion` | Champion | Win a run |
| `old-school` | Old School | Win a run in Classic mode *(mode-locked)* |
| `gambler` | Gambler | Win a run in Roguelite mode *(mode-locked)* |
| `speed-runner` | Speed Runner | Win a run in under 45 minutes |
| `iron-wall` | Iron Wall | Win a run losing at most 5 lives |
| `one-true-style` | One True Style | Win a run using towers of a single combat style |
| `deep-cut` | Deep Cut | Reach wave 120 in Endless |

### Master (7)

| id | Name | Condition |
|---|---|---|
| `hard-mode` | Hard Mode | Win a run on Hard (tier 3) or above |
| `elite-company` | Elite Company | Win a run on Elite (tier 4) or above |
| `flawless-fight-caves` | Flawless Fight Caves | Defeat TzTok-Jad without losing a life, on Hard or above |
| `perfect-hydra` | Perfect Hydra | Defeat the Alchemical Hydra without it healing at a vent |
| `bare-bones` | Bare Bones | Win a run having built at most 10 towers |
| `no-gods-no-prayers` | No Gods, No Prayers | Win a run without activating a single prayer |
| `endless-endurance` | Endless Endurance | Reach wave 200 in Endless |

### Grandmaster (6)

| id | Name | Condition |
|---|---|---|
| `grandmaster` | Grandmaster | Win a run on Grandmaster (tier 6) |
| `untouchable-champion` | Untouchable Champion | Win a run without losing a single life |
| `perfect-roster` | Perfect Roster | Defeat all ten bosses in one run, losing no life to any of them |
| `speed-grandmaster` | Speed Grandmaster | Win on Master or above in under 60 minutes |
| `ascetic-grandmaster` | Ascetic Grandmaster | Win on Elite or above without selling a tower, having built at most 12 |
| `the-whole-log` | The Whole Log | Complete every other Combat Achievement |

`the-whole-log` reads `a.completed` and requires the other 39 ids. It must exclude its own
id, and `evaluate` must be ordered so the other 39 are added to the account set before it
is tested — otherwise it can never fire in the same checkpoint that completes the 39th.
The implementation runs `evaluate` to a fixed point: re-run after adding results, up to
one extra pass, so a capstone completed by the same checkpoint still fires.

## Rewards

Non-monetary, exactly as the difficulty ladder's Collection Log entry is.

- Completing every task in a tier grants a **title** with the tier's name (`Easy` …
  `Grandmaster`).
- `highestTitle(completed)` returns the highest tier fully cleared, or `null`.
- The title renders on the victory screen and under the player's heading on the start
  screen. It confers no stats, no gold, no essence, and no unlock.

The difficulty ladder's unlock rule is **untouched**: a New Game+ tier is still unlocked
only by winning the tier below it. Combat Achievements are a parallel record, not a second
door.

## Persistence

**Account store** — a new `SAVE_KEYS` entry `achievements: 'osrs_td_achievements'`, holding
`{ completed: string[] }`, loaded through a tolerant `loadAchievements()` in the shape of
the existing `loadVictories` / `loadDifficulty`: parse, reject non-objects, merge over an
empty default, swallow errors. Unknown ids in storage are ignored on read (a task removed
in a later patch must not break the log).

**Run in progress** — `RunSave` gains `caStats?: RunStats`, an **optional** field, and
`RUN_SAVE_VERSION` stays at **3**. `sanitizeRunSave` rejects any save whose version differs,
so bumping to 4 would invalidate every run currently saved in a player's browser. The cost
of not bumping is bounded and small: a player resuming a run saved before this ships
restarts that run's CA counters at zero. Existing optional fields (`lootBag?`,
`cardRollsBought?`) are the precedent.

## UI

A sixth Collection Log tab, `achievements`, added to the existing union at
`GameRoot.tsx:682` and to the tab strip.

- Six sections, one per tier, in ladder order, each with an `rs-progress` bar reading
  `<completed>/<total>` and the tier's title state.
- Completed tasks render lit with name and description; incomplete ones render greyed with
  the description still legible — the same treatment the log already gives a
  never-encountered enemy, so a player can read the whole ruleset as a to-do list.
- Mode-locked tasks carry a small `Classic` / `Roguelite` marker.

**Icons.** The tier icons must come from the OSRS cache via `npm run extract:sprites`,
per the project's hard rule that every asset originates in the game. If the Combat
Achievements interface sprites cannot be located in the cache, stop and ask — do not
substitute a placeholder or a hot-linked wiki image.

**Tutorial mirror.** `LEARN_STEPS` and `TLDR` in `GameRoot.tsx` both describe the real
interface and must stay in sync; the Collection Log line in each gains the Combat
Achievements tab.

## Testing

`lib/game/systems/combat-achievements.test.ts`:

- **Per task**: one `RunStats` that satisfies it and one that misses by a single step.
  Forty pairs — this is the file's bulk and its whole point.
- **Idempotence**: an id already in `account.completed` never appears in `evaluate`'s
  result.
- **Mode filter**: `old-school` never fires on a roguelite run, `gambler` never on classic.
- **Capstone**: `the-whole-log` fires on the checkpoint that completes the 39th task, and
  never counts itself.
- **Tier helpers**: `tierProgress` counts correctly with a partial set; `earnedTitles` /
  `highestTitle` return nothing until a tier is whole.
- **Table integrity**: ids are unique, every tier has its stated count, every `id` is
  kebab-case.

Then the standard gate: `npx tsc --noEmit` → `npx vitest run` → `npm run build`.
Balance and playtesting are the user's own.

## Out of scope

- Quests and pets (separate roadmap items).
- Any reward with a mechanical effect.
- Changing how New Game+ tiers unlock.
- Retro-awarding achievements from existing Collection Log data — the ladder starts empty
  for everyone, including the author.

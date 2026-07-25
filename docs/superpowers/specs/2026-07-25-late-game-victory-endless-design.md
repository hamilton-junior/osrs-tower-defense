# Late-game: Victory, Endless, and a curve that overtakes — Design (A1)

**Date:** 2026-07-25
**Status:** Approved (brainstorm). Next step: implementation plan.

## Goal

Give a run a finish line and make coasting eventually lose. Reaching the finish
line (defeating every scheduled boss) ends the run with a **victory**; the player
may then **continue into Endless** or start a new run. In Endless — and, for the
player side, everywhere — the difficulty curve is reshaped so a static board is
eventually overtaken by the threat.

This is sub-spec **A1** of the late-game balance theme (Tema A). Its siblings are
queued, not part of this spec:

- **A2 — Cards & economy with meaning:** dead-weight resource cards
  (essence/slayer/flat), Soul Eater vs food cards, card-roll cost vs gold income,
  card rarity coherence (suggestions #28, #33, parts of #27).
- **A3 — Tower spam & performance:** filling the board and 5×-speed lag
  (suggestion #27, idea #26.1).
- **A4 — New Game+ / harder difficulty tier (near-future):** winning unlocks an
  escalating difficulty modifier for the next run. Deliberately deferred; recorded
  so it is not lost.

## Source suggestions

- **#27 Ease of Late Game** — player damage compounds geometrically while enemy HP
  is only quadratic, so a long run trivialises; "wave 615 without touching a tower".
- **#24 Too easy / not enough content** — wants a win state / "levels".
- **#29 Monster/Tower/Prayer balance** — "no wave is actually difficult".
- **#26 item 6** — a win condition, then new game or endless.

## The diagnosed root cause (verified against code)

- Player damage folds **multiplicatively**: `damageMultiplier *= runMods.damage[style]`
  (`lib/game/systems/tower-combat.ts:208`), and `runMods.damage[style]` is the raw
  product of every kept card's multiplier — unbounded as cards accumulate.
- Enemy HP is **quadratic**: `baseHpScale` (linear) × `progressionHpMult` (linear),
  `lib/game/systems/enemy-scaling.ts:38`.
- Geometric growth beats quadratic for a long-enough run, so any board that
  out-scales the curve once out-scales it forever.
- Resource cards (`essence`/`slayerPoints`/`life`) grant **fixed** amounts, dwarfed
  by late-game economies (out of scope here — that is A2, but it is the same root
  observation).

## Current state (what exists today)

- Two modes: `classic` (plain TD) and `roguelite` (cards + boss relics),
  `GameMode` in `lib/game/types.ts`. Default `roguelite`.
- **No victory state.** A run only ends on defeat (`gameOver`, lives = 0).
- Bosses arrive via `rollWaveBosses` (`lib/game/systems/wave-generation.ts`): every
  10th wave is due one boss; while any boss is **lifetime-unseen** (`bossesSeen`,
  persisted across runs) it is the next unseen in `SCHEDULABLE_BOSSES` order
  (gentlest→hardest); once all are lifetime-seen the scheduled boss is **random**
  and extra bosses roll. So a veteran (all bosses lifetime-seen) has no ordered
  march and no natural "last boss".

## Design

### 1. Per-run boss march + victory trigger

- New engine state `bossesKilledThisRun` (a set/record of `EnemyType`), reset in
  `restart()`.
- The scheduled (every-10th-wave) slot draws from **this-run-unmet** schedulable
  bosses first, in `SCHEDULABLE_BOSSES` order, falling back to the random/extra
  regime only once all are met **this run**. This is a per-run parameter added to
  `rollWaveBosses` (alongside the existing lifetime `bossesSeen`, which keeps
  driving the Collection-Log "seen" state). Result: every run — new account or
  veteran — marches through the whole boss list in the same gentle→hard order.
- **Victory** fires on the **wave-clear** after the final still-unmet-this-run
  schedulable boss is killed (not mid-combat), i.e. when `bossesKilledThisRun`
  covers all of `SCHEDULABLE_BOSSES`. With 9 bosses on a 10-wave cadence this is
  ~wave 90; it self-scales as bosses are added (A-theme M1).
- New states: `won: boolean`, `runPhase: 'normal' | 'endless'`.
- *Rejected alternative:* trigger on the kill instant — interrupts combat; wave-clear
  is cleaner.

### 2. Victory screen + flow

- On `won`, pause and show an OSRS-styled victory panel with the run summary (wave
  reached, elapsed time, bosses felled). Two actions:
  - **Continue (Endless)** → `runPhase = 'endless'`, unpause, run continues.
  - **New Run** → `restart()`.
- Treated like the existing start / game-over stop-screens (a centered overlay),
  **not** a `MovablePanel` — it is a full-stop screen, not a floating panel over
  live play.

### 3. Victory record (meta, persisted, non-monetary)

- New localStorage key `osrs_td_victories`, written from `GameRoot.tsx` like the
  rest of meta-progression. Stores: total victories, fastest clear time, highest
  Endless wave reached, and per-mode (`classic` / `roguelite`) counts.
- Surfaced in a "Victories" tab that **reuses the Collection-Log detail pattern**
  (`LogDetail` in `GameRoot.tsx`) — matches the completionist ask in #28.
- First-ever victory lights the record and marks the player "champion" on the start
  screen. **No power reward, no gold** (per project direction: reward non-monetary,
  never inflate gold).
- Records update on victory and on Endless death (highest Endless wave).

### 4. The curve — "both, contained"

Two independent levers; together they guarantee the threat overtakes any fixed board.

**(a) Diminishing returns on stacked global damage multipliers (player side).**
Accumulate card damage buffs as an additive bonus sum **per style**, then fold them
through a concave/asymptotic curve so the *effective* multiplier approaches a
per-style ceiling: the first cards pay full value, late stacking tapers. Reuses the
`diminishingSum` philosophy already applied to auras (`tower-combat.ts:192`). A pure
helper (`softCapMult` in a new `lib/game/systems/run-modifiers.ts`, or extended in
`tower-combat.ts`) owns the curve. Exact knee/ceiling numbers are the user's to tune
in playtest; the design fixes the **shape** (monotonic increasing, concave, bounded,
first-unit ≈ full value).
- Side benefit: also curbs the pre-victory "+900% by wave 50", partly addressing #29
  before Endless even begins.
- *Rejected alternative:* soft-cap the final product instead of re-accumulating as a
  diminishing sum — the re-accumulation is more idiomatic (mirrors the existing
  `diminishingSum`) and better preserves "early cards matter".

**(b) Endless HP acceleration (enemy side, post-victory only).**
When `runPhase === 'endless'`, `hpScaleForWave` gains a gentle **exponential** term
in waves-past-victory (small base, ~1.02–1.04). The pre-victory curve is unchanged,
so the normal run to ~wave 90 keeps its current, already-tuned feel. A pure
`endlessHpMult(wave, victoryWave)` owns it.

Net: player side is asymptotic (bounded ceiling); enemy side is eventually
exponential in Endless → the threat overtakes with certainty.

### 5. Testing (the repo's regression net)

Pure, unit-tested functions:
- `softCapMult(bonusSum)` — strictly increasing, concave, bounded ceiling, first
  unit ≈ full value.
- `endlessHpMult(wave, victoryWave)` — equals 1 up to and at the victory wave,
  strictly increasing after, eventually exceeds any constant.
- Per-run boss march — a run covers all of `SCHEDULABLE_BOSSES` in order regardless
  of lifetime `bossesSeen`; victory fires exactly when the last is met.

Victory flow / UI / champion mark: headless verification (game-verify), since the
engine and `GameRoot.tsx` carry no unit tests.

### 6. Files touched (approximate)

- `lib/game/systems/enemy-scaling.ts` — `endlessHpMult`; fold into `hpScaleForWave`
  when Endless.
- `lib/game/systems/run-modifiers.ts` (new) **or** `tower-combat.ts` — diminishing
  fold for stacked global damage multipliers.
- `lib/game/systems/wave-generation.ts` — per-run unmet-boss parameter for the
  scheduled slot.
- `lib/game/core/engine.ts` — `bossesKilledThisRun`, `won`, `runPhase`, victory
  check on wave-clear, UI emit, `restart()` reset.
- `lib/game/types.ts` + `UIState` — `won`, `runPhase`, victory-summary keys.
- `components/game/GameRoot.tsx` — victory panel, Victories/trophies tab (reusing
  `LogDetail`), start-screen champion mark, `osrs_td_victories` persistence.
- Tutorial mirror — `LEARN_STEPS` + `TLDR` describe the victory milestone + Endless.
- Changelog — `feat`.

## Out of scope (queued)

- A2 (cards & economy), A3 (tower spam / perf), A4 (New Game+ / harder tier).
- Card rarity coherence (#33), Soul Eater vs food tuning (#28) — A2.

## Constraints (project standing rules)

- Board is fixed 1728×768; game logic never depends on screen size.
- Assets come only from the local OSRS cache; never hot-link.
- Rewards are non-monetary; never inflate gold.
- In-game strings stay in English; the tutorial (`LEARN_STEPS` + `TLDR`) must mirror
  any UI added.
- Balance numbers are the user's to tune; the spec fixes shapes, not final values.

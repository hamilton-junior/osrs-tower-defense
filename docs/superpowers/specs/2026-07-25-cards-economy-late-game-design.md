# Cards & economy with meaning in the late game — Design (A2)

**Date:** 2026-07-25
**Status:** Approved (brainstorm). Next step: implementation plan.

## Goal

Keep the roguelite's gold↔cards loop meaningful in the late game. Today the loop
breaks: once stacked tower damage saturates the A1 damage soft-cap, buying another
card no longer converts gold into power, so **gold and cards die together** — the
economy piles up with nothing worth buying, and late draft hands are dead weight.

A2 fixes the *coupling*, not the numbers: the draft pool **smoothly changes
character as the run climbs**. Raw-damage stat cards and late-dead resource cards
fade from the odds; the repeatable cards that already escape the damage cap
(range / attack-speed) and the rule-changing behavioural/synergy cards rise. Gold
keeps a live sink because late rolls once again deliver value that matters. To stop
the late game from simply relocating the runaway onto attack-speed and range, the
A1 damage soft-cap is **mirrored onto the fireRate and range run modifiers**.

This is sub-spec **A2** of the late-game balance theme (Tema A). Its siblings:

- **A1 — Victory + Endless + a curve that overtakes** (shipped, branch `wip`).
- **A3 — Tower spam & performance** (suggestion #27, idea #26.1). Not this spec.
- **A4 — New Game+ / harder difficulty tier** (near-future). Not this spec.

## Source suggestions

- **#28 Card Balance, and Suggestions** — essence/slayer/range cards become
  meaningless late; the core is open (rarity-by-power `d3ccf3c` and Soul Eater
  `bf84a88` only touched it).
- **#33 Card Categories** — card power/coherence in the late game.
- **#27 Ease of Late Game** — "gold & slayer cost scale past card price; cards scale
  base faster than monster HP." A1 addressed the HP/damage curve; A2 addresses the
  card/economy half of the same root observation.

## Scope decisions (locked in brainstorm)

The brainstorm walked a chain of forks; each choice narrows the design:

1. **Core = the whole loop** (gold + cards), not either half alone. The two pains
   are one pipe clogging: when damage saturates, spending gold stops buying power.
2. **Late gold converts into cards that escape the cap** — one system, not a new
   parallel store or a wagering layer. The pool changes *what it delivers*, from raw
   damage to value the soft-cap does not touch.
3. **Mechanism = smooth per-wave re-weighting** — same pool, sliding odds. No new
   card tier, no per-card foil state.
4. **Fuel = repeatable range/fireRate** — the deep late leans on the stat cards that
   already escape the *damage* cap and can be drawn repeatedly. No new card content.
5. **Consequence = soft-cap fireRate AND range** — leaning the late onto those stats
   reopens a runaway on attack-speed; range is capped too, for consistency.
6. **Re-weight model = category-derived bias** (Approach A) — a pure function derives
   each card's late affinity from its `effect.kind`; the 50 card definitions are not
   touched.

### Explicit non-goals

- **No change to card-roll cost or gold income.** The geometric roll cost
  (`cardRollCost`, 50→75→113…) stays. The coupling fix is that late rolls deliver
  value again, so the existing sink stays worth paying into. Retuning economy
  numbers is balance work (the user's, via playtest).
- **No new cards, no new card tier, no foil/evolve state.** A2 is a re-organisation
  of the existing pool plus two soft-caps.
- **Pre-late game is untouched.** Below the ramp start, every weight is ×1 — the
  early/mid draft the player already knows is unchanged.

## Current state (verified against code)

- `rollDraft(rng, count, pool, weights)` (`lib/game/systems/roguelite-draft.ts`)
  rolls a hand weighted by `weights: Record<DraftRarity, number>` — already a
  swappable per-rarity weight (default `RARITY_WEIGHT`, `BOOSTED_RARITY_WEIGHT` for
  boss hands). It has **no per-card** weight axis and **no wave awareness**.
- Behavioural / placement-synergy cards are `unique` — drafted once, then dropped
  from the pool for the rest of the run (`availableCards`). They are finite fuel.
- `range` / `fireRate` stat cards are **not** `unique` → repeatable, and stack
  multiplicatively into `runMods.range` / `runMods.fireRate`.
- The damage soft-cap lives only at `tower-combat.ts:211`:
  `damageMultiplier *= softCapMult(ctx.runMods.damage[s])`. The very next two lines,
  `rangeMultiplier *= ctx.runMods.range[s]` and
  `speedMultiplier *= ctx.runMods.fireRate[s]`, are **raw** (uncapped).
- `softCapMult(raw, ceiling = DAMAGE_MULT_CEILING)` (`run-modifiers.ts`) already
  takes a `ceiling` parameter — the concave curve is reusable as-is for other stats.

## Design

### Block 1 — The classifier and the re-weight function (core)

**File:** `lib/game/systems/roguelite-draft.ts` — new pure logic, unit-tested.

A card's **late affinity** is derived purely from its `effect.kind` (no annotation
on any card definition):

| Affinity | Kinds | Behaviour as wave climbs |
|---|---|---|
| **fade** (loses weight) | `damage` (the capped stat), `essence`, `slayerPoints` | weight slides down to a **floor** (~0.25×), never zero |
| **rise** (gains weight) | `range`, `fireRate`, and every behavioural / synergy kind (`ricochet`, `overkill`, `killStreak`, `lastStand`, `berserker`, `bloodPact`, `greed`, `doubleShot`, `venomTips`, `chainFreeze`, `pierce`, `packTactics`, `trinity`, `vanguard`, `loneWolf`, `mageBuff`) | weight slides up to a **ceiling** (~3×) |
| **neutral** (×1) | `life`, `maxLife`, `multi` | unchanged |

Pure function:

```
lateAffinity(effect) → 'fade' | 'rise' | 'neutral'      // switch on effect.kind

lateWeightMult(card, wave) → number                     // multiplies RARITY_WEIGHT[card.rarity]
  t = clamp((wave - RAMP_START) / (RAMP_FULL - RAMP_START), 0, 1)   // e.g. 20 → 60
  switch lateAffinity(card.effect):
    fade:    lerp(1, FADE_FLOOR, t)      // ~1 → 0.25
    rise:    lerp(1, RISE_CEIL,  t)      // ~1 → 3
    neutral: 1
```

**Tuning constants (numbers are the user's to tune; the spec fixes only the shape):**
`RAMP_START`, `RAMP_FULL`, `FADE_FLOOR`, `RISE_CEIL`.

**Invariants (enforced by tests):**

- Monotone in `t` (and therefore in `wave`) for each affinity.
- **fade never reaches zero** — a damage/resource card can still appear late (the
  player is never locked out, and the eligible pool can never empty).
- **Below `RAMP_START`, every multiplier is exactly 1** — early/mid game untouched.
- neutral is exactly 1 at every wave.

**`multi` (combo) cards** are classified `neutral` for now. If in playtest the
combos come to dominate the late hand, reclassify `multi` by the strongest affinity
among its sub-effects. This is a tuning follow-up, not an architectural change —
recorded, not built.

### Block 2 — Wiring the re-weight into the roll

**Files:** `lib/game/systems/roguelite-draft.ts` (`rollDraft`), and its engine call
site in `lib/game/core/engine.ts`.

`rollDraft`'s per-card selection weight becomes
`weights[card.rarity] * lateWeightMult(card, wave)` instead of `weights[card.rarity]`
alone. Add a `wave` parameter (defaulting so existing callers and tests that don't
care about lateness are unaffected — a default that yields `t = 0`, i.e. all ×1).
The resource-group de-duplication rule and the boosted-weights path are unchanged;
the late multiplier composes on top of whichever rarity table is in play.

The engine passes the current wave when it rolls a hand. No `UIState` change and no
new engine state — the draft UI renders the resulting hand exactly as today.

### Block 3 — Soft-cap fireRate and range

**Files:** `lib/game/systems/run-modifiers.ts`, `lib/game/systems/tower-combat.ts`.

- `run-modifiers.ts` gains `FIRE_RATE_MULT_CEILING` and `RANGE_MULT_CEILING`
  (proposed ~3.5× and ~2.5×; the user tunes). No new curve — `softCapMult` already
  takes a `ceiling`.
- `tower-combat.ts` replaces the two raw lines with
  `rangeMultiplier *= softCapMult(ctx.runMods.range[s], RANGE_MULT_CEILING)` and
  `speedMultiplier *= softCapMult(ctx.runMods.fireRate[s], FIRE_RATE_MULT_CEILING)`.
- Only the **card-stacked** run mods are capped. Other range/fireRate sources
  (mageBuff, wave events, potions, tier stats) are untouched — identical policy to
  the existing damage cap, which caps only `runMods.damage`.

### Block 4 — Testing & verification

- **`lateWeightMult`** (pure): monotonicity per affinity, fade floor > 0, rise
  ceiling, identity below `RAMP_START`, neutral ≡ 1. Plus a `lateAffinity`
  exhaustiveness check so a newly-added `effect.kind` must be classified.
- **`softCapMult`** with the new ceilings: `raw ≤ 1` unchanged; approaches but never
  reaches the ceiling; slope ≈ 1 at `raw = 1` (early cards still pay full value).
- **`rollDraft` integration:** with a fixed RNG, a late-wave hand draws rise-kind
  cards materially more often than an early-wave hand from the same pool; an
  early-wave hand matches today's distribution (regression guard).
- **Gate:** `npx tsc --noEmit` + `npx vitest run` + `npm run build`. The draft UI is
  unchanged (only odds move), so a headless drive is optional, not required.

## Files touched

- `lib/game/systems/roguelite-draft.ts` — `lateAffinity`, `lateWeightMult`, and the
  `rollDraft` weight/`wave` change.
- `lib/game/systems/roguelite-draft.test.ts` — Block 1 & 2 tests.
- `lib/game/systems/run-modifiers.ts` — two new ceiling constants.
- `lib/game/systems/run-modifiers.test.ts` — Block 3 cap tests.
- `lib/game/systems/tower-combat.ts` — wrap range/fireRate run mods in `softCapMult`.
- `lib/game/core/engine.ts` — pass `wave` into `rollDraft`.

## Out of scope (recorded, not built)

- Card-roll cost / gold-income retuning (balance, user's job).
- New cards, a late-only tier, foil/evolve state (#28's equipment layer, #33's item
  hierarchy) — a larger content effort, deliberately not folded in.
- `multi`-card reclassification (tuning follow-up if combos dominate the late hand).

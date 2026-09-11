# Fishing spots — design

**Date:** 2026-09-11
**Roadmap item:** F7 (`docs/feedback-ledger.md`, item 23 — reopened after being *adiado* on 2026-09-03)
**Status:** approved design, ready for an implementation plan

## Goal

Put water on the battlefield and let the player fish it between waves. A cast takes
about three seconds on a progress bar, always grants Fishing XP, and usually — not
always — lands a raw fish. Eating that fish between waves restores lives, capped at
`maxLives`. Fishing becomes the game's fourth skill, with the real OSRS level ladder
behind its five catches.

F7 is the last live Fun-Content item on the ledger: F2 farming shipped, F3 was
discarded, F4 is on hold. It is also the first idea in that section that touches the
**loss** economy. Lives are the run's only real currency of failure, so the design's
centre of gravity is not the fishing — it is the ceiling.

## What exists today, and what does not

**Water does not exist.** `TileFlag` in `systems/terrain-generation.ts` is
`'open' | 'blocked' | 'unbuildable' | 'farming'`, and grepping that file and
`data/biomes.ts` for water, river, sea or lake returns nothing. The ledger's brief
assumed water tiles were a prerequisite already in place; they are not. Building them
is part of F7.

**Three life-restoring precedents already ship**, so restoring lives is not the novel
part:

- the kebab diversion payload (`core/engine.ts`, `case 'life'`), which *sells itself
  for gold* when the player is already at full lives;
- the Ranarr farm buff;
- Herblore potions, which heal `Math.min(this.maxLives, this.lives + def.lives)` and
  refuse to be drunk when the player has too few lives to pay the cost.

The kebab's sell-at-cap line is the direct precedent for what an uneaten fish does at
full health.

**Four seams the feature plugs into, all already built:**

- `GameEngine.isTerrainBlocked` returns `tiles[...] !== 'open'`, and
  `isValidPlacement`'s first line is `if (isBlockedTile?.(x, y)) return false;`. A new
  `TileFlag` is therefore unbuildable for free, with no change to placement code.
- `checkWaveEnd` in `core/sim/waves.ts` already calls `ripenPatches(eng.farmPatches)`
  and `eng.rollDiversions()`. Restocking fishing spots is one more call in that
  between-waves block.
- `components/game/skills-ui.tsx` documents its own extension point at line 32:
  *"Adding a skill is one entry in `SKILLS` plus its page in `SkillPage`."*
- `systems/run-save.ts` documents the optional-field pattern that lets a new feature
  add `field?:` without bumping `RUN_SAVE_VERSION` (currently 5).

## The player's loop

Between waves the player sees bubbles on a water tile. Clicking starts a cast: a
roughly three-second progress bar with the OSRS fishing animation, cancellable by
clicking away. On completion the player always gains XP; a roll decides whether a fish
comes with it. The fish lands in the inventory as a stack. Eating it between waves
restores lives. A spot exhausts after a few casts and restocks several waves later.

Casting is barred during a wave, like sowing a seed. Nothing about the loop asks the
player to react to anything on a clock, and nothing about it is mandatory — the same
shape as farming and the D&D spawner.

## Where the water comes from

`TileFlag` gains `'water'`. `TerrainField` gains `spots: { col: number; row: number }[]`
beside its existing `patches`, and `generateTerrain` deals the pool immediately after
the allotments, from the same pool of candidate tiles.

That last point is the load-bearing constraint, and `systems/farming.ts` already states
it for allotments: **a pool only ever stands on ground that was already unusable.**
Every guarantee the terrain makes — the build corridor, `MAX_COVERAGE`, the
defensibility repair — was computed on a field where those tiles were taken, and it
stays true only as long as water never eats open ground. Water also therefore can never
land on the road, which is open by construction.

The pool is a small blob: one seed tile from the already-blocked pool, grown to two to
four contiguous tiles, with one tile of it carrying a spot. A run rolls one or two
pools, the same way it rolls one or two allotments.

`data/biomes.ts` gains a `water` block on `BiomeDef`, defined for all seven regions:

```ts
water: {
  deep: string;
  shallow: string;
  foam: string;   // rgba
  ripple: string; // rgba
};
```

Six regions take an observed palette — Lumbridge river green, Al Kharid oasis blue,
Morytania swamp, Wilderness stagnant grey-green, Trollweiss meltwater under ice,
Karamja tropical shallows. **TzHaar takes a dark steaming volcanic pool**: the region
has no water in OSRS, and the alternative — dealing no pool there — removes the whole
feature from one run in seven with no visible explanation. The TzHaar palette is the
one entry invented rather than observed, and its comment in the table says so.

## The skill

Fishing is the fourth entry in `SKILLS` in `components/game/skills-ui.tsx`, with a
`<FishingPage />` dispatched beside `HunterPage`, `HerblorePage` and `FarmingPage`. It
reuses the Hunter page's locked-row treatment verbatim, including the
`Needs Fishing <level>` title on a row the player cannot reach yet.

The ladder uses **real OSRS levels**, per the standing rule that progression content
validates against the real tier ladder rather than inventing one:

| Fish | Fishing level | Lives restored |
|---|---|---|
| Shrimps | 1 | +1 |
| Trout | 20 | +1 |
| Lobster | 40 | +2 |
| Shark | 76 | +3 |
| Manta ray | 81 | +5 |

The lives column is deliberately flatter than the ledger's original +1/+2/+3/+5/+8. The
ceiling arithmetic below is the reason.

XP follows Hunter's precedent: real OSRS levels on a **run-scaled** curve, because a run
is forty waves and OSRS's real 814k XP to level 76 is not a thing a run can contain.
`fishingXpForLevel` mirrors `hunterXpForLevel`'s shape and is tuned so the ladder's top
rungs are reachable but not routine within one long run.

Anglerfish (level 82) is deliberately **not** a sixth rung, even though
`public/assets/items/anglerfish.png` is already baked. Five rungs already span level 1
to 81; a sixth adds a row to the table and nothing to the decision the player makes.

## Food, lives, and the ceiling

This is the part that needed working out, and it drives two decisions that look
arbitrary on their own.

**XP comes from the cast; the fish comes from a roll.** If every cast landed a fish,
progression and healing would be the same number: reaching level 76 would require
enough casts to heal the player past any sane ceiling. Separating them lets the skill
advance on cast count while the lives supply stays governed by its own dial. It is also
authentic — failing a cast is ordinary OSRS fishing.

The catch chance rises with level (roughly 55% at level 1 to 85% at 99), and the rung
itself is rolled weighted toward the low end of what the player has unlocked, so a
high-level player still pulls mostly trout.

**Healing is capped at `maxLives`.** A fish eaten at full health sells for gold instead,
following the kebab precedent and reusing that message's shape.

Worked arithmetic for a forty-wave run, taking the generous end of every roll — two
pools rather than one, three casts per spot, a four-wave restock, and the catch chance
above:

- roughly 34 casts
- roughly 24 fish
- average 1.3 lives per fish, so roughly **31 lives restored across the run**, against
  `START_LIVES = 20`

The raw total is larger than a full life bar, which sounds alarming until the cap is
taken into account: because healing can never exceed `maxLives`, **fishing can never
return more than the damage the player has already taken.** It softens a bad run; it
cannot inflate a good one. A player who leaks nothing gains nothing but gold.

That total is still the number most likely to need tuning, and the user balances the
game themselves. Three named constants in `lib/game/data/fishing.ts` are the dials:
`CATCH_CHANCE_BASE` and `CATCH_CHANCE_PER_LEVEL` set how often a cast lands anything,
while `SPOT_CASTS` and `SPOT_REST_WAVES` set how much water the run offers at all. The
restock interval is the strongest lever of the set.

**Spot state is counted in waves survived, never in seconds and never in wave numbers** —
the same rule `systems/farming.ts` documents, and for the same reason: the debug wave
control jumps the wave counter, so a spot carries its own tally.

## Components

**`lib/game/data/fishing.ts`** (new) — the catch table (`FishDef`: id, name, level,
lives, xp, icon) and the tuning constants. Pure data.

**`lib/game/systems/fishing.ts`** (new, pure, unit-tested) — the spot record and the
whole of the logic that can be tested without an engine:

```ts
export interface FishingSpot {
  id: string;      // `s<col>_<row>`, mirroring farming's plotId
  col: number;
  row: number;
  x: number;       // board coordinates, derived once from grid
  y: number;
  casts: number;   // casts spent, up to SPOT_CASTS
  rested: number;  // waves survived since it was spent
}

export function buildFishingSpots(field: TerrainField, grid: number): FishingSpot[];
export function spotStage(spot: FishingSpot): 'ready' | 'spent';
export function restockSpots(spots: FishingSpot[]): void;
export function rollCatch(level: number, rng: () => number): FishDef | null;
export function catchesUnlockedAt(level: number): FishDef[];
export function fishingXpForLevel(level: number): number;
export function gainFishingXp(level: number, xp: number, gain: number): { level: number; xp: number };
```

`buildFishingSpots` mirrors `buildFarmPatches` exactly. `gainFishingXp` mirrors
`gainHunterXp`, spending the XP bank one level at a time.

**`lib/game/core/engine.ts`** — three fields (`fishingSpots`, `fishingLevel`,
`fishingXp`) and three methods (`castLine(spotId)`, `landCatch()`, `eatFood(slot)`).
`restockSpots` is called in `checkWaveEnd` beside `ripenPatches`. The cast timer ticks
on `rawDt`, not `dt`, because it is a real-world interface timer rather than a
simulation one — and because the player can only cast while no wave is running, game
speed has nothing to scale.

**`lib/game/core/render/fishing.ts`** (new) — the bubble spot and the cast bar, drawn
from the active biome's `water` palette. Water tiles themselves are drawn by
`render/terrain.ts`, which already switches on `TileFlag`.

**`lib/game/systems/inventory.ts`** — `StackKind` gains `'food'` beside `'herb'` and
`'potion'`. Nothing else in that module changes; `addItem`, `takeItem` and
`countsOfKind` are already kind-agnostic.

**`components/game/skills-ui.tsx`** — one `SKILLS` entry and one `<FishingPage />`.

**`lib/game/assets.ts`** — five fish icons and the spot sprite.

**`components/game/GameRoot.tsx`** — the tutorial mirror: one `LEARN_STEPS` tip, one
`TLDR` line, and a `data-tut` anchor on the Fishing skill row. Both halves stay one
sentence, icon-led, per the player-copy standard.

## Data flow

```
generateTerrain()        deals 'water' tiles + TerrainField.spots
      |  (engine init / run load)
buildFishingSpots()      TerrainField.spots  =>  FishingSpot[]
      |
player clicks a spot between waves
      |
engine.castLine(spotId)  starts the ~3s timer, ticked on rawDt
      |
engine.landCatch()       gainFishingXp always
                         rollCatch gives a FishDef or null
                         a fish becomes addItem(kind 'food')
      |
engine.eatFood(slot)     lives = min(maxLives, lives + def.lives)
                         at cap: awardGold, kebab-style message
      |
checkWaveEnd()           restockSpots(eng.fishingSpots)
```

The UI learns about all of it through `UIState` keys — `fishingSpots`, `fishingLevel`,
`fishingXp`, `fishingXpNeeded`, `castProgress` — added to `core/engine-state.ts`
**before** anything emits them, or the build fails on the excess-property check.

## Persistence

`systems/run-save.ts` gains two optional fields, so `RUN_SAVE_VERSION` stays at 5:

```ts
fishing?: { level: number; xp: number };
fishingSpots?: { id: string; casts: number; rested: number }[];
```

This is the documented pattern the file already uses for `hunter`, `farmPatches` and
`herbloreLevel`. An old save loads with no fishing progress and a fresh set of spots
derived from its terrain, which is correct: the terrain is regenerated from the same
seed, so the pools land in the same places.

An in-flight cast is never serialized. `snapshotRun()` is a between-waves checkpoint,
and the same reasoning that excludes enemies and projectiles excludes a running timer.

## Assets

Every asset comes from the local OSRS cache. Nothing is hot-linked, and nothing is
substituted.

| Asset | Source | Status |
|---|---|---|
| `shark.png` | item render | already baked |
| `shrimps.png`, `trout.png`, `lobster.png`, `manta_ray.png` | `node scripts/render-osrs-items.mjs` | to bake |
| fishing spot bubbles | `npm run extract:sprites` | to bake |
| fishing animation | the existing spotanim / anim pipeline | to source |

`assets.test.ts` fails the build if `data/fishing.ts` names an icon with no bake behind
it, so the bake has to land before or with the data table.

If the spot GFX or the animation cannot be sourced from the cache, the implementation
stops and asks rather than substituting a stand-in.

## Testing

`lib/game/systems/fishing.test.ts` covers the pure half:

- `rollCatch` never returns a fish above the given level, and weights toward the low
  rungs at high level
- `rollCatch` returns `null` at a rate matching the catch chance for that level
- `restockSpots` counts waves, not seconds, and a spent spot becomes ready exactly
  `SPOT_REST_WAVES` waves later
- `gainFishingXp` spends a multi-level bank one level at a time and never exceeds 99
- `fishingXpForLevel` is monotonic, and reaches level 81 inside a plausible run's cast
  count
- `buildFishingSpots` produces one spot per `TerrainField.spots` entry, at the right
  board coordinates

A terrain test asserts that `'water'` tiles only ever replace already-unusable ground —
the invariant the whole placement guarantee rests on.

The engine and `GameRoot.tsx` have no unit tests, so the gate (`npx tsc --noEmit`,
`npx vitest run`, `npm run build`) says nothing about whether the cast bar, the spot
hitbox or the restock actually behave. Those get driven in the headless harness.

## Out of scope

- Cooking. Raw fish restores lives directly; a second skill in front of the first one
  turns a between-waves click into a between-waves chore.
- Fishing during a wave.
- Anglerfish as a sixth rung.
- Any fish that grants something other than lives or gold.
- Water as a tactical obstacle the player can place or remove. Pools are terrain, dealt
  by the generator, exactly like the boulder fields they replace.

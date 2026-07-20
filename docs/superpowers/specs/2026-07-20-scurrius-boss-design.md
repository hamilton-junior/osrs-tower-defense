# Scurrius — the tier-0 companion to Brutus

**Date:** 2026-07-20
**Status:** approved (design), not yet implemented

## Problem

Nine bosses ship today, and `docs/boss-design.md` records which mechanic axes they have
taken. **Axis E — splitting / swarm — is open**, and the build order puts Scurrius next:
the tier-0 companion to Brutus, whose job is to teach that AoE exists.

Brutus is the quality bar. He works for five reasons, and a new boss has to clear all
five:

1. He asks **one question about the board**, not one attack.
2. **The player causes the mechanic** — he rages from taking damage, never on a metronome.
3. **Every state is visible** — model swap plus an overhead.
4. **He pays a price** — he never skips road; every rampage costs him time.
5. He is **faithful to the real fight**, and the one deviation (the demonic skin) is
   documented as ours.

The naive Scurrius — spits rats on a timer — fails #2 outright, which is exactly the
failure that made the first two tower-disable attempts (Vorkath, Hydra) indistinguishable
from nothing happening.

## Design

### The question

> **Does your board handle HP that has been redistributed, or only HP that is stacked?**

No shipped boss asks this. The Giant Mole asks about **space** (did you stack one
killzone?). Cerberus asks about **composition** (what is your damage made of?). Scurrius
asks about **shape**: the same pool of life, split into pieces that move on their own.

### The keystone: HP is conserved, never created

When a rat shears off, **Scurrius's own bar visibly drops** by exactly the HP the rat
carries. Nothing is added to the encounter; the same total only **changes shape**.

This is what makes the mechanic fair rather than punitive. A board with AoE takes the
shape change for free — better than free, since AoE hits several rats at once. A pure
single-target burst board manufactures its own problem, and manufactures it *by a visible
choice*, not by a dice roll.

### The cycle

| State | Trigger | What the player sees | What happens |
|---|---|---|---|
| `calm` | — | Scurrius walking | normal path movement |
| `shear` | a single hit ≥ 5% of his max HP | a rat leaps off him, **his bar drops** | rat spawns carrying 6% of his max HP, taken from him |
| `squeak` | every ~12s | he **stops**, `*squeaks*` overhead | guaranteed floor: one rat, even against chip damage |
| `wander` | (on the rat) | rat skitters around the board, **off-road and over towers** | ~5s of random movement; it is aggro bait |
| `return` | (on the rat) | rat turns, **a thin tether links it to the king** | runs back; on arrival it refunds its remaining HP |

The shear is the identity. The squeak is only the floor that guarantees the mechanic
appears at all.

### The wander is the point, not flavour

The rats do not simply run away and come back. They **wander the board at random —
leaving the road, crossing over towers** — for the duration of the wander state.

This makes them **aggro bait**. A rat drifting through a tower's range pulls that tower's
fire off Scurrius, which is simultaneously the right play (killing the rat denies the
refund) and the wrong play (the king is not dying). Targeting priority interacts with it
directly: a wandering rat can genuinely hijack a `first`/`closest` tower.

**Rats do not disable the towers they cross.** They are a distraction, not sabotage. The
tower-disable look (40% alpha + the prohibited sign) stays reserved for Brutus's trample
and the Volatile affix, where the cause is something the player watched happen.

Wander targets are picked at **uniform random within a leash radius** of the shear point —
no bias toward towers. Towers get visited naturally because they sit near the road, and an
unbiased walk keeps the rat from reading as a homing threat.

### Visibility

Brutus needed a model swap because his rage was an *internal state*. Scurrius does not:
**the state is a new creature appearing while his bar drops in the same frame**, which is
more legible than any skin swap. Rule 1 of the visual-state hierarchy is satisfied by the
entity itself.

The one genuinely invisible moment is the **refund**, and it gets dedicated treatment:

- A **thin tether** drawn from a returning rat to Scurrius. It is the warning — *this is
  about to go back inside him*.
- A **green heal number** on Scurrius at the moment of arrival, closing the causal loop.

### What he pays

He stops on every squeak, and **HP is never created** — it only changes shape, and can
change back. Burst stays strong; it simply stops being sufficient on its own.

### Numbers

All tunable; these are starting values.

| Constant | Value | Why |
|---|---|---|
| Shear threshold | 5% of max HP in one hit | big hits shear, chip damage does not |
| Rat HP | 6% of his max HP | taken from him, not added |
| Shear cooldown | 1.2s | stops one AoE volley producing five rats in a frame |
| Max live rats | 5 | the anti-frustration cap — it binds the squeak as well as the shear |
| Shear floor | **12%** HP | below this he stops shearing; the endgame is a clean fight |
| Squeak interval | 12s | the guaranteed floor |
| Rat speed | 1.6× his | rats are fast; they get clear of him quickly |
| Wander duration | ~5s | then it turns and heads back |
| Wander leash | ~4 tiles from the shear point | keeps the distraction near the action |

### The four edge cases that decide whether it is fair

1. **He dies with rats alive** → the rats **do not** die with him. The HP left his bar and
   is still on the board: they become ordinary Giant rats that walk the road, leak, and
   cost a life like any enemy. Without this, pure burst would erase the mechanic for free
   and "HP is conserved" would be a lie.
2. **A rat is off-road when the king dies** → it paths back to the nearest point on the
   road and resumes walking to the base, the same way Brutus returns from a dash.
3. **A large AoE hits him** → the 1.2s shear cooldown and the cap of 5 mean the answer is
   never an avalanche.
4. **A chip-damage board** → never triggers a shear; the squeak floor guarantees the boss
   still teaches AoE.

## Fidelity risk (verify before writing code)

The local OSRS cache must be confirmed to hold **Scurrius** and **Giant rat** with usable
walk / hurt / death sequences, plus his real elemental weakness from the infobox. Brutus is
honest only because those came verified rather than remembered. **If Scurrius is not in the
cache, the boss is not viable under the assets rule** and the roster falls back to General
Graardor (axis G — his slam disables the towers that hurt him most recently, which reuses
Jad's damage-event ring buffer keyed per tower).

Sequence ids are picked by the `npc-anim-auditor` agent, never by eye.

## What it touches

| Layer | Change |
|---|---|
| `lib/game/types.ts` | `EnemyType` gains `scurrius`, `giant_rat` |
| `lib/game/data/enemies.ts` | two stat blocks; `giant_rat` carries `summonedBy: 'scurrius'` |
| `lib/game/data/drops.ts` | loot tables for both |
| `lib/game/systems/boss-mechanics.ts` | `BossId` gains `scurrius`; constants; pure functions: `scurriusShouldShear`, `scurriusRatHp`, `ratWanderTarget`, `ratShouldReturn`, `ratRefund` |
| `lib/game/systems/boss-mechanics.test.ts` | unit tests per pure function, incl. HP conservation |
| `lib/game/systems/boss-tips.ts` | the "how to kill it" line |
| `lib/game/core/engine.ts` | shear hook in `damageEnemy`; rat wander/return stepping; refund; the king-dies handoff |
| `lib/game/core/renderer.ts` | the return tether |
| `lib/game/core/sound.ts` | `death_scurrius`, `death_giant_rat`, the squeak |
| `scripts/enemy-anims.config.json` | npc + sequence ids, then bake |
| wave presence | tier-0 landmark, near Brutus |
| `docs/boss-design.md` | move axis E to taken; add the Scurrius section |

## Verification

`npx tsc --noEmit` + `npx vitest run` at each step. `npm run build` is known broken
(pre-existing webpack `WasmHash` crash) and is not a gate. The baked sprite sheets are
checked by eye before persisting. Balance is the user's job.

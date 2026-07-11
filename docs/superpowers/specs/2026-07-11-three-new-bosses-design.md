# Three new bosses: Giant Mole, Grotesque Guardians, Cerberus

**Date:** 2026-07-11
**Status:** approved

## Why

The game has four mechanic bosses and each owns exactly one idea:

| Boss | Idea it tests |
|---|---|
| Zulrah | style coverage (rock-paper-scissors weakness) |
| Vorkath | patience (periodic invulnerability + a frozen tower) |
| Jad | target priority (healers that must die first) |
| Alchemical Hydra | burst (a break-the-vent DPS check) |

With [`rollWaveBosses`](../../../lib/game/systems/wave-generation.ts) now sending a boss every 10 waves and drawing at
random once all have been met, the rotation is the endgame's whole texture — and four
bosses is a thin rotation. Three more, each on an axis none of the existing four touch.

**Non-goal:** more of the same. A boss that is "Jad but tankier" is not worth the bake.
Each new boss must fail the question "could I have gotten this fight by re-tuning an
existing one?"

## The three

### 1. Giant Mole — the burrow (axis: **mobility**)

NPC 5779 (walk 3313). The only boss that refuses to fight where you built.

Every `MOLE_BURROW_INTERVAL` seconds it **burrows**: untargetable and hidden for
`MOLE_BURROW_SECS`, then it **surfaces `MOLE_BURROW_HOPS` waypoints further along the
path**, skipping that stretch entirely. A board that funnels everything into one kill-box
watches the Mole reappear *past* it.

**The guardrail matters as much as the mechanic:** it will not burrow when fewer than
`MOLE_MIN_REMAINING` waypoints are left. The final approach is always fought honestly —
there is no burrow-straight-into-the-base. Below `MOLE_FRENZY_HP` it burrows on a shorter
interval.

*Why it's cheap:* enemy movement is already `pathIndex` + `this.path[pathIndex + 1]`, so
surfacing ahead is an index bump and an x/y snap. Untargetable reuses Vorkath's
`state.immune` (damage ×0) **plus** a targeting filter, so towers don't waste shots on a
hole in the ground.

*Tier:* the gentlest boss. It becomes the wave-10 introduction (see "Intro order").

### 2. Grotesque Guardians — Dawn & Dusk (axis: **kill order**)

NPCs 7852 (Dawn, walk 7768) and 7851 (Dusk, walk 7782). They arrive as a **linked pair**.

- While **both** live, each takes `GUARDIAN_LINK_DAMAGE_MULT` (×0.5) damage — the statues
  share their stone.
- Kill one and the survivor **enrages**: the link mitigation lifts (it takes full damage)
  and it speeds up — but it also starts a `GUARDIAN_REVIVE_SECS` timer.
- If the survivor dies inside that window, both stay dead. If the timer runs out, the
  fallen twin **resurrects at the survivor's position** with `GUARDIAN_REVIVE_HP_FRAC` of
  its max HP and the link is restored.

So killing one early is a *trap*: it converts a 50% mitigation into a race you may not
win. The intended play is to bleed both down together and converge at the end. No existing
boss punishes the **order** you kill things in.

*Structural consequence:* Dawn cannot be scheduled on her own — she only arrives with
Dusk. That forces the boss-id split below.

### 3. Cerberus — the three Summoned Souls (axis: **style lock**)

NPC 5862 (walk 4488) plus the three Summoned Souls, which already exist in the cache as
distinct NPCs: 5867 / 5868 / 5869 (walk 8527).

At each HP threshold Cerberus summons the three souls. **Each soul locks one combat
style**: while the melee soul lives, Cerberus takes only `CERBERUS_SOUL_LOCK_MULT` (×0.15)
from melee towers; likewise ranged and magic. With all three standing he is armoured
against everything, and the only way forward is through the souls.

The decision this creates is *which soul to kill first*, and the answer depends on the
board you actually built — a mono-style board has exactly one soul that matters, a spread
board must clear more. That is not Jad's "kill the adds" (his healers are
interchangeable); the souls are not interchangeable.

Souls orbit Cerberus rather than walking the path, exactly like Jad's Yt-HurKot healers.
Dead souls return at the next threshold. Below `CERBERUS_ENRAGE_HP` he enrages.

## Structural changes

### (a) Split the boss-id lists

`MECHANIC_BOSSES` currently answers two different questions: *who gets a `BossState`?* and
*who can the wave schedule draw?* Dawn breaks that: she needs a `BossState` but must never
be drawn on her own. Split them in `systems/boss-mechanics.ts`:

- **`MECHANIC_BOSSES`** — everyone who carries phase state (adds `giant_mole`, `dusk`,
  `dawn`, `cerberus`).
- **`SCHEDULABLE_BOSSES`** — what `rollWaveBosses` draws from and the debug panel offers.
  Everything in `MECHANIC_BOSSES` **except `dawn`**.

`wave-generation` switches to `SCHEDULABLE_BOSSES`; the engine's `bossKind` check stays on
`MECHANIC_BOSSES`.

### (b) `escort` generalises `healer`

Jad's healers already are "a companion that orbits its boss, never walks the path, never
leaks, and awards nothing". Cerberus's souls are the same thing minus the healing. Promote
that shape to `escort?: boolean` + `ownerId?: string` on `Enemy`; `healer?: boolean`
remains, but now means only "heals its owner" (Jad's behaviour) and rides on top of
`escort`. Orphan cleanup keys off a missing `ownerId`, so it works for both.

### (c) Intro order

`SCHEDULABLE_BOSSES` order is the order a fresh account meets them on waves 10, 20, 30…:

```
giant_mole → jad → vorkath → zulrah → dusk → cerberus → hydra
```

The Mole replaces Jad as the wave-10 introduction — a far fairer door — and the Hydra
closes the ladder as the hardest. `bossesSeen` is lifetime, so an existing account meets
the three new ones on its next ×10 waves and then returns to the random draw.

## Boundaries

Unchanged from the Hydra's shape, because it works:

- **Pure + tested** in `systems/boss-mechanics.ts`: constants, phase/threshold maths,
  target selection. No `this`, no DOM, no entities.
- **The engine** owns timers, entities, and the mutation of `BossState` (`handleBossMechanics`
  → one `update<Boss>(e, dt)` per boss).
- **The renderer** owns every telegraph and reads state through `this.e`; it keeps none.

## Assets

Six new bakes from the local OSRS cache via `scripts/render-osrs-npc-anims.mjs` +
`scripts/enemy-anims.config.json` (`{ npc, anims: { walk, hurt, death } }`), plus death
sounds via `scripts/extract-osrs-sounds.mjs`. Walk ids are known (above); hurt/death ids
are discovered from the neighbouring sequence block, as with every other enemy.

## Sequence

One boss at a time, each `tsc` + vitest green and driven headlessly before its own commit:

1. Giant Mole (also lands the (a) split)
2. Grotesque Guardians (also lands the (b) `escort` generalisation)
3. Cerberus

Balance knobs are named constants, all in `systems/boss-mechanics.ts`. Playtest tuning is
the user's.

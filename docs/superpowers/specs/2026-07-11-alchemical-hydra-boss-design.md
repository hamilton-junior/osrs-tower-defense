# Alchemical Hydra — the fourth mechanic boss

**Date:** 2026-07-11
**Status:** approved

## Problem

The game has three signature bosses, each built on one clean idea:

| Boss | Idea | What it asks of the player |
|---|---|---|
| Zulrah | rotating style weakness | switch combat styles |
| Vorkath | periodic invulnerability + freezes one tower | weather it, don't out-DPS it |
| Jad | summons healers below 50% that claw back recent damage | kill the adds fast |

The **Hydra** already exists in `lib/game/data/enemies.ts` and already headlines wave 100 in
`LANDMARK_WAVES` — but it is a plain enemy: no `isBoss`, no entry in `MECHANIC_BOSSES`, no phase
logic. It is a boss-shaped hole with the art already baked.

We want a fourth boss with a **fourth distinct idea**, and the Hydra is the cheapest path to it:
every sprite (`public/assets/enemies/hydra/`) is already in the tree.

## Design

### The fourth idea: a DPS check

Zulrah tests *style coverage*, Vorkath tests *patience*, Jad tests *target priority*. The Hydra
tests **burst**: it periodically hardens and starts healing, and the player must break through
before the heal outruns them.

This is the OSRS Alchemical Hydra's real identity — the chemical phases and the "handle the
transition correctly or it heals" chamber mechanic — adapted to a tower defense (there is no
player avatar, so the OSRS pool/wall avoidance mechanics do not port; the chain-lightning does).

### Phases

Three chemical phases, advanced by *shattering a vent* (not by HP alone), plus a final enrage.

| Phase | Reached by | Tint |
|---|---|---|
| Serpentine (green) | start | `#3fbf57` |
| Electric (blue) | shattering vent 1 | `#4a86e8` |
| Flame (red) | shattering vent 2 | `#d4452f` |
| **Enrage** | HP ≤ 10% | red, pulsing |

### The Chemical Vent (the core loop)

When the Hydra's HP crosses a threshold (**66%**, then **33%**) it opens a **vent** for a
**5-second window**, telegraphed with a ring, a banner, and a break-progress bar:

- While venting it is **hardened**: it takes **×0.2 damage** (via `bossStyleMult`).
- While venting it **regenerates** ~**3% max HP per second** (reusing Jad's green heal hitsplat).
- **Break it:** if the damage that *lands* during the window reaches **8% of max HP**, the vent
  **shatters** → the phase advances (colour changes), the chain-lightning fires, and the Hydra is
  briefly **vulnerable** (the existing `vulnTimer`, ×1.25, for 2s) as the reward for the burst.
- **Fail it:** if the window closes unbroken, the heal it accumulated stands and the vent closes.
  HP is now back above the threshold, so knocking it down re-opens the vent — a soft stall loop
  until the player can muster the burst. It never heals to full; failing costs time, not the run.

Damage still lands during the vent (at 20%), so the fight never hard-locks — a player who
out-paces the heal but not the break target grinds through slowly.

### Chain lightning

Fires **on every shatter**, and on a **6s cadence while enraged**. It picks the tower nearest the
Hydra, then arcs greedily to the nearest unvisited tower, **3 towers total**, **disabling each for
2.5s** (`tower.disabledTimer`, the same field Vorkath's freeze uses). Distinct from Vorkath: that
is one tower on a long timer; this is a *line* of towers, and it fires when the player is winning.

Rendered with the existing `addBolt` FX (`kind: 'bolt'`) — no new FX kind needed.

### Enrage

At **HP ≤ 10%**, the Hydra enrages: **`baseSpeed` ×1.35** and the lightning goes on cadence. Speed
is raised on `baseSpeed` (not `speed`) so existing slows keep working — they recompute from
`baseSpeed`. `naturalSpeed` is left alone, so the UI correctly reads it as *hastened*.

### Cadence

- **New landmark at wave 45** — the Hydra's debut. Thanks to the existing `bossesSeen` system this
  first sighting is **vanilla** (no affixes).
- **Wave 100 stays** — it returns as the capstone, now rolling boss affixes.

No other wave changes.

## Architecture

Follows the established boss pattern exactly.

**Pure + unit-tested — `lib/game/systems/boss-mechanics.ts`:**
- `BossId` gains `'hydra'`.
- `HYDRA_PHASES`, thresholds and tuning constants.
- `hydraPhase(shattered)`, `hydraNextThreshold(shattered)`, `hydraShouldVent(hpFrac, shattered, venting)`,
  `hydraBreakTarget(maxHp)`, `hydraVentHeal(maxHp, dt)`, `hydraIsEnraged(hpFrac)`,
  `hydraZapChain(towers, x, y, count)` (greedy nearest-neighbour hops).
- `bossStyleMult` returns `HYDRA_VENT_DAMAGE_MULT` while venting.
- `BossState` gains `venting`, `ventTimer`, `ventDamage`, `shattered`, `enraged`, `zapTimer`.

**Stateful — `lib/game/core/engine.ts`:**
- `MECHANIC_BOSSES` gains `'hydra'` (this also folds it into `sanitizeBossesSeen`, so persistence
  needs no other change).
- `handleBossMechanics` → new `updateHydra(e, dt)`: vent timers, heal, shatter, enrage, zap cadence.
- `damage()` records landed damage onto `bossState.ventDamage` while venting (mirroring the Jad
  `recentDamage` line right above it).

**Render — `lib/game/core/renderer.ts`:** phase tint on the body, the vent telegraph ring + break
progress bar, and the phase name on the big top boss bar. Extends the blocks that today only
handle `zulrah` / `vorkath`.

**Data:** `enemies.ts` promotes `hydra` to `isBoss: true` (which also removes it from the random
spawn pool, since `wave-generation` filters `!e.isBoss`); `waves.ts` adds the wave-45 landmark.

## Rewards

No bespoke reward. The Hydra uses the existing boss pipeline: gold derived from HP (no gold
inflation) and an automatic Collection Log / `killCounts` entry. A unique Hydra card is a possible
later stretch, deliberately out of scope here.

## Tuning

All constants are starting points; balance is the user's call. The value most likely to need a
first pass is the Hydra's **base HP** — 300 is a normal-enemy number and too low for a boss with a
DPS check. Raised to **1800** (between Zulrah's 1500 and Vorkath's 2250), with `resistance: 0.45`.

## Testing

- Pure helpers get unit tests in `boss-mechanics.test.ts` (phase from shatter count, vent
  open/break/heal maths, enrage threshold, the zap chain order).
- Gate: `npx tsc --noEmit` + `npx vitest run`. (`npm run build` is broken on this machine — a Node
  v24 + webpack issue, not the repo; CI is green.)
- The fight itself is observed in a headless browser via the debug console (spawn the boss).

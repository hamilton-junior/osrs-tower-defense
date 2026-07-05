# DPS Menu + font scaling + Tzhaar knockback — design

Date: 2026-07-05

Three changes, in order: (1) a DPS/damage-meter panel, (2) resolution-aware font
scaling, (3) level-scaled Tzhaar knockback.

## 1. DPS menu (damage meter)

### Goal
A modal panel that shows, per tower, the damage dealt — split **by wave** and as a
**total** across the run — with grouping, effect breakdowns, and a per-enemy
breakdown.

### Data collection — `CombatStatsSystem` (new, `lib/game/systems/combat-stats.ts`)
Per-run subsystem (reset on new run) owning all accumulation. It is fed from the
engine's damage path; it holds an engine back-ref only for reading `wave`.

`damage()` is the single choke point but does not currently know the source. Thread
a `sourceTowerId?` and an attribution `tag` (`'direct' | 'burn' | 'poison' |
'venom' | 'splash' | 'chain' | 'utility-extra'`) through `damage()` (and the DoT
tick + splash/chain paths). Each dealt-damage event calls
`stats.record(towerId, tag, waveNo, enemyType, amount)`.

Per tower it stores:
- identity: `id, type, style (melee|ranged|magic), subcategory` (element / ancient / mode)
- per wave: `{ direct, effectExtra, byEnemy: Map<EnemyType, number>, combatSeconds }`
- effect metrics: `burnDmg, poisonDmg, venomDmg, stunCount, stunSeconds, pushCount,
  pushTiles, slowCount, ampExtra, splashHits, lifestealHeal, taskBonusDmg` (only the
  ones relevant per tower are surfaced).

**Utility "extra":** when a buffed tower fires, compute the damage it would deal
*without* the utility aura and attribute the **delta** to the covering utility
tower(s), split proportionally when they overlap. Recorded as that utility tower's
`effectExtra` (never the boosted total).

**DPS rate:** window = **active combat time**. Accumulate `combatSeconds` per tower
by adding `dt` while the tower has a target and the wave is active. DPS = damage /
combatSeconds (0 when no combat time yet).

**Effect metrics** are recorded where the effect resolves (`applyOnHit`, DoT tick):
pushback → `pushCount++`, `pushTiles += dist / GRID`; stun → `stunCount++`,
`stunSeconds += eff`; burn/poison/venom ticks → the source tower's DoT bucket; etc.

**Global run FX** not owned by a tower (ricochet, Dragon Warhammer smite, soul
split) are bucketed under a synthetic **"Run Effects"** row rather than credited to
an arbitrary tower.

**Emission:** counters always run (cheap increments). The snapshot is emitted to the
UI (as a plain cloneable object in `UIState`) **only while the panel is open**,
throttled (~4/s). Closed → no emit, data still collected.

### UI — modal (Collection Log pattern), `components/game/GameRoot.tsx`
A new **"DPS"** toggle button in the controls bar opens a centered modal. Header:
- **View:** `Por Onda ▾` (wave selector) | `Total`
- **Group:** `Nenhum` (per tower) · `Tipo de Torre` (with subcategories, e.g.
  Wizard › Fire) · `Tipo de Dano` (magic / ranged / melee)
- ☑ **Mostrar torres sem dano** (both modes)
- **Number format toggle:** `Números` ⇄ `% do total` (of the wave in Por Onda, of
  the run in Total)

Body: grouped rows. Each row: icon, name, proportional damage bar **with the number
shown next to the bar** (raw or %), and DPS. Utility rows show the extra granted.

Click a row → expandable detail:
- **breakdown by enemy type** (bars). In **Total** mode this part is **split by wave**.
- **effect stats** per tower: Tzhaar → enemies pushed + total tiles; Fire → burn
  extra dmg; Earth → stun count + total stun seconds; Water → amp extra dmg; Air →
  pushed + tiles; Toxic → venom dmg; Ancients → slow / lifesteal; Cannon → splash
  hits; Slayer → task bonus dmg.

## 2. Font scaling
Raise the "small" utility font sizes by ~2px (proportionally, keeping hierarchy) and
make the base scale with resolution via `clamp()` (larger floor + a `vw` term) so
text is legible without zooming. Confirmed targets: feedback-button description,
elemental effects on the tower panel, and the other `small`/`xs` utility classes.

## 3. Tzhaar knockback — always, scaled by level
Air knockback base = 28. Tzhaar always knocks back (already does; only the amount
changes), scaling by level: L1 = 14 (½), L2 = 28 (=), L3 = 42 (×1.5), L4 = 56 (×2).
The crush stun on L3–L4 is unchanged. Implement via a small `TZHAAR_KNOCKBACK` table
used in `applyOnHit`'s `pushback` and `crush` cases; update the Tzhaar data-file
description comment to reflect the scaling.

## Verification
`npx tsc --noEmit`, `npx vitest run` (add tests for CombatStatsSystem attribution +
Tzhaar knockback table), `npm run build`.

## Deferred (see memory `dps-menu-followups`)
Data-driven per-tower effect-stat registry, UI polish, real OSRS assets — later.

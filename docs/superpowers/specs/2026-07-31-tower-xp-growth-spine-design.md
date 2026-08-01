# Tower XP Growth — Spine Design

> Status: **design (approved in brainstorming)** — 2026-07-31
> Scope: the XP *spine* only. Equippable gear on towers is a **separate follow-up design**.

## 1. Goal

Towers grow by fighting. Every tower earns **combat XP** proportional to the damage it
lands, with a bonus when it hits an enemy weak to its style. That XP raises the tower's
**combat level**, which (a) gives a small, visible per-level stat nudge and (b) **gates
tier upgrades**: buying T2/T3/T4 now needs both the gold *and* a minimum combat level.

The result ties the game's placement depth (`#1`) to participation: a tower must be
positioned to actually fight to be allowed to grow. Idle/benched towers stay weak.

This is **not** net-new scaffolding. Every `Tower` already carries `skills: TowerSkills`
and the XP curve `towerXpForLevel` is already written and tested — the fields are
initialised and then never used. This design *activates* dormant code.

## 2. Vocabulary (read first — there are two "levels")

The `Tower` interface has two independent level concepts. The implementer WILL confuse
them if this isn't explicit. Throughout this spec:

| Term            | Field                              | Bought with | Range    |
|-----------------|------------------------------------|-------------|----------|
| **tier**        | `Tower.level` / `Tower.maxLevel`   | gold        | 1..4     |
| **combat level**| `Tower.skills.<style>.level`       | XP (earned) | 1..N     |

"Upgrade" in the UI means **buy the next tier**. "Level up" means the **combat level**
rose from earning XP. The new gate is: *buying a tier requires a minimum combat level.*

## 3. What's already there (dormant)

- `Tower.skills: TowerSkills` = `{ strength, ranged, magic }`, each `{ level, xp }`,
  initialised to `{ level: 1, xp: 0 }` at every spawn (`core/engine.ts` tower factory).
  Never read or written after init.
- `systems/leveling.ts`: `towerXpForLevel(level) = floor(level^1.8 * 80)` and
  `applyXpGain(skill, gain, xpForLevel)` (single-step: at most one level per call,
  leftover carried) — both tested.
- `Tower.equipment` — reserved for the gear follow-up, untouched here.
- `data/towers.ts` → `TOWER_STYLES[type].style: CombatStyle` — the tower's style.
- `systems/tower-combat.ts` → `calculateTowerStats(tower, ctx)` — the pure per-frame stat
  pipeline (the correct place for the per-level nudge; it already reads `tower` directly).
- `core/engine.ts` → `damage(enemy, amount, kind, minor, silent, depth, style, source)`
  — the single choke point where a hit resolves. It already computes `dealt` (damage that
  reached HP), `style`, `weak = styleWeaknessMult(enemy.styleWeakness, style)`, and knows
  `source.towerId`. This is the XP hook.

## 4. Design

### 4.1 One skill per tower

A tower has exactly one style (`TOWER_STYLES[type].style`), so exactly **one** of its three
`skills` grows; the other two stay at `{level:1,xp:0}` (reserved for the gear follow-up,
where an off-style weapon could plausibly train a second skill). The map is fixed:

```
melee  -> skills.strength
ranged -> skills.ranged
magic  -> skills.magic
```

The tower's **combat level** is the level of that one skill. All XP a tower earns feeds it.

### 4.2 Earning XP (the hook)

In `damage()`, after `dealt` is finalised and applied to HP, credit the source tower:

- Only when `source?.towerId` is set and `dealt > 0` (no XP for zero/absorbed hits).
- XP earned = `dealt * XP_PER_DAMAGE`, multiplied by `XP_WEAKNESS_BONUS` **iff `weak > 1`**
  (the hit exploited the enemy's combat-triangle weakness).
- The XP feeds the skill matching the **hit's** style when the tower's own style matches;
  for style-less damage (DoT ticks: burn/poison/venom arrive with `style === undefined`),
  credit the tower's own style skill at the base rate (no weakness bonus — a DoT has no
  style to be "correct").

Concretely: resolve the tower, pick its style skill, loop `applyXpGain` (a big hit can
cross several thresholds), and on any level-up call `bumpCombatEpoch()` (so the stat cache
recomputes with the new nudge) and emit the tower's updated skill to the UI.

**The magic asymmetry is deliberate.** `StyleWeakness = Exclude<CombatStyle,'magic'>` — no
enemy is ever "weak to magic" in the melee/ranged sense, so a wizard's hits never trigger
`XP_WEAKNESS_BONUS`. A wizard still earns *more* XP on an elementally-correct hit, because
the element multiplier inflates `dealt` before it reaches `damage()` (`core/engine.ts`
fire-time `weaknessMultiplier`), and XP is proportional to `dealt` — it just gets no extra
×bonus on top. This is a balance counterweight: the wizard already owns single-target *and*
AoE (`systems/tower-identity.ts`), so it trains a touch slower than a correctly-matched
melee/ranged tower. Document it; don't "fix" it.

### 4.3 Per-level nudge (visible growth)

In `calculateTowerStats`, layer a small multiplier from the tower's combat level so growth
is felt frame-to-frame, not only at tier gates:

```
levelStatBonus(level) = min(1 + (level - 1) * PER_LEVEL_DMG, PER_LEVEL_CAP)
```

Applied to `damageMultiplier` (a level-1 tower = ×1, i.e. no change; the bonus only grows
from there and saturates at the cap). Chosen as damage-only for the spine — range/fire-rate
stay tier-driven so the nudge reads clearly and can't compound with the run-mod ceilings.

`bumpCombatEpoch()` on level-up is what makes this take effect (the per-tower stat cache is
epoch-keyed; without the bump a levelled tower keeps its stale cached stats).

### 4.4 Tier gate

Each tier beyond T1 requires a minimum combat level **and** the existing gold cost:

```
tierUnlockLevel(nextTier)  // nextTier 2 -> L_T2, 3 -> L_T3, 4 -> L_T4  (tunable constants)
canUpgradeTier(tower) -> { ok: boolean, neededLevel: number }
  ok = tower.level < tower.maxLevel
       && tower.skills[styleKey].level >= tierUnlockLevel(tower.level + 1)
```

Every path that buys a tier consults `canUpgradeTier` before spending gold:
- single-tower upgrade,
- multi-select "upgrade all" (a gated tower is **skipped**, not an error),
- the auto-upgrade tick (respects the gate; the future *level-cap selector*, todo #3,
  plugs in right here as an upper bound alongside this lower bound).

Gold cost and tier stats are unchanged — the gate is purely additive.

### 4.5 Scope & lifetime

- **Universal:** both modes (Classic + roguelite). The XP spine is mode-agnostic.
- **Per-run:** combat XP/levels live and die with the run, like towers and gold. Only
  meta-progression (essence, global upgrades, kill/card counts) persists. No new
  `localStorage` key.
- **Rewards stay non-monetary:** XP grants power, never gold. No gold-inflation.

## 5. Components & data flow

```
enemy hit ──► GameEngine.damage() ──► grantTowerXp(towerId, dealt, weak, style)
                                          │  (systems/tower-xp: styleSkillKey,
                                          │   xpFromHit, applyXpGain loop)
                                          ▼
                              tower.skills[style] mutated
                                 │ leveledUp? ─► bumpCombatEpoch() + emit
                                 ▼
   per frame ──► calculateTowerStats(tower) reads skills[style].level
                   └► levelStatBonus() folded into damageMultiplier
                                 ▼
        emit({ selectedTower: { ...level, xp, nextXp, tierGate } }) ─► GameRoot
                                 ▼
   SelectedTower panel: XP bar + combat level; Upgrade button reflects tierGate
```

### 5.1 New pure module — `lib/game/systems/tower-xp.ts`

Pure, no `this`/DOM, fully unit-tested. Builds on `leveling.ts`:

- `styleSkillKey(style: CombatStyle): keyof TowerSkills` — the fixed map (§4.1).
- `xpFromHit(dealt: number, exploitedWeakness: boolean): number` — base rate × optional
  weakness bonus.
- `levelStatBonus(level: number): number` — the capped per-level damage multiplier (§4.3).
- `tierUnlockLevel(nextTier: number): number` — the gate threshold per tier.
- `canUpgradeTier(tower)` / a small predicate the engine reuses across all three upgrade
  paths (§4.4).
- Balance constants live here as named exports (`XP_PER_DAMAGE`, `XP_WEAKNESS_BONUS`,
  `PER_LEVEL_DMG`, `PER_LEVEL_CAP`, `TIER_UNLOCK_LEVELS`) so the user tunes one file.

### 5.2 Engine (`core/engine.ts`)

- A `grantTowerXp(...)` helper called from `damage()` (§4.2): the multi-level `applyXpGain`
  loop, `bumpCombatEpoch()` + emit on level-up.
- `calculateTowerStats` call sites already pass the `tower`; the nudge reads
  `tower.skills` inside `tower-combat.ts` (pure), no new context field needed.
- The three upgrade paths gated via `canUpgradeTier` (§4.4).
- Emit the selected tower's combat level, current xp, and next-level threshold, plus a
  `tierGate` (`{ ok, neededLevel }`) so the button can render the locked state.

### 5.3 UIState + GameRoot

- Extend `UIState` (in `core/engine.ts`) and the selected-tower emit payload with the
  combat level, xp, next-level xp, and `tierGate`. (Emitting a new key **requires** adding
  it to `UIState` first, or the build fails — game-ui rule.)
- SelectedTower panel (already a `MovablePanel`) gains: a combat-level readout and a small
  `rs-progress` XP bar (English strings — e.g. `Lv 7` + `1,240 / 1,600 XP`).
- Upgrade button: when `!tierGate.ok` because of the level, show it disabled labelled
  `Needs Lv <neededLevel>` (reuse the existing disabled-button styling); when the gate is
  met it behaves as today (affordability check unchanged).
- Multi-select "upgrade all": gated towers are silently skipped (§4.4).

### 5.4 Tutorial mirror (mandatory)

`LEARN_STEPS` + `TLDR` in `GameRoot.tsx` must both describe the new reality (game-ui rule:
change one, change the other):
- A contextual tip (anchor `sidebar` or the tower-panel anchor) that towers earn XP by
  fighting and level up, and that a tier upgrade needs a minimum level.
- A matching TL;DR line in the How-to-Play sheet.

## 6. Error / edge handling

- Zero or fully-absorbed hits (`dealt === 0`): no XP.
- Tower sold mid-flight: `grantTowerXp` no-ops if `towerId` doesn't resolve.
- Style-less DoT: base-rate XP, no weakness bonus (§4.2).
- Big single hit crossing multiple thresholds: `applyXpGain` loop handles multi-level in
  one call; `bumpCombatEpoch` fires once.
- Level-up must invalidate the stat cache (`bumpCombatEpoch`) or the nudge won't apply.
- Multi-select with mixed gates: apply to the eligible, skip the rest, don't abort.

## 7. Testing

**Pure (`systems/tower-xp.test.ts`, Vitest — the regression net):**
- `styleSkillKey` maps each style correctly.
- `xpFromHit`: base rate; weakness bonus applied iff `exploitedWeakness`; magic path (a
  caller that never passes `exploitedWeakness=true`) earns base only.
- multi-level `applyXpGain` loop: a large gain crosses several levels, leftover carried.
- `levelStatBonus`: `level 1 -> 1.0`, monotonic increase, saturates at `PER_LEVEL_CAP`.
- `tierUnlockLevel` / `canUpgradeTier`: gate opens exactly at the threshold; `ok=false`
  with the right `neededLevel` below it; `ok=false` at max tier.

**Engine + UI (headless `game-verify` harness — no unit tests there):** a tower's XP bar
fills as it fires; a tier button shows `Needs Lv X` until the level is reached, then
unlocks; multi-upgrade skips gated towers. Balance itself is the user's to playtest.

## 8. Explicitly out of scope (follow-ups)

- **Equippable gear on towers** (drop → equip, item UI, item balance) — the next separate
  design. The `equipment` field and `Item.bonus` stay dormant here.
- **Auto-upgrade level-cap selector** (todo #3) — plugs into §4.4 as an upper bound; own change.
- Structural placement features (chokepoints / mazing / tile quality) — a later design.

## 9. Addendum — Utility (support) tower XP (post-ship, user-requested)

The original spine credits XP only at the `damage()` hook, so a tower that never attacks
never levels. The **Utility wizard** (`type: 'wizard'`, `mageMode: 'utility'`) is pure
support — it grants range/speed/damage auras to nearby towers and deals no damage — so it
was permanently stuck at combat Lv 1 and thus permanently blocked by its own tier gate.

Fix: a support tower **grows by the damage it enables.** When any tower lands a hit, every
Utility tower whose aura covers that attacker earns `SUPPORT_XP_SHARE` (0.2) of the damage
as XP (`supportXpFromDamage`, pure + tested). This feeds its `magic` skill, so — consistent
with §4.2 — it never receives the ×1.5 weakness bonus. The share is a flat 20%, always less
than what the attacker itself earns, and it scales naturally: more buffed neighbours landing
more damage ⇒ faster growth.

Also corrected here (final-review finding): DoT ticks (burn/poison/venom) carry a stamped
style for boss resistance, so the weakness check `weak > 1` was wrongly granting the ×1.5
XP bonus on every venom/poison/burn tick. Per §4.2/§6 damage-over-time is weakness-neutral
for XP, so the hook now suppresses the bonus for DoT-tagged sources.

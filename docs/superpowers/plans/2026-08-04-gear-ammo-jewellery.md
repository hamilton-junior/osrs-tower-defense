# Gear rethemе — Ammo / Jewellery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the Classic gear "weapon/accessory" model with style-specific **Ammo/Runes/Kit** (slot 1) + universal **Jewellery** (slot 2), built from real OSRS tier ladders via a data-driven generator, plus a shared hover tooltip and a slimmer tower panel.

**Architecture:** Slot 1 is class-gated per tower via an exhaustive `TOWER_AMMO_CLASS` map; the gear pool is generated from per-class tier tables. Signatures live on the universal jewellery slot and carry a `gearEffect` folded per-piece across both slots. All icons baked from the OSRS cache.

**Tech Stack:** Next.js/TypeScript static export; engine in `lib/game/core/`, pure logic + tests in `lib/game/systems/`, content in `lib/game/data/`, UI in `components/game/GameRoot.tsx`.

## Global Constraints

- In-game UI strings + all code identifiers in **English**.
- Feature **gated to `gameMode === 'classic'`** (gear never drops/equips in roguelite).
- Assets **only from the local OSRS cache** — bake via `scripts/render-osrs-items.mjs`; never hot-link, never a placeholder, always the item's live icon.
- Content uses **real OSRS progressions only** (the ladders below are validated); never invent a tier.
- **Data-driven & extensible:** exhaustive `Record<TowerType, …>` maps; the pool is **generated** from tier tables, not hand-written per item. Adding a tower must be a small local change.
- Gear **persists in the per-run Continue autosave** and is **cleared on a new run** (already implemented in `snapshotRun`/`loadRun`/`restart`/`clearRunSave` — do not regress it).
- **Tutorial mirrors the UI:** `LEARN_STEPS` + `TLDR` say the same thing at different depth.
- **Keep the legacy files compiling.** `lib/game/engine.ts` (dead, not rendered) references `tower.equipment` and `Item.type`; tsc checks it, so adjust its few references minimally to satisfy the compiler — do not invest in legacy runtime behaviour.
- Board is fixed **1728×768**; the UI adapts, never the board.
- **Balance is the user's** — no playtest checklists in any report.

## Slot / class model

Slot 1 class per tower (exhaustive over `TowerType = 'archer'|'wizard'|'cannon'|'tzhaar'|'slayer'|'toxic'`):

```
TOWER_AMMO_CLASS: Record<TowerType, AmmoClass> = {
  archer: 'arrows', toxic: 'darts', cannon: 'cannonballs',
  wizard: 'runes', slayer: 'melee_kit', tzhaar: 'melee_kit',
};
AmmoClass = 'arrows' | 'darts' | 'cannonballs' | 'runes' | 'melee_kit';
```

Dynamic slot-1 label (UI): `arrows|darts|cannonballs → "Ammo"`, `runes → "Runes"`, `melee_kit → "Kit"`. Slot 2 label: `"Jewellery"`.

## Ladders (validated OSRS progressions)

Each entry is `{ id, name, levelReq }`; the **bonus** is computed by a per-class rule (below), so numbers live in one place and stay tunable. `id` is the baked-icon slug.

**arrows** (bronze→dragon; amethyst between rune and dragon):
`bronze_arrow`(1) `iron_arrow`(4) `steel_arrow`(8) `mithril_arrow`(13) `adamant_arrow`(19) `rune_arrow`(26) `amethyst_arrow`(34) `dragon_arrow`(44)

**darts** (metal ladder + black):
`bronze_dart`(1) `iron_dart`(4) `steel_dart`(8) `black_dart`(11) `mithril_dart`(14) `adamant_dart`(19) `rune_dart`(26) `dragon_dart`(40)

**cannonballs** (only two exist):
`cannonball`(1) `granite_cannonball`(15)

**runes** — combat ladder (Strike→Surge) + tomes + book:
`mind_rune`(1) `chaos_rune`(8) `death_rune`(18) `blood_rune`(28) `wrath_rune`(38)
`tome_of_water`(12) `tome_of_earth`(16) `tome_of_fire`(22) `mages_book`(30)

**melee_kit** — RFD gloves + defenders (shared by slayer & tzhaar):
gloves: `bronze_gloves`(1) `iron_gloves`(4) `steel_gloves`(7) `black_gloves`(10) `mithril_gloves`(13) `adamant_gloves`(18) `rune_gloves`(24) `dragon_gloves`(32) `barrows_gloves`(42)
defenders: `bronze_defender`(1) `iron_defender`(4) `steel_defender`(7) `black_defender`(10) `mithril_defender`(13) `adamant_defender`(18) `rune_defender`(24) `dragon_defender`(32) `avernic_defender`(44)

**jewellery** — universal amulet ladder (`type:'jewellery'`, no `ammoClass`):
`amulet_of_strength`(1) `amulet_of_power`(8) `amulet_of_glory`(16) `amulet_of_fury`(28) `amulet_of_torture`(40)

**signatures** — universal jewellery, `rarity:'signature'`, boss drops:
`amulet_of_blood_fury`(40, `gearEffect:'anti_tank'`) — damage climbs vs tough foes.
`salve_amulet_ei`(30, `gearEffect:'slayer_bane'`) — bonus vs task/superior/boss.
*(names are the user's to rename; effects are fixed.)*

### Bonus rule (per class, tunable — starting points)

Compute in the generator from the tier's **index `i`** (0-based within its ladder):

- damage: `round(baseDmg[class] * pow(growth, i))`, `growth = 1.35`.
  `baseDmg = { arrows:5, darts:4, cannonballs:6, runes:6, melee_kit:5, jewellery:5 }`.
- arrows also add `range: 6 + 2*i` (folded as +%/100 by `calculateTowerStats`).
- darts also add `cooldown: 5 + i` (folded as +speed%/100).
- jewellery: the two lowest tiers add `xpBonus` (`amulet_of_power`+10, `amulet_of_glory`+15).
- signatures carry a modest flat `bonus` (`{damage: 25}`) on top of the effect.

The `bonus.range`/`bonus.cooldown` semantics match `tower-combat.ts` (range as +%/100, cooldown as +speed%/100) — do not change that pipeline.

---

### Task 1: Data-model rename + ammo-class foundation

**Files:**
- Modify: `lib/game/types.ts`, `lib/game/systems/tower-gear.ts`, `lib/game/systems/tower-combat.ts`, `lib/game/core/engine.ts`, `lib/game/engine.ts` (legacy: compile only)
- Modify (temp minimal pool so the build is green): `lib/game/data/gear.ts`
- Test: `lib/game/systems/tower-gear.test.ts`, `lib/game/data/gear.test.ts`

**Interfaces:**
- Produces: `AmmoClass`, `TOWER_AMMO_CLASS`, `towerAmmoClassFor(type)`, `canEquip(tower, gear)`, `gearDamageMult(tower, enemy, taskType)`, `Item.type` incl. `'ammo'|'jewellery'`, `Item.ammoClass?`, `Tower.equipment: { ammo: Item|null; jewellery: Item|null }`, `GearEffectId = 'anti_tank'|'slayer_bane'`.

- [ ] **Step 1 (types.ts):** add `export type AmmoClass = 'arrows'|'darts'|'cannonballs'|'runes'|'melee_kit';`. Add `'ammo'` and `'jewellery'` to the `Item.type` union (you may leave the legacy `'weapon'|'shield'|'accessory'` members in the union so legacy code still typechecks; new gear uses only `'ammo'|'jewellery'`). Replace `Item.weaponClass?: WeaponClass` with `Item.ammoClass?: AmmoClass` (keep `WeaponClass` exported only if legacy still needs it; otherwise delete it and its `weaponClassFor` usages). Change `Tower.equipment` to `{ ammo: Item | null; jewellery: Item | null }`. Change `GearEffectId` to `'anti_tank' | 'slayer_bane'`.
- [ ] **Step 2 (tower-gear.ts):** replace `weaponClassFor` with an exhaustive `TOWER_AMMO_CLASS: Record<TowerType, AmmoClass>` (values above) and a `towerAmmoClassFor(type)` reader. Rewrite `canEquip(tower, gear)`: for `gear.type === 'ammo'`, require `gear.ammoClass === towerAmmoClassFor(tower.type)` else `{ok:false, reason:'class'}`; jewellery has no class gate; both check `towerCombatLevel(tower) < (gear.levelReq ?? 1)` → `{ok:false, reason:'level'}`. `EquipCheck` reason union becomes `'class' | 'level'`. Rewrite `gearDamageMult` to fold the `gearEffect` of **each** equipped piece (`tower.equipment.ammo`, `tower.equipment.jewellery`): multiply the `anti_tank` and `slayer_bane` multipliers (1 when absent). Keep the same effect maths (twisted-bow curve; `slayerWeaponBonus`).
- [ ] **Step 3 (tower-combat.ts):** the equipment-bonus fold (~line 200) iterates the equipment slots — change it to iterate `['ammo','jewellery']` reading `tower.equipment.ammo`/`.jewellery`.
- [ ] **Step 4 (engine.ts core):** new-tower `equipment` init (~1315, ~2219) → `{ ammo: null, jewellery: null }`. `equipGear` slot routing → `const slot = gear.type === 'jewellery' ? 'jewellery' : 'ammo';`. `unequipGear` slot type → `'ammo' | 'jewellery'`. `sellTower` (~2573) returns `tower.equipment.ammo` and `.jewellery`. Keep the F1 fix (`bumpCombatEpoch()` in equip/unequip) and F3 lootBag save intact.
- [ ] **Step 5 (legacy engine.ts):** adjust the `equipment[...]`/`Item.type` references (~704, 775-777, 2807-2812) only as needed so tsc passes. It is dead code — a minimal cast/guard is fine.
- [ ] **Step 6 (gear.ts, temporary):** reduce `GEAR` to a small valid pool under the new shape (e.g. one arrow, one melee_kit, one jewellery, the two signatures) so imports resolve and tests pass. Task 2 replaces it wholesale.
- [ ] **Step 7 (tests):** update `tower-gear.test.ts` and `gear.test.ts` for the new `canEquip` reasons (`'class'|'level'`), `TOWER_AMMO_CLASS`, ammo vs jewellery, and the two-slot `gearDamageMult`.
- [ ] **Step 8: Gate** — `npx tsc --noEmit`, `npx vitest run`, `npm run build`. All green.
- [ ] **Step 9: Commit** — `refactor: gear model → ammo/jewellery slots + ammo-class foundation`.

### Task 2: Content — tier tables + generated pool

**Files:**
- Modify: `lib/game/data/gear.ts`
- Test: `lib/game/data/gear.test.ts`

**Interfaces:**
- Consumes: `AmmoClass`, `Item`, `GearEffectId` (Task 1).
- Produces: `GEAR: Record<string, Item>`, `GEAR_POOL: Item[]` (same names as today, so engine/UI imports are unchanged), and the exported `AMMO_TIERS` table.

- [ ] **Step 1:** define `AMMO_TIERS: Record<AmmoClass, { id: string; name: string; levelReq: number }[]>` from the ladders above (arrows, darts, cannonballs, runes, melee_kit = gloves ++ defenders), and a `JEWELLERY_TIERS` list + a `SIGNATURES` list (the two universal amulets with `gearEffect`).
- [ ] **Step 2:** write a generator that maps each tier entry to an `Item` via the per-class bonus rule (baseDmg/growth, arrows +range, darts +cooldown, jewellery xpBonus, signatures flat + effect). Ammo items get `type:'ammo'`, `ammoClass`, `style` from the class; jewellery `type:'jewellery'`; signatures `type:'jewellery'`, `rarity:'signature'`. Build `GEAR` (keyed by id) and `GEAR_POOL = Object.values(GEAR)`.
- [ ] **Step 3 (tests):** assert every generated item has an icon key, monotonic damage within each ladder, exactly two signatures both `type:'jewellery'` with a `gearEffect`, and that `TOWER_AMMO_CLASS`'s five classes each have ≥1 common item. Keep it pure.
- [ ] **Step 4: Gate** + **Step 5: Commit** — `feat: full OSRS ammo/kit/jewellery ladders (generated pool)`.

### Task 3: Icons — bake from the OSRS cache

**Files:**
- Modify: `scripts/render-osrs-items.mjs` (TARGETS), `lib/game/assets.ts` (`GEAR_ICONS`)
- Create: `public/assets/items/*.png` (baked)

- [ ] **Step 1:** add a TARGETS entry for every new gear `id` from Task 2, matched by cache item **name** (or `id` where the name is ambiguous). Resolve each id with the script's `--find` probe; **if any item id truly cannot be found in the cache, STOP and ask — never ship a placeholder.**
- [ ] **Step 2:** run the bake; verify each PNG exists and looks right (side-profile not required for inventory icons, but confirm it's the correct item).
- [ ] **Step 3:** extend `GEAR_ICONS: Record<string,string>` in `assets.ts` to cover every gear id → `itemIcon(slug)`. Remove entries for the deleted weapon items.
- [ ] **Step 4: Gate** (`tsc`, `vitest`, `build`) + **Step 5: Commit** — `feat: bake ammo/kit/jewellery gear icons from the OSRS cache`.

### Task 4: UI — ammo/jewellery slots, dynamic labels, picker, loot bag

**Files:**
- Modify: `components/game/GameRoot.tsx`

- [ ] **Step 1:** the two `.rs-slot`s now read `selectedTower.equipment.ammo` / `.jewellery`. Slot-1 label is dynamic from the tower's `ammoClass` (`Ammo`/`Runes`/`Kit`); slot-2 label `Jewellery`. Empty-slot placeholder text matches.
- [ ] **Step 2:** the picker filters the bag by slot: slot 1 → `g.type === 'ammo'` and (shown-disabled on level, hidden on class mismatch) via `canEquip`; slot 2 → `g.type === 'jewellery'`. Equip/unequip call the engine with the item id / slot. Live `GEAR_ICONS` icons.
- [ ] **Step 3:** loot-bag panel unchanged in behaviour; just reflects the new items. (Placement change is backlogged — leave it floating.)
- [ ] **Step 4: Verify headlessly** (game-verify): Classic run shows both slots with correct dynamic labels per tower type; roguelite shows neither. Delete any tmp probe.
- [ ] **Step 5: Gate** + **Step 6: Commit** — `feat: ammo/jewellery equipment slots with per-style labels`.

### Task 5: Shared HoverTip + adopt for informational tooltips

**Files:**
- Create: `components/game/HoverTip.tsx`
- Modify: `components/game/GameRoot.tsx` (adopt for gear tooltips, DPS panel, boss tips, tower-stat explanations)

- [ ] **Step 1:** build an OSRS-styled `<HoverTip content=… >child</HoverTip>` (or a `useHoverTip` hook) — a `relative` wrapper + an absolutely-positioned `.rs-panel`-style bubble on hover/focus, theme-aware, anchored to a non-scrolling ancestor (remember `overflow-y-auto` clips absolute descendants). Keyboard-focusable. No external deps.
- [ ] **Step 2:** replace the browser `title=` on the **informational** tooltips only: the gear tooltips (`gearTooltip`), the DPS panel effect rows, boss-tip text, and the tower effect/stat explanations. Leave plain button `title`s for a later sweep.
- [ ] **Step 3: Verify headlessly** the hover bubble renders and positions correctly (not clipped) for a gear item and a DPS row.
- [ ] **Step 4: Gate** + **Step 5: Commit** — `feat: shared OSRS hover tooltip for informational hovers`.

### Task 6: Shrink the tower panel

**Files:**
- Modify: `components/game/GameRoot.tsx` (single-tower `MovablePanel`); optionally `lib/game/systems/tower-identity.ts` (shorter effect copy)

- [ ] **Step 1:** tighten the single-tower panel: reduce padding/gaps, compact the slot block, and shorten the effect **description** strings (keep the notes). No control removed; the panel must still show name, level/XP, priority, slots, move/upgrade/sell, auto-upgrade.
- [ ] **Step 2: Verify headlessly** the panel is visibly smaller (measure its height before/after) and nothing overflows or is clipped; the board and bottom bar are unaffected.
- [ ] **Step 3: Gate** + **Step 4: Commit** — `refactor: slimmer tower panel (tighter layout + shorter effect copy)`.

### Task 7: Tutorial mirror

**Files:**
- Modify: `components/game/GameRoot.tsx` (`LEARN_STEPS` `gear` step + `TLDR` line)

- [ ] **Step 1:** update the `gear` `LEARN_STEPS` body and the `TLDR` "Classic gear" line to describe the new model: monsters drop **ammo/runes/kit** for the matching tower and **jewellery** for any tower; bosses drop **signature jewellery** with a bonus effect; each piece needs the tower's combat level; slot 1 is style-gated, jewellery is universal. English. The two layers must match.
- [ ] **Step 2: Verify** the `gear` tip anchors on the slots in a Classic run and not in roguelite (real Skip flow, don't seed `osrs_td_learn_seen`).
- [ ] **Step 3: Gate** + **Step 4: Commit** — `feat: tutorial covers the ammo/jewellery gear model`.

## Notes for the executor

- Order matters: Task 3 (icons) precedes Task 4 (UI) so slots show real icons. Task 2 (pool) precedes Task 3 so the icon list is known.
- Tasks 5 and 6 are independent of the gear model and of each other.
- **If a cache item id can't be resolved (Task 3), STOP and ask** — do not placeholder.
- Balance is the user's — no playtest checklists.

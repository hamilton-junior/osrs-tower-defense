# Gear rethemе — Ammo / Jewellery slots (Classic) — Design

**Status:** approved (design dialogue 2026-08-04). Supersedes the "weapon/accessory"
model shipped in the 2026-08-03 gear feature (local `wip`, unreleased — free to
restructure, no save migration owed).

## Problem

The shipped gear model gave every tower a **weapon** slot gated by weapon class, so
an archer equipped a *shortbow* onto its bow — redundant and nonsensical. Accessories
were a vague "accessory" slot. The tower already **is** its weapon; what it should
equip is what the weapon **consumes / is kitted with**.

## Decisions

1. **Two slots per tower, both Classic-only:**
   - **Slot 1 — style kit** (class-gated by the tower). Label is dynamic:
     - ranged towers → **Ammo** (archer = arrows, toxic = darts, cannon = cannonballs)
     - magic tower → **Runes** (wizard = runes + tomes + mage's book)
     - melee towers → **Kit** (slayer & tzhaar = RFD gloves / defenders — worn combat
       gear that boosts strength but is **not armour**; no platebodies)
   - **Slot 2 — Jewellery** (universal, any tower).
2. **Real OSRS progressions only** (validated ladders — see plan). Full metal ladders,
   the combat-rune ladder (Mind→Wrath = Strike→Surge), RFD gloves, defenders.
3. **Signatures = universal Jewellery**, dropped by bosses, carrying a `gearEffect`.
   The two effects are unchanged, only re-homed and renamed:
   - `anti_tank` (was `twisted_bow`): damage climbs with the target's max HP.
   - `slayer_bane` (was `darklight`): bonus vs the active task / superiors / bosses.
   Homing both on the universal jewellery slot keeps every common ammo/kit ladder full
   (incl. Dragon arrow as a common) and is the most extensible choice for future
   signatures. `gearDamageMult` folds the `gearEffect` of **every** equipped piece
   (both slots), so effects stack and future signature ammo/kit is trivial.
4. **Data-driven & extensible** (more towers are coming):
   - `AmmoClass` union with room to grow (`'arrows' | 'darts' | 'cannonballs' | 'runes'
     | 'melee_kit'`, later `'bolts'`, …).
   - `TOWER_AMMO_CLASS: Record<TowerType, AmmoClass>` — **exhaustive**, so a new tower
     fails the build until mapped.
   - The gear pool is **generated** from per-class tier tables + a per-class bonus
     rule, not 50 hand-written literals. Adding a tower = one Record line (+ a tier
     table if it's a new class).
5. **Persistence** (already implemented, unchanged): gear rides in the per-run Continue
   autosave; it never survives a new run (`restart()` + `clearRunSave()`).

## Cross-cutting UI (bundled with this work)

- **Shared hover tooltip.** A single OSRS-style `<HoverTip>` replaces browser-native
  `title=` for **informational** tooltips first (gear, DPS panel, boss tips, tower
  stats). The ~147 button `title`s are not swept wholesale now (big, low value).
- **Shrink the tower panel.** It eats too much screen. Tighten spacing, shorten the
  effect descriptions, compact the slot block — no functionality removed. CSS/layout.

## Out of scope (deferred)

- Loot-bag panel placement / a dedicated toggle button (backlogged).
- Sweeping every `title=` to HoverTip.
- Per-tower signatures for the four towers that lack one; gear crafting; a cross-run
  bank. Shield slot / two-handed rules.

## Verification

`npx tsc --noEmit` + `npx vitest run` + `npm run build` at every task; headless
game-verify for the UI tasks (slots, labels, picker, hover, panel size). Balance is
the user's — no playtest checklists.

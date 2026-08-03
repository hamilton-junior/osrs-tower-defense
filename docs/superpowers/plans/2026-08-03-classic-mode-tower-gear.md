# Classic Mode — Tower Gear Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give Classic mode its signature progression — dropped OSRS gear equipped
onto towers, style-gated, layered on tier + combat XP — as the counterpart to the
roguelite's per-wave draft.

**Architecture:** pure logic in `lib/game/systems/tower-gear.ts` (unit-tested) and
data in `lib/game/data/gear.ts`; the engine holds a run-scoped `lootBag`, routes
gear drops on kill (classic only), and validates equip/unequip; `calculateTowerStats`
*already* folds `tower.equipment` bonuses, so common gear needs no combat-path change;
only per-target signature effects (Twisted bow, Darklight) get a firing-block hook.
The UI adds two equipment slots to the tower panel and a loot-bag `MovablePanel`,
both classic-only.

**Tech Stack:** TypeScript, Next.js static export, Vitest. Sprites baked from the
local OSRS cache via `scripts/render-osrs-items.mjs`.

## Global Constraints

- Reply to the user in **Brazilian Portuguese**; **every in-game string and code
  identifier stays in English**.
- Assets come **only from the local OSRS cache** (bake with `render-osrs-items.mjs`);
  never hot-link an external host, never distort a sprite, always show a thing's own
  live icon (a slot shows the equipped item's real icon).
- Rewards are **non-monetary**; gear must **not inflate gold**.
- **Only meta-progression persists.** Gear (`lootBag` + `tower.equipment`) is
  **per-run** and is cleared in `restart()`; it is never written to `localStorage`.
- The whole feature is **gated to `gameMode === 'classic'`** (mirror how the draft /
  `runFx` guard on `gameMode === 'roguelite'`). In roguelite, gear never drops, the
  loot bag is hidden, and towers carry no equipment.
- **The tutorial mirrors the UI:** `LEARN_STEPS` (contextual tips) and `TLDR` (the
  How-to cheat sheet) both live in `GameRoot.tsx` and must describe the same real
  interface. Change one, change the other.
- Every new content id joins its **union type in `lib/game/types.ts`** first.
- Reuse what already exists: `Tower.equipment` (types.ts:372), `Item.bonus`
  (types.ts:307), `TOWER_STYLES` (data/towers.ts:11), and `styleSkillKey` /
  `towerCombatLevel` (systems/tower-xp.ts).
- **Gate after every task:** `npx tsc --noEmit`, then `npx vitest run`, then
  `npm run build`. TS errors fail the build. Balance is the **user's** job — never
  end with a playtest checklist.

---

## File Structure

- **Create** `lib/game/data/gear.ts` — the Classic gear pool (`GEAR` record +
  per-class/accessory/signature groupings). Data only.
- **Create** `lib/game/systems/tower-gear.ts` — pure logic: `weaponClassFor`,
  `canEquip`, `rollGearDrops`, `gearDamageMult`. No `this`, no DOM.
- **Create** `lib/game/systems/tower-gear.test.ts` — the unit suite for the above.
- **Create** `lib/game/data/gear.test.ts` — pool invariants.
- **Modify** `lib/game/types.ts` — add `WeaponClass`, `GearEffectId`; extend `Item`.
- **Modify** `lib/game/core/engine.ts` — `lootBag` state, `equipGear`/`unequipGear`,
  kill-handler drop routing, `UIState.lootBag`, `snapshot()` + `restart()`, and the
  firing-block signature hook.
- **Modify** `lib/game/systems/tower-combat.ts` — apply `gearDamageMult` at the hit
  site (or the engine call site — see Task 4).
- **Modify** `lib/game/assets.ts` — icon URLs for the new gear ids.
- **Modify** `scripts/render-osrs-items.mjs` config — the gear items to bake.
- **Modify** `components/game/GameRoot.tsx` — equipment slots, loot-bag panel,
  picker, and the tutorial (`LEARN_STEPS` + `TLDR` + a `gear` anchor).

---

### Task 1: Gear data model + starter pool

**Files:**
- Modify: `lib/game/types.ts` (the `Item` interface at 303-322; add unions near `CombatStyle` at 254)
- Create: `lib/game/data/gear.ts`
- Test: `lib/game/data/gear.test.ts`

**Interfaces:**
- Produces: `WeaponClass`, `GearEffectId` (types.ts); `GEAR: Record<string, Item>`,
  `GEAR_POOL: Item[]` (gear.ts). Consumed by Tasks 2-6.

- [ ] **Step 1: Add the unions and extend `Item` in `types.ts`**

After `export type CombatStyle = 'ranged' | 'magic' | 'melee';` (line 254) add:

```ts
/** Which weapon family a tower wields. Gear in the weapon slot must match the
 *  tower's class (so a bow only fits an archer, cannonballs only a cannon), even
 *  when two towers share a combat style. See `weaponClassFor` in systems/tower-gear. */
export type WeaponClass = 'scimitar' | 'maul' | 'bow' | 'blowpipe' | 'cannonball' | 'staff';

/** A rare gear piece's signature effect — a per-target conditional the flat
 *  `Item.bonus` can't express. Handled in the firing block; see systems/tower-gear. */
export type GearEffectId = 'twisted_bow' | 'darklight';
```

Then extend the `Item` interface (add these optional fields inside the existing
interface, e.g. after `sellPrice?: number;`):

```ts
  /** Classic gear: the combat style this weapon belongs to. Weapons set it;
   *  accessories leave it undefined (they fit any tower). */
  style?: CombatStyle;
  /** Classic gear: the weapon family (weapon slot only). */
  weaponClass?: WeaponClass;
  /** Classic gear: minimum tower combat level (in its style skill) to equip. */
  levelReq?: number;
  /** Classic gear: a rare's signature effect id. Undefined = common (stats only). */
  gearEffect?: GearEffectId;
  /** Classic gear rarity — weights the drop; `signature` drops only from bosses. */
  rarity?: 'common' | 'signature';
```

Import note: `CombatStyle` and `WeaponClass`/`GearEffectId` are all in this file, so
no import is needed. The slot is the existing `Item.type` (`'weapon' | 'accessory'`);
do **not** add a `slot` field. MVP uses only `weapon` and `accessory` types.

- [ ] **Step 2: Create `lib/game/data/gear.ts`**

```ts
import type { Item } from '../types';

/**
 * The Classic-mode gear pool. Weapons are style- and class-gated; accessories are
 * universal. Common pieces carry only `bonus` (folded by calculateTowerStats);
 * signatures also carry a `gearEffect`. Line lengths vary by class on purpose —
 * some OSRS weapon families tier deeper than others. Icons are baked from the OSRS
 * cache (see assets.ts / render-osrs-items.mjs). Numbers are a starting point;
 * balance is the user's.
 */
export const GEAR: Record<string, Item> = {
  // --- melee: scimitar (slayer) ---
  iron_scimitar_g:  { id: 'iron_scimitar_g',  name: 'Iron scimitar',  description: 'A slayer-tower blade.', type: 'weapon', style: 'melee', weaponClass: 'scimitar', levelReq: 1,  rarity: 'common', bonus: { damage: 10 } },
  rune_scimitar_g:  { id: 'rune_scimitar_g',  name: 'Rune scimitar',  description: 'Runite edge.',          type: 'weapon', style: 'melee', weaponClass: 'scimitar', levelReq: 12, rarity: 'common', bonus: { damage: 30 } },
  dragon_scimitar_g:{ id: 'dragon_scimitar_g',name: 'Dragon scimitar',description: 'Ancient steel.',         type: 'weapon', style: 'melee', weaponClass: 'scimitar', levelReq: 25, rarity: 'common', bonus: { damage: 55 } },
  // --- melee: maul (tzhaar) ---
  warhammer_g:  { id: 'warhammer_g',  name: 'Warhammer',      description: 'A blunt starter.', type: 'weapon', style: 'melee', weaponClass: 'maul', levelReq: 1,  rarity: 'common', bonus: { damage: 8 } },
  granite_maul_g:{ id: 'granite_maul_g',name: 'Granite maul',  description: 'Heavy rock.',      type: 'weapon', style: 'melee', weaponClass: 'maul', levelReq: 12, rarity: 'common', bonus: { damage: 28 } },
  tzhaar_ket_om:{ id: 'tzhaar_ket_om',name: 'TzHaar-ket-om',  description: 'Obsidian maul.',    type: 'weapon', style: 'melee', weaponClass: 'maul', levelReq: 25, rarity: 'common', bonus: { damage: 50 } },
  // --- ranged: bow (archer) ---
  shortbow_g:      { id: 'shortbow_g',      name: 'Shortbow',       description: 'Quick draw.',   type: 'weapon', style: 'ranged', weaponClass: 'bow', levelReq: 1,  rarity: 'common', bonus: { damage: 8,  range: 10 } },
  magic_shortbow_g:{ id: 'magic_shortbow_g',name: 'Magic shortbow', description: 'Enchanted yew.', type: 'weapon', style: 'ranged', weaponClass: 'bow', levelReq: 12, rarity: 'common', bonus: { damage: 26, range: 15 } },
  dark_bow_g:      { id: 'dark_bow_g',      name: 'Dark bow',       description: 'Twin arrows.',   type: 'weapon', style: 'ranged', weaponClass: 'bow', levelReq: 25, rarity: 'common', bonus: { damage: 48, range: 20 } },
  // --- ranged: blowpipe (toxic) ---
  toxic_blowpipe_g:{ id: 'toxic_blowpipe_g',name: 'Toxic blowpipe', description: 'Venomous dart-thrower.', type: 'weapon', style: 'ranged', weaponClass: 'blowpipe', levelReq: 20, rarity: 'common', bonus: { damage: 34, cooldown: 15 } },
  // --- ranged: cannonball (cannon) ---
  cannonball_g:        { id: 'cannonball_g',        name: 'Cannonball',         description: 'Standard shot.', type: 'weapon', style: 'ranged', weaponClass: 'cannonball', levelReq: 1,  rarity: 'common', bonus: { damage: 6 } },
  granite_cannonball_g:{ id: 'granite_cannonball_g',name: 'Granite cannonball', description: 'Denser shot.',    type: 'weapon', style: 'ranged', weaponClass: 'cannonball', levelReq: 15, rarity: 'common', bonus: { damage: 22 } },
  // --- magic: staff (wizard) ---
  battlestaff_g:{ id: 'battlestaff_g',name: 'Battlestaff',  description: 'Solid focus.',   type: 'weapon', style: 'magic', weaponClass: 'staff', levelReq: 1,  rarity: 'common', bonus: { damage: 8 } },
  mystic_staff_g:{ id: 'mystic_staff_g',name: 'Mystic staff',description: 'Mystic-tipped.', type: 'weapon', style: 'magic', weaponClass: 'staff', levelReq: 12, rarity: 'common', bonus: { damage: 24 } },
  ancient_staff_g:{ id: 'ancient_staff_g',name: 'Ancient staff',description: 'Zarosian relic.', type: 'weapon', style: 'magic', weaponClass: 'staff', levelReq: 25, rarity: 'common', bonus: { damage: 46 } },
  // --- accessories (universal) ---
  amulet_of_power_g:{ id: 'amulet_of_power_g',name: 'Amulet of power',description: 'Balanced power.', type: 'accessory', levelReq: 1,  rarity: 'common', bonus: { damage: 5, xpBonus: 10 } },
  combat_bracelet_g:{ id: 'combat_bracelet_g',name: 'Combat bracelet',description: 'Sturdy band.',   type: 'accessory', levelReq: 15, rarity: 'common', bonus: { damage: 8 } },
  // --- signatures (boss drops; carry a gearEffect) ---
  twisted_bow_g:{ id: 'twisted_bow_g',name: 'Twisted bow', description: 'Damage climbs against tougher foes.', type: 'weapon', style: 'ranged', weaponClass: 'bow',      levelReq: 40, rarity: 'signature', gearEffect: 'twisted_bow', bonus: { damage: 30, range: 20 } },
  darklight_g:  { id: 'darklight_g',  name: 'Darklight',   description: 'Bane of task monsters, superiors and bosses.', type: 'weapon', style: 'melee', weaponClass: 'scimitar', levelReq: 30, rarity: 'signature', gearEffect: 'darklight', bonus: { damage: 25 } },
};

/** Flat list, handy for the drop roll and the equip picker. */
export const GEAR_POOL: Item[] = Object.values(GEAR);
```

- [ ] **Step 3: Write `lib/game/data/gear.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { GEAR, GEAR_POOL } from './gear';
import { TOWER_STYLES } from './towers';
import type { WeaponClass } from '../types';

const WEAPON_CLASS_FOR: Record<string, WeaponClass> = {
  slayer: 'scimitar', tzhaar: 'maul', archer: 'bow',
  toxic: 'blowpipe', cannon: 'cannonball', wizard: 'staff',
};

describe('gear pool', () => {
  it('every id matches its record key', () => {
    for (const [key, item] of Object.entries(GEAR)) expect(item.id).toBe(key);
  });

  it('weapons declare a style + weaponClass; accessories declare neither', () => {
    for (const g of GEAR_POOL) {
      if (g.type === 'weapon') { expect(g.style).toBeDefined(); expect(g.weaponClass).toBeDefined(); }
      if (g.type === 'accessory') { expect(g.style).toBeUndefined(); expect(g.weaponClass).toBeUndefined(); }
    }
  });

  it('a weapon\'s style matches every tower that wields its class', () => {
    for (const g of GEAR_POOL) {
      if (g.type !== 'weapon' || !g.weaponClass) continue;
      for (const [type, cls] of Object.entries(WEAPON_CLASS_FOR)) {
        if (cls === g.weaponClass) expect(g.style).toBe(TOWER_STYLES[type as keyof typeof TOWER_STYLES].style);
      }
    }
  });

  it('every tower type has at least one common weapon of its class', () => {
    for (const cls of Object.values(WEAPON_CLASS_FOR)) {
      const common = GEAR_POOL.filter(g => g.weaponClass === cls && g.rarity === 'common');
      expect(common.length, `class ${cls}`).toBeGreaterThan(0);
    }
  });

  it('signatures carry a gearEffect and drop from bosses only', () => {
    for (const g of GEAR_POOL) {
      if (g.rarity === 'signature') expect(g.gearEffect).toBeDefined();
      if (g.gearEffect) expect(g.rarity).toBe('signature');
    }
  });
});
```

- [ ] **Step 4: Run the gate** — `npx tsc --noEmit`, `npx vitest run gear`, then confirm the full `npx vitest run` and `npm run build` pass. Expected: all green.

- [ ] **Step 5: Commit** — `git add lib/game/types.ts lib/game/data/gear.ts lib/game/data/gear.test.ts && git commit -m "feat: Classic gear data model + starter pool"`

---

### Task 2: `systems/tower-gear.ts` — pure logic

**Files:**
- Create: `lib/game/systems/tower-gear.ts`
- Test: `lib/game/systems/tower-gear.test.ts`

**Interfaces:**
- Consumes: `GEAR_POOL` (data/gear.ts), `TOWER_STYLES` (data/towers.ts),
  `towerCombatLevel` (systems/tower-xp.ts), `Item`/`Tower`/`WeaponClass`/`TowerType`.
- Produces: `weaponClassFor(type)`, `canEquip(tower, gear)`, `rollGearDrops(ctx, rng?)`,
  `gearDamageMult(tower, enemy, taskType)`. Consumed by the engine (Tasks 3, 4).

- [ ] **Step 1: Write the failing test `lib/game/systems/tower-gear.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { weaponClassFor, canEquip, rollGearDrops, gearDamageMult } from './tower-gear';
import { GEAR } from '../data/gear';
import type { Tower, TowerSkill, Enemy } from '../types';

const skill = (level: number): TowerSkill => ({ level, xp: 0 });
// minimal Tower stub; only fields the functions read matter
const tower = (over: Partial<Tower> = {}): Tower => ({
  type: 'slayer', skills: { strength: skill(50), ranged: skill(50), magic: skill(50) },
  equipment: { weapon: null, shield: null, accessory: null },
  ...(over as object),
} as Tower);
const enemy = (over: Partial<Enemy> = {}): Enemy => ({ type: 'goblin', maxHp: 100, isBoss: false, ...(over as object) } as Enemy);

describe('weaponClassFor', () => {
  it('maps each tower type to its weapon family', () => {
    expect(weaponClassFor('slayer')).toBe('scimitar');
    expect(weaponClassFor('tzhaar')).toBe('maul');
    expect(weaponClassFor('archer')).toBe('bow');
    expect(weaponClassFor('toxic')).toBe('blowpipe');
    expect(weaponClassFor('cannon')).toBe('cannonball');
    expect(weaponClassFor('wizard')).toBe('staff');
  });
});

describe('canEquip', () => {
  it('accepts a matching weapon at sufficient level', () => {
    expect(canEquip(tower({ type: 'slayer' }), GEAR.rune_scimitar_g)).toEqual({ ok: true });
  });
  it('rejects a wrong weapon class', () => {
    expect(canEquip(tower({ type: 'slayer' }), GEAR.shortbow_g)).toEqual({ ok: false, reason: 'class' });
  });
  it('rejects a wrong style before class (a defensive belt-and-braces check)', () => {
    // shortbow is ranged; a melee tower fails on style
    expect(canEquip(tower({ type: 'tzhaar' }), GEAR.shortbow_g).ok).toBe(false);
  });
  it('rejects below the level requirement', () => {
    const t = tower({ type: 'slayer', skills: { strength: skill(5), ranged: skill(5), magic: skill(5) } });
    expect(canEquip(t, GEAR.rune_scimitar_g)).toEqual({ ok: false, reason: 'level' }); // needs 12
  });
  it('accepts a universal accessory on any tower at level', () => {
    expect(canEquip(tower({ type: 'wizard' }), GEAR.amulet_of_power_g)).toEqual({ ok: true });
  });
  it('rejects an accessory in the weapon slot mismatch — accessory to weapon tower still ok (slot decided by caller)', () => {
    // canEquip only checks style/class/level; slot routing is the engine's job.
    expect(canEquip(tower({ type: 'archer' }), GEAR.combat_bracelet_g).ok).toBe(false); // level 15 vs 50 → ok
  });
});

describe('rollGearDrops', () => {
  it('returns nothing when every gate roll is high', () => {
    const rng = () => 0.99;
    expect(rollGearDrops({ wave: 30, isBoss: true }, rng)).toEqual([]);
  });
  it('drops a signature only from a boss', () => {
    // force the signature gate to pass, everything else to fail
    const seq = [0.999, 0.999, 0.0, 0.0]; let i = 0; const rng = () => seq[i++] ?? 0.99;
    const boss = rollGearDrops({ wave: 60, isBoss: true }, rng);
    expect(boss.some(g => g.rarity === 'signature')).toBe(true);
    const notBoss = rollGearDrops({ wave: 60, isBoss: false }, () => 0.0);
    expect(notBoss.some(g => g.rarity === 'signature')).toBe(false);
  });
  it('never drops common gear whose levelReq exceeds the wave cap', () => {
    const drops = rollGearDrops({ wave: 1, isBoss: false }, () => 0.0);
    for (const g of drops) expect((g.levelReq ?? 1)).toBeLessThanOrEqual(3); // wave 1 cap
  });
});

describe('gearDamageMult', () => {
  it('is 1 with no signature weapon', () => {
    expect(gearDamageMult(tower({ type: 'archer' }), enemy(), null)).toBe(1);
  });
  it('twisted bow scales up against high-maxHp targets', () => {
    const t = tower({ type: 'archer', equipment: { weapon: GEAR.twisted_bow_g, shield: null, accessory: null } });
    expect(gearDamageMult(t, enemy({ maxHp: 40 }), null)).toBeCloseTo(1, 5);
    expect(gearDamageMult(t, enemy({ maxHp: 4000 }), null)).toBeGreaterThan(1.3);
  });
  it('darklight rewards the active slayer task / superior / boss', () => {
    const t = tower({ type: 'slayer', equipment: { weapon: GEAR.darklight_g, shield: null, accessory: null } });
    expect(gearDamageMult(t, enemy({ type: 'goblin' }), 'goblin')).toBeGreaterThan(1);
    expect(gearDamageMult(t, enemy({ type: 'goblin' }), 'zombie')).toBe(1);
    expect(gearDamageMult(t, enemy({ isBoss: true }), null)).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail** — `npx vitest run tower-gear` → FAIL (`tower-gear.ts` not found).

- [ ] **Step 3: Implement `lib/game/systems/tower-gear.ts`**

```ts
import type { Item, Tower, TowerType, WeaponClass, Enemy } from '../types';
import { TOWER_STYLES } from '../data/towers';
import { towerCombatLevel } from './tower-xp';
import { slayerWeaponBonus } from './tower-identity';
import { GEAR_POOL } from '../data/gear';

/** The weapon family a tower type wields. Single source of truth for the weapon
 *  slot's class gate. */
export function weaponClassFor(type: TowerType): WeaponClass {
  switch (type) {
    case 'tzhaar': return 'maul';
    case 'slayer': return 'scimitar';
    case 'archer': return 'bow';
    case 'toxic': return 'blowpipe';
    case 'cannon': return 'cannonball';
    case 'wizard': return 'staff';
    // No other tower types exist; default keeps the switch total.
    default: return 'scimitar';
  }
}

export type EquipCheck = { ok: true } | { ok: false; reason: 'style' | 'class' | 'level' };

/** Whether `tower` may equip `gear`. Weapons must match the tower's style and
 *  weapon class; accessories are universal. Both require the tower's combat level
 *  (in its style skill) to meet `levelReq`. Slot routing (weapon vs accessory) is
 *  the caller's job — this checks compatibility only. */
export function canEquip(tower: Pick<Tower, 'type' | 'skills'>, gear: Item): EquipCheck {
  const style = TOWER_STYLES[tower.type].style;
  if (gear.type === 'weapon') {
    if (gear.style && gear.style !== style) return { ok: false, reason: 'style' };
    if (gear.weaponClass && gear.weaponClass !== weaponClassFor(tower.type)) return { ok: false, reason: 'class' };
  }
  if (towerCombatLevel(tower) < (gear.levelReq ?? 1)) return { ok: false, reason: 'level' };
  return { ok: true };
}

export interface GearDropContext {
  wave: number;
  isBoss: boolean;
}

/** The highest common `levelReq` allowed to drop at this wave — mirrors the
 *  wave-capped weapon tier of the legacy loot roll (wave / 3, floored). */
function commonLevelCap(wave: number): number {
  return Math.max(1, Math.floor(wave / 3) + 1);
}

/**
 * Roll gear drops for one kill (Classic only — the engine gates the call).
 * Consumes `rng` in a fixed order: common-weapon gate+pick, accessory gate+pick,
 * then a boss-only signature gate+pick. Common weapons are capped by wave so a
 * dragon scimitar can't fall on wave 1. Returns the pieces that landed.
 */
export function rollGearDrops(ctx: GearDropContext, rng: () => number = Math.random): Item[] {
  const out: Item[] = [];
  const cap = commonLevelCap(ctx.wave);
  const pick = (pool: Item[]) => pool.length ? pool[Math.floor(rng() * pool.length)] : null;

  // Common weapon — rare, wave-capped.
  if (rng() < 0.02) {
    const p = pick(GEAR_POOL.filter(g => g.type === 'weapon' && g.rarity === 'common' && (g.levelReq ?? 1) <= cap));
    if (p) out.push(p);
  }
  // Accessory — rarer.
  if (rng() < 0.01) {
    const p = pick(GEAR_POOL.filter(g => g.type === 'accessory' && (g.levelReq ?? 1) <= cap));
    if (p) out.push(p);
  }
  // Signature — bosses only.
  if (ctx.isBoss && rng() < 0.25) {
    const p = pick(GEAR_POOL.filter(g => g.rarity === 'signature'));
    if (p) out.push(p);
  }
  return out;
}

/**
 * Per-target damage multiplier from an equipped signature weapon (1 when none).
 *  - twisted_bow: climbs with the target's max HP (anti-tank), 1.0 at ≤40 HP up
 *    to ~1.5 at very high HP.
 *  - darklight: the slayer weapon bonus vs the active task / superiors / bosses.
 * Pure — the engine multiplies a landed hit by this at the damage site.
 */
export function gearDamageMult(tower: Pick<Tower, 'equipment'>, enemy: Pick<Enemy, 'type' | 'maxHp' | 'isBoss'>, taskType: string | null): number {
  const effect = tower.equipment.weapon?.gearEffect;
  if (!effect) return 1;
  if (effect === 'twisted_bow') {
    const t = Math.max(0, Math.min(1, (enemy.maxHp - 40) / 1960)); // 40..2000 HP → 0..1
    return 1 + 0.5 * t;
  }
  if (effect === 'darklight') {
    return slayerWeaponBonus(enemy.type, taskType, !!enemy.isBoss);
  }
  return 1;
}
```

- [ ] **Step 4: Run the tests to green** — `npx vitest run tower-gear` → PASS. Adjust the `enemy`/`tower` stubs in the test only if a required field is missing at type-check; do not weaken an assertion.

- [ ] **Step 5: Full gate** — `npx tsc --noEmit`, `npx vitest run`, `npm run build`. All green.

- [ ] **Step 6: Commit** — `git add lib/game/systems/tower-gear.ts lib/game/systems/tower-gear.test.ts && git commit -m "feat: pure Classic-gear logic (equip check, drops, signature maths)"`

---

### Task 3: Engine — loot bag, equip/unequip, drop routing

**Files:**
- Modify: `lib/game/core/engine.ts` (state field; `UIState` at 253; `snapshot()` at 963;
  `restart()` at 5449; kill handler at 4853-4876; new methods)

**Interfaces:**
- Consumes: `canEquip`, `rollGearDrops` (systems/tower-gear); `GEAR` (data/gear).
- Produces: `engine.lootBag`, `engine.equipGear(towerId, gearId)`,
  `engine.unequipGear(towerId, slot)`; `UIState.lootBag`. Consumed by the UI (Task 6).

- [ ] **Step 1: Add the imports** near the other systems imports (the `tower-xp`
  import is at engine.ts:21):

```ts
import { canEquip, rollGearDrops } from '../systems/tower-gear';
import { GEAR } from '../data/gear';
```

- [ ] **Step 2: Add the run-scoped state field.** Near the other run-scoped arrays
(e.g. beside `runCards`), add:

```ts
  /** Classic-mode gear dropped this run and not yet equipped. Per-run: cleared in
   *  restart(), never persisted. Empty in roguelite (gear never drops there). */
  lootBag: Item[] = [];
```

Ensure `Item` is imported in engine.ts (it is used widely; add to the type import
from `../types` if the type-checker complains).

- [ ] **Step 3: Route drops on kill.** In the kill handler, inside the
`if (!enemy.debug && !enemy.escort) {` block (engine.ts:4853), after the boss tally
(around line 4866) add:

```ts
      // Classic gear drops fall straight into the run's loot bag (no ground loot in
      // the new core). Gated to Classic — roguelite gears its towers via drafts.
      if (this.gameMode === 'classic') {
        const gear = rollGearDrops({ wave: this.wave, isBoss: !!enemy.isBoss });
        if (gear.length) this.lootBag = [...this.lootBag, ...gear];
      }
```

The existing `this.emit()` at the end of the handler pushes the new `lootBag`.

- [ ] **Step 4: Add `UIState.lootBag`.** In the `UIState` interface (near the
selection fields), add:

```ts
  /** Classic-mode loot bag: gear dropped this run, awaiting a tower. Empty/omitted
   *  in roguelite. Cloneable (plain `Item`s). */
  lootBag: Item[];
```

- [ ] **Step 5: Emit it from `snapshot()`.** In the returned object (engine.ts:963+),
add: `lootBag: this.lootBag.map(g => ({ ...g })),`

- [ ] **Step 6: Clear it in `restart()`.** Beside the other run-scoped resets
(engine.ts:5449+), add: `this.lootBag = [];`

- [ ] **Step 7: Add the equip/unequip methods.** Place them near the other
tower-mutating methods (e.g. next to `setAutoUpgrade`). Reuse `bumpTowerConfig()`
(the same idle-safe re-render used by the other live tower-config setters):

```ts
  /** Equip a gear piece from the loot bag onto a tower (Classic). Validates style /
   *  class / level via canEquip; the slot is the item's own type. Any piece already
   *  in that slot returns to the bag. No-op outside Classic or on a failed check. */
  equipGear(towerId: string, gearId: string) {
    if (this.gameMode !== 'classic') return;
    const tower = this.towers.find(t => t.id === towerId);
    const idx = this.lootBag.findIndex(g => g.id === gearId);
    if (!tower || idx < 0) return;
    const gear = this.lootBag[idx];
    const slot: 'weapon' | 'accessory' = gear.type === 'accessory' ? 'accessory' : 'weapon';
    if (!canEquip(tower, gear).ok) return;
    const prev = tower.equipment[slot];
    this.lootBag = this.lootBag.filter((_, i) => i !== idx);
    tower.equipment[slot] = { ...gear };
    if (prev) this.lootBag = [...this.lootBag, prev];
    this.bumpTowerConfig();
  }

  /** Unequip a tower's slot back into the loot bag (Classic). */
  unequipGear(towerId: string, slot: 'weapon' | 'accessory') {
    if (this.gameMode !== 'classic') return;
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower) return;
    const prev = tower.equipment[slot];
    if (!prev) return;
    tower.equipment[slot] = null;
    this.lootBag = [...this.lootBag, prev];
    this.bumpTowerConfig();
  }
```

- [ ] **Step 8: Gate** — `npx tsc --noEmit`, `npx vitest run`, `npm run build`. All green.
  (No new unit test here — the logic is `tower-gear.ts`, already tested; this task is
  wiring, verified by the build and by Task 6's headless check.)

- [ ] **Step 9: Commit** — `git add lib/game/core/engine.ts && git commit -m "feat: engine loot bag + equip/unequip + Classic gear drops"`

---

### Task 4: Engine — signature-effect hook in the firing path

**Files:**
- Modify: `lib/game/core/engine.ts` (the firing/damage path — search `fireTowers`
  and the `Double Shot` transform at engine.ts:4103-4106 for the neighbourhood)

**Interfaces:**
- Consumes: `gearDamageMult` (systems/tower-gear).
- Produces: signature weapons (Twisted bow, Darklight) actually change per-hit damage.

- [ ] **Step 1: Import** `gearDamageMult` (extend the Task 3 import):
  `import { canEquip, rollGearDrops, gearDamageMult } from '../systems/tower-gear';`

- [ ] **Step 2: Find the single site where a tower's per-hit damage to a specific
enemy is finalized.** It is in the firing path (`fireTowers` / the projectile-hit
resolution), where `ComputedTowerStats` (`damageMultiplier`, `flatDamageBonus` from
`calculateTowerStats`) becomes the actual number applied to one enemy. Search for
where `flatDamageBonus` or the rolled `minDamage`/`maxDamage` is turned into the hit
value and `damageEnemy(...)` is called.

- [ ] **Step 3: Multiply the finalized per-hit damage by the signature multiplier**,
passing the active slayer task type. At that site (once, just before the damage is
handed to `damageEnemy`):

```ts
      // Signature gear (Twisted bow / Darklight): a per-target multiplier the flat
      // Item.bonus can't express. 1.0 for every non-signature weapon.
      dmg *= gearDamageMult(tower, enemy, this.slayer.task?.type ?? null);
```

Use the local variable name actually holding the hit damage at that site (`dmg`
above is illustrative). If a tower fires multiple hits (twin-shot archer / Double
Shot), apply it to each hit's damage — the twin-shot path is nearby (archer twin-shot
is referenced around engine.ts:3324; Double Shot at 4103). Keep it a single helper
call per hit; do not duplicate the maths.

- [ ] **Step 4: Manual reasoning check (no new unit test — the maths is tested in
`tower-gear.test.ts`).** Confirm: outside Classic no tower has a signature weapon
(equipment is null), so `gearDamageMult` returns 1 and nothing changes. Confirm the
multiplier is applied *after* `flatDamageBonus` is added (it scales the whole hit).

- [ ] **Step 5: Gate** — `npx tsc --noEmit`, `npx vitest run`, `npm run build`. All green.

- [ ] **Step 6: Commit** — `git add lib/game/core/engine.ts && git commit -m "feat: signature gear (Twisted bow, Darklight) changes per-hit damage"`

---

### Task 5: Gear icons from the OSRS cache

**Files:**
- Modify: `scripts/render-osrs-items.mjs` (its item list/config)
- Modify: `lib/game/assets.ts` (icon URLs for the new gear ids)
- Create: `public/assets/...` (baked PNGs — output of the render script)

**Interfaces:**
- Produces: a resolvable icon URL for every `GEAR` id, read by the UI (Task 6).

- [ ] **Step 1: Identify the OSRS item id for each gear piece.** For each entry in
`GEAR` (Task 1), find its cache item id (the render script already renders inventory
icons by item id; follow how existing items are configured in it). Reuse an already
baked icon if the exact item is present; otherwise add it to the render list. Real
OSRS item names to source: Iron/Rune/Dragon scimitar, Warhammer, Granite maul,
TzHaar-ket-om, Shortbow, Magic shortbow, Dark bow, Toxic blowpipe, Cannonball,
Granite cannonball, Battlestaff, Mystic staff, Ancient staff, Amulet of power,
Combat bracelet, Twisted bow, Darklight.

- [ ] **Step 2: Bake** — run `node scripts/render-osrs-items.mjs`. Open each output
PNG and confirm it is the right item, correctly rasterised (not a white box). Assets
are OSRS-cache-only — never substitute an external or placeholder image; if a cache
id can't be found, stop and ask the user rather than inventing one.

- [ ] **Step 3: Wire the URLs into `assets.ts`.** Add a `gear` map (id → local
`public/assets/...` path), following the existing asset-map pattern in the file.

- [ ] **Step 4: Gate + eyeball** — `npm run build`; view the baked PNGs. tsc/vitest
unaffected but run them anyway.

- [ ] **Step 5: Commit** — `git add scripts/render-osrs-items.mjs lib/game/assets.ts public/assets && git commit -m "feat: bake Classic gear icons from the OSRS cache"`

---

### Task 6: UI — equipment slots + loot-bag panel (Classic only)

**Files:**
- Modify: `components/game/GameRoot.tsx` (the single-tower panel — the auto-upgrade
  block is around the tower panel; add slots there — and a new `MovablePanel` for the
  loot bag; read `ui.lootBag` and `ui.gameMode`)

**Interfaces:**
- Consumes: `ui.lootBag`, `ui.gameMode`, `selectedTower.equipment`; engine methods
  `equipGear` / `unequipGear`; `canEquip` / `weaponClassFor` (for filtering the
  picker); the `gear` icon map (assets.ts).

- [ ] **Step 1: Render two gear slots in the single-tower panel**, only when
`ui.gameMode === 'classic'`. Each slot (`weapon`, `accessory`) is an OSRS-style
`.rs-slot` showing the equipped item's **live icon** (from the `gear` map) or an
empty slot. Clicking a slot opens a picker listing the loot-bag pieces that fit that
slot for this tower — filter with `canEquip(selectedTower, gear).ok` and, for the
weapon slot, `gear.type === 'weapon'` (accessory slot: `gear.type === 'accessory'`).
Incompatible-by-level pieces may be shown disabled with "Requires Lvl N" (from
`gear.levelReq`); incompatible-by-style/class pieces are simply not listed. Clicking a
piece calls `engineRef.current?.equipGear(selectedTower.id, gear.id)`; right-click or
an ✕ on an equipped slot calls `unequipGear`. All strings in **English**.

- [ ] **Step 2: Add the loot-bag `MovablePanel`**, mounted only when
`ui.gameMode === 'classic'` and `ui.lootBag.length > 0`. Follow the `game-ui` skill's
MovablePanel rules: an outer element carries the anchor position; the panel has
`relative`; give it a unique `id` (e.g. `lootbag`) so its offset persists under
`ui_pos_lootbag`. List each piece's live icon + name; a tooltip shows its bonus and
`levelReq`. This is a browsing/overview panel; equipping happens through the tower
slot picker in Step 1 (keep one interaction path).

- [ ] **Step 3: Wire types.** `UIState.lootBag` already exists (Task 3). Import
`canEquip`, `weaponClassFor` from `systems/tower-gear` and the `gear` icon map from
`assets.ts` into `GameRoot.tsx`.

- [ ] **Step 4: Verify headlessly (game-verify skill).** After `npm run build`, drive
the exported game: start a **Classic** run (mode-select screen — the start button is
matched by `title`, use `enterRun`; select Classic), place a tower, and confirm the
tower panel shows the two slots. Because drops are random, seed the bag directly for
the check: in the probe, `page.evaluate` is not wired to the engine, so instead force
a drop by playing a wave or, simpler, assert the *panel structure* (slots present in
Classic, absent in roguelite) and that clicking an empty slot with an empty bag shows
no crash. Confirm the loot-bag panel and slots do **not** render in a roguelite run.
Report the actual observations. Delete any `scripts/dev/tmp-*.mjs` probe before
committing.

- [ ] **Step 5: Gate** — `npx tsc --noEmit`, `npx vitest run`, `npm run build`. All green.

- [ ] **Step 6: Commit** — `git add components/game/GameRoot.tsx && git commit -m "feat: Classic gear slots on the tower panel + loot-bag panel"`

---

### Task 7: Tutorial — mirror the gear UI

**Files:**
- Modify: `components/game/GameRoot.tsx` (`LEARN_STEPS`, `TLDR`, and a `data-tut`
  anchor on the gear slots)

**Interfaces:**
- Consumes: the gear slots / loot bag from Task 6.

- [ ] **Step 1: Add a `data-tut="gear"` anchor** to the tower-panel gear-slot block
(Task 6, Step 1).

- [ ] **Step 2: Add a `LEARN_STEPS` entry** anchored to `gear`, shown in Classic
runs, one sentence: how gear drops into the bag and is equipped onto a matching tower
(style + level). English copy. Follow the shape of the existing steps (e.g. the
`upgrade` step).

- [ ] **Step 3: Add the matching `TLDR` line** in the Towers section of the How-to
cheat sheet, describing the same mechanic at cheat-sheet depth. The two layers must
say the same thing (the tutorial-mirror rule). English copy.

- [ ] **Step 4: Verify** — `npm run build`; drive a Classic run headlessly and confirm
the `gear` tip anchors on the slots (don't seed `osrs_td_learn_seen` — use the real
Skip flow per the game-verify skill). Confirm the tip does not fire in roguelite.

- [ ] **Step 5: Gate** — `npx tsc --noEmit`, `npx vitest run`, `npm run build`. All green.

- [ ] **Step 6: Commit** — `git add components/game/GameRoot.tsx && git commit -m "feat: tutorial covers Classic gear (LEARN_STEPS + TLDR)"`

---

## Notes for the executor

- **Order matters for icons:** Task 5 (assets) precedes Task 6 (UI) so slots show real
  icons, honouring the OSRS-only / live-icon rule. If a cache id can't be resolved in
  Task 5, stop and ask — do not ship a placeholder.
- **The stat path is already done:** `calculateTowerStats` folds `tower.equipment`
  bonuses (weapon/shield/accessory) — there is deliberately no task to "apply common
  gear stats". Do not add one.
- **Deferred (out of scope, do not build):** the shield slot + two-handed rule; gear
  **crafting** (arrives with future skills); any **persistent bank** between runs.
- **Balance is the user's.** No playtest checklist in any report.

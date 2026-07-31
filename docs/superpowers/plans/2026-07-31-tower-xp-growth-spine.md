# Tower XP Growth Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the dormant `Tower.skills` scaffolding so towers earn combat XP by fighting; that XP gives a small per-level damage nudge and gates tier upgrades (minimum level + the existing gold cost).

**Architecture:** A new pure module `lib/game/systems/tower-xp.ts` holds every rule (XP maths, per-level bonus, tier gate) with unit tests. The engine calls it from the single damage choke (`damage()`) to award XP, from the stat pipeline (`calculateTowerStats`) for the nudge, and from the three upgrade paths for the gate. The GameRoot panel reads the live tower's `skills` (as it already reads `upgradeCost`/`autoUpgrade`) to draw an XP bar and a gated Upgrade button. No `UIState` change and no new `localStorage` key.

**Tech Stack:** TypeScript, Next.js (static export), Vitest for the pure systems; headless `scripts/dev/harness.mjs` (game-verify skill) for engine/UI.

## Global Constraints

- In-game UI strings stay **English** (the conversation is pt-BR; strings are not).
- XP/levels are **per-run** — no persistence, no new `localStorage` key. Only essence/upgrades/kill-counts persist.
- Rewards are **non-monetary** — XP grants power only, never gold.
- The board is a **fixed logic resolution** (`1728×768`); this feature touches no sizing.
- Assets come from the local OSRS cache only — this feature adds no new asset.
- **Tutorial mirrors the UI:** `LEARN_STEPS` and `TLDR` (both in `GameRoot.tsx`) must both describe the new reality.
- Two distinct "levels" on `Tower`: **tier** = `Tower.level`/`maxLevel` (1..4, bought with gold); **combat level** = `Tower.skills.<style>.level` (earned via XP). Never conflate them.
- Verification gate for every task: `npx tsc --noEmit` and `npx vitest run` must pass; UI/engine tasks additionally run `npm run build` + the headless harness.
- Balance numbers are the user's to tune later; the values below are sane defaults, all centralised as named constants in `tower-xp.ts`.

---

## File Structure

- **Create** `lib/game/systems/tower-xp.ts` — all XP/gate/nudge rules (pure). Responsibility: the single source of truth for tower growth maths. Depends on `./leveling` (`towerXpForLevel`), `../data/towers` (`TOWER_STYLES`), `../types`.
- **Create** `lib/game/systems/tower-xp.test.ts` — unit tests for the above.
- **Modify** `lib/game/systems/tower-combat.ts` — fold `levelStatBonus` into `damageMultiplier`.
- **Modify** `lib/game/systems/tower-combat.test.ts` — test the nudge.
- **Modify** `lib/game/core/engine.ts` — `grantTowerXp` from `damage()`; gate the three upgrade paths.
- **Modify** `components/game/GameRoot.tsx` — XP bar, gated Upgrade button, `LEARN_STEPS` + `TLDR`.

Combat level is capped at **99** (OSRS flavour). One skill grows per tower (its style); the other two stay at level 1 (reserved for the gear follow-up).

---

## Task 1: Pure `tower-xp` module

**Files:**
- Create: `lib/game/systems/tower-xp.ts`
- Test: `lib/game/systems/tower-xp.test.ts`

**Interfaces:**
- Consumes: `towerXpForLevel` from `./leveling`; `TOWER_STYLES` from `../data/towers`; `CombatStyle`, `TowerSkill`, `TowerSkills`, `Tower` from `../types`.
- Produces (later tasks rely on these exact names/signatures):
  - `styleSkillKey(style: CombatStyle): keyof TowerSkills`
  - `xpFromHit(dealt: number, exploitedWeakness: boolean): number`
  - `trainSkill(skill: TowerSkill, gain: number): { level: number; xp: number; leveledUp: boolean }`
  - `levelStatBonus(level: number): number`
  - `tierUnlockLevel(nextTier: number): number`
  - `towerCombatLevel(tower: Pick<Tower, 'type' | 'skills'>): number`
  - `tierGateFor(tower: Pick<Tower, 'type' | 'level' | 'maxLevel' | 'skills'>): { ok: boolean; neededLevel: number }`
  - Constants: `XP_PER_DAMAGE`, `XP_WEAKNESS_BONUS`, `PER_LEVEL_DMG`, `PER_LEVEL_CAP`, `MAX_TOWER_LEVEL`, `TIER_UNLOCK_LEVELS`.

- [ ] **Step 1: Write the failing test**

Create `lib/game/systems/tower-xp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  styleSkillKey, xpFromHit, trainSkill, levelStatBonus,
  tierUnlockLevel, towerCombatLevel, tierGateFor,
  XP_WEAKNESS_BONUS, PER_LEVEL_CAP, MAX_TOWER_LEVEL,
} from './tower-xp';
import { towerXpForLevel } from './leveling';
import type { Tower, TowerSkill } from '../types';

const skill = (level: number, xp = 0): TowerSkill => ({ level, xp });

// Minimal tower shape the gate/level helpers read.
const twr = (over: Partial<Pick<Tower, 'type' | 'level' | 'maxLevel' | 'skills'>> = {}) => ({
  type: 'archer' as const, level: 1, maxLevel: 4,
  skills: { strength: skill(1), ranged: skill(1), magic: skill(1) },
  ...over,
});

describe('styleSkillKey', () => {
  it('maps each style to its skill', () => {
    expect(styleSkillKey('melee')).toBe('strength');
    expect(styleSkillKey('ranged')).toBe('ranged');
    expect(styleSkillKey('magic')).toBe('magic');
  });
});

describe('xpFromHit', () => {
  it('is proportional to damage dealt', () => {
    expect(xpFromHit(40, false)).toBe(40);
  });
  it('applies the weakness bonus only when the weakness was exploited', () => {
    expect(xpFromHit(40, true)).toBe(40 * XP_WEAKNESS_BONUS);
  });
  it('grants nothing for a zero/absorbed hit', () => {
    expect(xpFromHit(0, true)).toBe(0);
    expect(xpFromHit(-5, false)).toBe(0);
  });
});

describe('trainSkill', () => {
  it('adds xp without levelling below the threshold', () => {
    const r = trainSkill(skill(1, 0), 10); // L1 needs towerXpForLevel(1)=80
    expect(r).toEqual({ level: 1, xp: 10, leveledUp: false });
  });
  it('levels up and carries the remainder', () => {
    const need = towerXpForLevel(1); // 80
    const r = trainSkill(skill(1, 0), need + 5);
    expect(r).toEqual({ level: 2, xp: 5, leveledUp: true });
  });
  it('crosses several levels in one big gain', () => {
    const gain = towerXpForLevel(1) + towerXpForLevel(2) + towerXpForLevel(3) + 1;
    const r = trainSkill(skill(1, 0), gain);
    expect(r.level).toBe(4);
    expect(r.xp).toBe(1);
    expect(r.leveledUp).toBe(true);
  });
  it('caps at MAX_TOWER_LEVEL and clamps leftover xp to 0', () => {
    const r = trainSkill(skill(MAX_TOWER_LEVEL, 0), 1_000_000_000);
    expect(r.level).toBe(MAX_TOWER_LEVEL);
    expect(r.xp).toBe(0);
  });
});

describe('levelStatBonus', () => {
  it('is 1.0 at level 1', () => {
    expect(levelStatBonus(1)).toBe(1);
  });
  it('grows and saturates at the cap', () => {
    expect(levelStatBonus(11)).toBeCloseTo(1.1);
    expect(levelStatBonus(9999)).toBe(PER_LEVEL_CAP);
  });
});

describe('tier gate', () => {
  it('reports the level required for the next tier', () => {
    expect(tierUnlockLevel(2)).toBe(3);
    expect(tierUnlockLevel(3)).toBe(8);
    expect(tierUnlockLevel(4)).toBe(15);
  });
  it('reads the combat level off the tower style skill', () => {
    expect(towerCombatLevel(twr({ skills: { strength: skill(1), ranged: skill(7), magic: skill(1) } }))).toBe(7);
  });
  it('blocks the next tier below the threshold with the needed level', () => {
    const g = tierGateFor(twr({ level: 1 })); // needs L3, tower at L1
    expect(g).toEqual({ ok: false, neededLevel: 3 });
  });
  it('opens exactly at the threshold', () => {
    const g = tierGateFor(twr({ level: 1, skills: { strength: skill(1), ranged: skill(3), magic: skill(1) } }));
    expect(g).toEqual({ ok: true, neededLevel: 3 });
  });
  it('is closed at max tier', () => {
    const g = tierGateFor(twr({ level: 4, skills: { strength: skill(1), ranged: skill(99), magic: skill(1) } }));
    expect(g.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/tower-xp.test.ts`
Expected: FAIL — `tower-xp.ts` does not exist / imports unresolved.

- [ ] **Step 3: Write the module**

Create `lib/game/systems/tower-xp.ts`:

```ts
import type { CombatStyle, TowerSkill, TowerSkills, Tower } from '../types';
import { towerXpForLevel } from './leveling';
import { TOWER_STYLES } from '../data/towers';

/** XP earned per point of damage dealt. */
export const XP_PER_DAMAGE = 1;
/** XP multiplier when the hit exploited the enemy's combat-triangle weakness. */
export const XP_WEAKNESS_BONUS = 1.5;
/** Damage bump per combat level above 1. */
export const PER_LEVEL_DMG = 0.01;
/** Ceiling on the per-level damage nudge (1.5 = +50% at level 51). */
export const PER_LEVEL_CAP = 1.5;
/** OSRS-flavoured combat level cap. */
export const MAX_TOWER_LEVEL = 99;
/** Combat level required to buy each tier (index = the tier being bought). */
export const TIER_UNLOCK_LEVELS: Record<number, number> = { 2: 3, 3: 8, 4: 15 };

/** The one skill a tower of the given style trains. */
export function styleSkillKey(style: CombatStyle): keyof TowerSkills {
  return style === 'melee' ? 'strength' : style === 'ranged' ? 'ranged' : 'magic';
}

/** XP a single landed hit is worth. Zero for a hit that dealt nothing. */
export function xpFromHit(dealt: number, exploitedWeakness: boolean): number {
  if (dealt <= 0) return 0;
  return dealt * XP_PER_DAMAGE * (exploitedWeakness ? XP_WEAKNESS_BONUS : 1);
}

/**
 * Apply a whole XP gain to a skill, crossing as many level thresholds as it
 * spans (a big hit can raise several levels at once). Caps at MAX_TOWER_LEVEL,
 * where leftover XP is discarded so a maxed skill shows a full-but-static bar.
 */
export function trainSkill(skill: TowerSkill, gain: number): { level: number; xp: number; leveledUp: boolean } {
  let level = skill.level;
  let xp = skill.xp + Math.max(0, gain);
  let leveledUp = false;
  while (level < MAX_TOWER_LEVEL && xp >= towerXpForLevel(level)) {
    xp -= towerXpForLevel(level);
    level += 1;
    leveledUp = true;
  }
  if (level >= MAX_TOWER_LEVEL) xp = 0;
  return { level, xp, leveledUp };
}

/** Capped multiplicative damage bonus from a tower's combat level (level 1 = 1.0). */
export function levelStatBonus(level: number): number {
  return Math.min(1 + (level - 1) * PER_LEVEL_DMG, PER_LEVEL_CAP);
}

/** Combat level required to buy `nextTier` (1 = no requirement). */
export function tierUnlockLevel(nextTier: number): number {
  return TIER_UNLOCK_LEVELS[nextTier] ?? 1;
}

/** A tower's effective combat level = the level of its one style skill. */
export function towerCombatLevel(tower: Pick<Tower, 'type' | 'skills'>): number {
  return tower.skills[styleSkillKey(TOWER_STYLES[tower.type].style)].level;
}

/**
 * Whether a tower may buy its next tier, and the level it needs. `ok` is false
 * at max tier or below the tier's level threshold. Gold is checked separately.
 */
export function tierGateFor(
  tower: Pick<Tower, 'type' | 'level' | 'maxLevel' | 'skills'>,
): { ok: boolean; neededLevel: number } {
  const neededLevel = tierUnlockLevel(tower.level + 1);
  const ok = tower.level < tower.maxLevel && towerCombatLevel(tower) >= neededLevel;
  return { ok, neededLevel };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/game/systems/tower-xp.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (expect clean).

```bash
git add lib/game/systems/tower-xp.ts lib/game/systems/tower-xp.test.ts
git commit -m "feat: pure tower-xp module (earn/level/gate maths)"
```

---

## Task 2: Per-level damage nudge in `calculateTowerStats`

**Files:**
- Modify: `lib/game/systems/tower-combat.ts` (import + one line in `calculateTowerStats`)
- Test: `lib/game/systems/tower-combat.test.ts`

**Interfaces:**
- Consumes: `levelStatBonus`, `styleSkillKey` from `./tower-xp`; `TOWER_STYLES` (already imported in `tower-combat.ts`).
- Produces: no new export — `calculateTowerStats` now factors the tower's combat level into `damageMultiplier`.

- [ ] **Step 1: Write the failing test**

Append to `lib/game/systems/tower-combat.test.ts` (the `tower()`/`ctx()` factories at the top already exist; the archer's style is `ranged`):

```ts
describe('calculateTowerStats — combat-level nudge', () => {
  it('a level-1 tower is unchanged', () => {
    const s = calculateTowerStats(tower(), ctx());
    expect(s.damageMultiplier).toBeCloseTo(1);
  });
  it('a higher combat level adds a capped damage bonus', () => {
    const leveled = tower({ skills: { strength: { level: 1, xp: 0 }, ranged: { level: 11, xp: 0 }, magic: { level: 1, xp: 0 } } });
    const s = calculateTowerStats(leveled, ctx());
    expect(s.damageMultiplier).toBeCloseTo(1.1); // +1% * 10 levels
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/tower-combat.test.ts -t "combat-level nudge"`
Expected: FAIL — the level-11 case returns `1`, not `1.1`.

- [ ] **Step 3: Implement the nudge**

In `lib/game/systems/tower-combat.ts`, add to the imports at the top:

```ts
import { levelStatBonus, styleSkillKey } from './tower-xp';
```

Then, inside `calculateTowerStats`, immediately after the "Global upgrades" block (right after the `if (tower.type === 'archer') { … } else if … cannon …` chain closes), add:

```ts
  // Combat-level nudge: the tower's own XP-earned level adds a small, capped
  // damage bump so growth is felt between tier upgrades. Level 1 = ×1.
  damageMultiplier *= levelStatBonus(tower.skills[styleSkillKey(TOWER_STYLES[tower.type].style)].level);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/tower-combat.test.ts`
Expected: PASS (new cases + all existing).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (expect clean).

```bash
git add lib/game/systems/tower-combat.ts lib/game/systems/tower-combat.test.ts
git commit -m "feat: tower combat level nudges its damage (capped)"
```

---

## Task 3: Earn XP from every landed hit (`damage()`)

**Files:**
- Modify: `lib/game/core/engine.ts` (import; new `grantTowerXp`; one call in `damage()`)

**Interfaces:**
- Consumes: `styleSkillKey`, `xpFromHit`, `trainSkill` from `../systems/tower-xp`; `TOWER_STYLES` (already imported in `engine.ts`); existing `bumpCombatEpoch()` and `emit()`.
- Produces: `private grantTowerXp(towerId, dealt, exploitedWeakness)` — mutates the source tower's style skill; on level-up invalidates the stat cache and pushes a UI update.

This task has no unit test (the engine class is untested by design — see CLAUDE.md). It rests on the Task 1 pure tests plus a headless-harness observation, and must not regress `tsc`/`vitest`/`build`.

- [ ] **Step 1: Add the import**

In `lib/game/core/engine.ts`, add to the systems imports near the top (alongside the other `../systems/*` imports):

```ts
import { styleSkillKey, xpFromHit, trainSkill } from '../systems/tower-xp';
```

- [ ] **Step 2: Add the `grantTowerXp` helper**

Add this method to the `GameEngine` class, right next to `bumpCombatEpoch()` (near `bumpCombatEpoch() { this.combatEpoch++; }`):

```ts
  /** Credit a tower for a hit that landed: XP proportional to the damage it
   *  dealt, ×bonus when the hit exploited the enemy's style weakness. Feeds the
   *  one skill matching the tower's style. A level-up invalidates the tower's
   *  cached stats (so the per-level nudge applies) and refreshes the UI. */
  private grantTowerXp(towerId: string, dealt: number, exploitedWeakness: boolean) {
    const tower = this.towers.find(t => t.id === towerId);
    if (!tower || dealt <= 0) return;
    const gain = xpFromHit(dealt, exploitedWeakness);
    if (gain <= 0) return;
    const key = styleSkillKey(TOWER_STYLES[tower.type].style);
    const r = trainSkill(tower.skills[key], gain);
    tower.skills[key] = { level: r.level, xp: r.xp };
    if (r.leveledUp) { this.bumpCombatEpoch(); this.emit(); }
  }
```

- [ ] **Step 3: Call it from `damage()`**

In `damage()`, the DPS-meter block already runs under `if (source && dealt > 0) { … this.stats.recordDamage(…) … }`. Immediately **after** that block closes (and while `weak` from `const weak = styleWeaknessMult(enemy.styleWeakness, style)` is still in scope), add:

```ts
    // Towers grow by fighting: credit the source tower for the damage it landed.
    // `weak > 1` means the hit exploited the enemy's melee/ranged weakness (magic
    // never triggers it — StyleWeakness excludes magic, an intended counterweight).
    if (source?.towerId && dealt > 0) this.grantTowerXp(source.towerId, dealt, weak > 1);
```

Note: style-less DoT ticks (burn/poison/venom) reach `damage()` with `style === undefined`, so `weak === 1` and they grant base XP with no weakness bonus — correct.

- [ ] **Step 4: Verify the gate (typecheck, tests, build)**

Run: `npx tsc --noEmit` (clean), `npx vitest run` (all green — no regressions), `npm run build` (exports).

- [ ] **Step 5: Headless observation**

Drive the exported game with the harness (game-verify skill / `scripts/dev/harness.mjs`): place a tower, send a wave, and confirm that after some kills the selected tower's `skills.<style>.xp`/`level` on `engineRef.current` has risen above the initial `{level:1,xp:0}`. (This becomes visible in the UI in Task 5; here it is read off engine state.)

- [ ] **Step 6: Commit**

```bash
git add lib/game/core/engine.ts
git commit -m "feat: towers earn combat XP from the damage they deal"
```

---

## Task 4: Gate tier upgrades by combat level

**Files:**
- Modify: `lib/game/core/engine.ts` (`upgradeTower`, `multiUpgradeInfo`, `upgradeMultiSelected`, `tickAutoUpgrade`)

**Interfaces:**
- Consumes: `tierGateFor` from `../systems/tower-xp`; existing `upgradeOrder` from `../systems/upgrades`.
- Produces: all four upgrade paths respect the level gate; behaviour is additive over the existing gold checks.

**Critical:** `tickAutoUpgrade` has a `for(;;)` loop that re-filters affordable towers each pass. If the gate lived *only* inside `upgradeTower` (as a no-op return), a cheap gated auto-upgrade tower would stay in the affordable set forever → **infinite loop**. The gate predicate MUST also be in the `tickAutoUpgrade` filter (and, for correct counts/skips, in `multiUpgradeInfo` and `upgradeMultiSelected`).

No engine unit test (untested class); rests on Task 1's `tierGateFor` tests + harness. Must not regress `tsc`/`vitest`/`build`.

- [ ] **Step 1: Import `tierGateFor`**

Extend the Task 3 import in `engine.ts`:

```ts
import { styleSkillKey, xpFromHit, trainSkill, tierGateFor } from '../systems/tower-xp';
```

- [ ] **Step 2: Guard `upgradeTower`**

Replace the guard line in `upgradeTower`:

```ts
    if (!tower || tower.level >= tower.maxLevel) return;
```

with:

```ts
    if (!tower || !tierGateFor(tower).ok) return; // maxed OR below the tier's level gate
```

- [ ] **Step 3: Gate the batch count in `multiUpgradeInfo`**

In `multiUpgradeInfo`, replace:

```ts
      if (t && t.level < t.maxLevel) { count++; cost += t.upgradeCost; }
```

with:

```ts
      if (t && tierGateFor(t).ok) { count++; cost += t.upgradeCost; }
```

- [ ] **Step 4: Skip gated towers in `upgradeMultiSelected`**

In `upgradeMultiSelected`, change the `selected` filter to drop gated towers so `upgradeOrder` never yields one:

```ts
    const selected = this.multiSelectedIds
      .map(id => this.towers.find(tw => tw.id === id))
      .filter((t): t is Tower => !!t && tierGateFor(t).ok);
```

- [ ] **Step 5: Fix the auto-upgrade filter (infinite-loop guard)**

In `tickAutoUpgrade`, add the gate to the affordable filter:

```ts
      const affordable = this.towers.filter(t => t.autoUpgrade && tierGateFor(t).ok && t.upgradeCost <= this.money);
```

- [ ] **Step 6: Verify the gate (typecheck, tests, build)**

Run: `npx tsc --noEmit` (clean), `npx vitest run` (green), `npm run build` (exports).

- [ ] **Step 7: Headless observation**

Harness: a freshly-placed tower cannot buy T2 (auto-upgrade on it does nothing, no runaway/freeze); after it earns enough XP to reach the T2 level, the upgrade goes through. A crowded auto-upgrade board with under-level towers does **not** hang.

- [ ] **Step 8: Commit**

```bash
git add lib/game/core/engine.ts
git commit -m "feat: tier upgrades require a minimum combat level"
```

---

## Task 5: UI — XP bar, gated Upgrade button, tutorial mirror

**Files:**
- Modify: `components/game/GameRoot.tsx` (imports; selected-tower panel; `LEARN_STEPS`; `TLDR`)

**Interfaces:**
- Consumes: `styleSkillKey`, `tierGateFor` from `@/lib/game/systems/tower-xp`; `towerXpForLevel` from `@/lib/game/systems/leveling`; `TOWER_STYLES` from `@/lib/game/data/towers`. The panel already reads the live `selectedTower` off `engineRef.current.towers` (as it does for `upgradeCost`/`autoUpgrade`), so `skills` is available with no `UIState` change.
- Produces: no new engine call — reads live state and renders.

No unit tests here (GameRoot is untested — game-ui skill). Verify with `npm run build` + the headless harness.

- [ ] **Step 1: Add imports**

Near the other `@/lib/game/...` imports in `GameRoot.tsx`:

```ts
import { styleSkillKey, tierGateFor } from '@/lib/game/systems/tower-xp';
import { towerXpForLevel } from '@/lib/game/systems/leveling';
import { TOWER_STYLES } from '@/lib/game/data/towers';
```

(If any of these is already imported, don't duplicate it.)

- [ ] **Step 2: Compute the gate where `selectedTower` is resolved**

Just after the `const selectedTower = ui.selectedTowerId ? … : null;` block, add:

```tsx
  const towerGate = selectedTower ? tierGateFor(selectedTower) : null;
```

- [ ] **Step 3: Draw the XP bar**

In the selected-tower panel, immediately **before** the `{moving ? (` ternary (the `▸ Click a tile to move here` / actions block), insert:

```tsx
          {(() => {
            const sk = selectedTower.skills[styleSkillKey(TOWER_STYLES[selectedTower.type].style)];
            const need = towerXpForLevel(sk.level);
            const pct = Math.min(100, Math.round((sk.xp / need) * 100));
            return (
              <div className="mt-[0.5em] px-[0.1em]">
                <div className="flex items-center justify-between text-[0.72em] text-[#d3c3a0] mb-[0.2em]">
                  <span>Combat level {sk.level}</span>
                  <span className="text-[#9a8d70]">{Math.floor(sk.xp)} / {need} XP</span>
                </div>
                <div className="rs-progress"><div className="rs-progress-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })()}
```

- [ ] **Step 4: Gate the Upgrade button**

In the Upgrade `<button>` (inside `{selectedTower.level < selectedTower.maxLevel && (…)}`, so the tower is never maxed here — `towerGate.ok` is false only because of level), change `disabled`, `title`, and the label:

Replace:

```tsx
                    disabled={ui.money < selectedTower.upgradeCost}
```
with:
```tsx
                    disabled={!towerGate?.ok || ui.money < selectedTower.upgradeCost}
```

Replace the button's inner label line:

```tsx
                    <span className="text-[#5bd75b] font-bold">⬆</span>
                    Upgrade — {selectedTower.upgradeCost} gp
                    <span className="rs-key">U</span>
```
with:
```tsx
                    <span className="text-[#5bd75b] font-bold">⬆</span>
                    {towerGate?.ok
                      ? <>Upgrade — {selectedTower.upgradeCost} gp</>
                      : <>Needs Lv {towerGate?.neededLevel}</>}
                    <span className="rs-key">U</span>
```

And update the `title`:

```tsx
                    title={towerGate?.ok
                      ? `Upgrade to next tier for ${selectedTower.upgradeCost} gp (U)`
                      : `Reach combat level ${towerGate?.neededLevel} to upgrade this tier`}
```

- [ ] **Step 5: Update `LEARN_STEPS` (tutorial mirror)**

Replace the `id: 'upgrade'` step body so it teaches XP/levels and the tier gate:

```tsx
  { id: 'upgrade', target: 'dock', title: 'Spend between waves',
    body: 'Click a tower you built to upgrade or sell it, and buy more from the dock. Towers earn XP by fighting — landing hits, and extra when they hit an enemy weak to their style — and level up, which nudges their damage. A tier upgrade needs both gold and a minimum combat level; until the tower is high enough its Upgrade button reads “Needs Lv X”. Tick its Auto‑upgrade box to let it level itself from your gold whenever it can (cheapest tower first, gate permitting); the same box on a multi‑selection arms the whole group. Build mode is paused, so take your time before the next wave.',
    when: (ui) => !ui.waveActive && ui.wave === 2 },
```

- [ ] **Step 6: Update `TLDR` (tutorial mirror)**

In the `TLDR` `Towers` group, replace the "Click a placed tower…" line with:

```tsx
    'Click a placed tower to Upgrade or Sell it, and set its target priority — the six glyphs pair a stat with an arrow (⬆ most, ⬇ least): hover any of them for what it picks. Towers earn XP by fighting (bonus vs a style weakness) and level up for more damage; a tier upgrade needs a minimum level as well as gold — the button shows “Needs Lv X” until then. Tick Auto‑upgrade to let it level itself from your gold (cheapest tower first).',
```

- [ ] **Step 7: Verify (build + harness)**

Run: `npm run build` (exports clean). Then drive the exported game (game-verify skill): select a tower and watch its XP bar fill as it fires; confirm a fresh tower's Upgrade button reads `Needs Lv 3` and, once it reaches level 3, becomes a normal `Upgrade — N gp` button; confirm the multi-select Upgrade count excludes under-level towers.

- [ ] **Step 8: Commit**

```bash
git add components/game/GameRoot.tsx
git commit -m "feat: tower panel shows combat XP and gates the Upgrade button"
```

---

## Final verification (whole feature)

- `npx tsc --noEmit` — clean.
- `npx vitest run` — all green (new `tower-xp` suite + `tower-combat` nudge cases + no regressions).
- `npm run build` — static export succeeds.
- Headless harness (game-verify): a run where a tower visibly levels, its damage grows, and tier upgrades unlock only at the gate — including an auto-upgrade board that does not hang on under-level towers.
- Balance itself (XP rate, thresholds, per-level %) is the user's to playtest and tune in `tower-xp.ts`.

## Self-review notes (done)

- **Spec coverage:** earn XP (§4.2 → Task 3), per-level nudge (§4.3 → Task 2), tier gate incl. all upgrade paths (§4.4 → Task 4), per-run/both-modes/non-monetary (Global Constraints; no persistence added), UI XP bar + gated button (§5.3 → Task 5), tutorial mirror (§5.4 → Task 5 Steps 5-6), pure module + tests (§5.1 → Task 1). Gear/equipment left dormant (§8) — untouched.
- **Placeholder scan:** none — every step carries real code and concrete default constants.
- **Type consistency:** `tierGateFor`/`styleSkillKey`/`trainSkill`/`levelStatBonus`/`towerXpForLevel` names and signatures match across Tasks 1→5; `Tower.skills` shape matches the existing factory and types.
- **Deliberate deviation from the spec:** the spec floated extending `UIState` for the selected-tower XP; the plan instead reads the live `selectedTower` (the panel already does this for `upgradeCost`/`autoUpgrade`), which fully satisfies the design intent with less surface and no boundary change.
```

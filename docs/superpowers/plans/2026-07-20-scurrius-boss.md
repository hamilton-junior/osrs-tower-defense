# Scurrius Boss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Scurrius, the tier-0 swarm boss, whose heavy hits shear Giant rats off his own health bar; the rats wander the board as aggro bait and run back to refund whatever HP they still hold.

**Architecture:** Follows the shipped boss pattern exactly. Pure maths and constants go in `lib/game/systems/boss-mechanics.ts` with unit tests; `GameEngine` owns the timers, the rat entities and the VFX; `GameRenderer` draws the tether. The rats are **ordinary enemies, not escorts** — that is the single most important structural decision in this plan (see the warning in Task 3).

**Tech Stack:** TypeScript, Next.js App Router, Vitest, Canvas 2D. Assets baked from the local OSRS cache via `osrscachereader` + three.js.

**Spec:** [`docs/superpowers/specs/2026-07-20-scurrius-boss-design.md`](../specs/2026-07-20-scurrius-boss-design.md)

## Global Constraints

- **Every asset comes from the local OSRS cache.** Never hot-link an external host, never invent a placeholder. If an asset cannot be sourced, stop and ask.
- **In-game strings are English**, regardless of the working language.
- **Never `git add -A` / `git add .`** — stage files explicitly by pathspec.
- **Gate = `npx tsc --noEmit` + `npx vitest run`.** `npm run build` is known broken (pre-existing webpack `WasmHash` crash) and is **not** a gate.
- `lib/game/changelog-classify.test.ts` fails to collect (pre-existing SyntaxError). 561 runnable tests pass; that is the baseline.
- **Balance is the user's job.** Do not propose or run a playtest.
- Board is a fixed `LOGIC_WIDTH = 1728 × LOGIC_HEIGHT = 768`, `GRID = 32`. Never derive game values from screen size.
- Commit convention (`.claude/skills/changelog-convention`): `feat`→New, `fix`→Fixed, `balance`→Balanced, `docs`/`chore`→dropped. Only the subject is published. End every message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Do not push to `main`.** Work stays on `wip` unless the user explicitly asks.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/game/systems/boss-mechanics.ts` | Scurrius constants + pure functions; `BossId`, `MECHANIC_BOSSES`, `SCHEDULABLE_BOSSES`, `BossState`, `freshBossState` | modify |
| `lib/game/systems/boss-mechanics.test.ts` | unit tests, incl. the HP-conservation property | modify |
| `lib/game/data/enemies.ts` | `scurrius` + `giant_rat` stat blocks, weakness map | modify |
| `lib/game/types.ts` | `EnemyType` union; the rat's runtime fields on `Enemy` | modify |
| `lib/game/data/drops.ts` | his pet (`PET_DROP_TABLE`) — there are no per-monster loot tables | modify |
| `lib/game/core/engine.ts` | shear hook, `updateScurrius`, rat stepping, king-death handoff, kill-count gate | modify |
| `lib/game/core/renderer.ts` | the return tether | modify |
| `lib/game/systems/boss-tips.ts` | the "how to kill it" line | modify |
| `scripts/enemy-anims.config.json` | Scurrius npc + sequence ids | modify |
| `docs/boss-design.md` | move axis E to taken; add the Scurrius section | modify |

**No new files.** Every unit has an established home; adding one would fragment the boss across the tree.

---

### Task 1: Pure Scurrius mechanics

Everything in this task is `this`-free and DOM-free. No engine wiring yet — the whole task is provable by unit test.

**Files:**
- Modify: `lib/game/systems/boss-mechanics.ts`
- Test: `lib/game/systems/boss-mechanics.test.ts`

**Interfaces:**
- Consumes: `Point` (already imported in `boss-mechanics.ts`).
- Produces:
  - `SCURRIUS_SHEAR_FRAC`, `SCURRIUS_RAT_HP_FRAC`, `SCURRIUS_SHEAR_COOLDOWN`, `SCURRIUS_MAX_RATS`, `SCURRIUS_SHEAR_FLOOR`, `SCURRIUS_SQUEAK_INTERVAL`, `SCURRIUS_RAT_SPEED_MULT`, `SCURRIUS_WANDER_SECS`, `SCURRIUS_WANDER_LEASH`, `SCURRIUS_REFUND_RADIUS`, `SCURRIUS_SAY`: `number`/`string`
  - `type RatPhase = 'wander' | 'return'`
  - `scurriusShouldShear(hit: number, maxHp: number, hpFrac: number, cooldown: number, liveRats: number): boolean`
  - `scurriusRatHp(maxHp: number, currentHp: number): number`
  - `ratWanderTarget(originX: number, originY: number, rand: () => number, width: number, height: number, margin?: number): Point`
  - `ratRefund(ratHp: number, kingHp: number, kingMaxHp: number): number`

- [ ] **Step 1: Write the failing tests**

Append to `lib/game/systems/boss-mechanics.test.ts`. Add the new names to the existing `from './boss-mechanics'` import at the top of the file.

```ts
describe('Scurrius — shearing', () => {
  const MAX = 1000;

  it('shears on a hit at or above the threshold', () => {
    expect(scurriusShouldShear(50, MAX, 1, 0, 0)).toBe(true);
    expect(scurriusShouldShear(49, MAX, 1, 0, 0)).toBe(false);
  });

  it('ignores chip damage however often it lands', () => {
    for (let i = 0; i < 50; i++) expect(scurriusShouldShear(5, MAX, 1, 0, 0)).toBe(false);
  });

  it('is blocked by the cooldown, so one AoE volley cannot produce a litter', () => {
    expect(scurriusShouldShear(200, MAX, 1, 0.4, 0)).toBe(false);
  });

  it('is blocked by the live-rat cap', () => {
    expect(scurriusShouldShear(200, MAX, 1, 0, SCURRIUS_MAX_RATS)).toBe(false);
    expect(scurriusShouldShear(200, MAX, 1, 0, SCURRIUS_MAX_RATS - 1)).toBe(true);
  });

  it('stops shearing below the floor, so the endgame is a clean fight', () => {
    expect(scurriusShouldShear(200, MAX, SCURRIUS_SHEAR_FLOOR, 0, 0)).toBe(false);
    expect(scurriusShouldShear(200, MAX, SCURRIUS_SHEAR_FLOOR + 0.01, 0, 0)).toBe(true);
  });
});

describe('Scurrius — HP is conserved, never created', () => {
  const MAX = 1000;

  it('a rat carries the designed share of his max HP', () => {
    expect(scurriusRatHp(MAX, MAX)).toBe(Math.round(MAX * SCURRIUS_RAT_HP_FRAC));
  });

  it('never takes him below the shear floor', () => {
    const justAbove = MAX * SCURRIUS_SHEAR_FLOOR + 5;
    expect(scurriusRatHp(MAX, justAbove)).toBe(5);
  });

  it('never returns a negative amount at or under the floor', () => {
    expect(scurriusRatHp(MAX, MAX * SCURRIUS_SHEAR_FLOOR)).toBe(0);
    expect(scurriusRatHp(MAX, 0)).toBe(0);
  });

  it('shear then full refund is a round trip — the total never grows', () => {
    let king = MAX;
    const rat = scurriusRatHp(MAX, king);
    king -= rat;
    king += ratRefund(rat, king, MAX);
    expect(king).toBe(MAX);
  });

  it('a refund never overheals him past full', () => {
    expect(ratRefund(500, MAX - 10, MAX)).toBe(10);
  });

  it('a dead rat refunds nothing', () => {
    expect(ratRefund(0, 500, MAX)).toBe(0);
    expect(ratRefund(-3, 500, MAX)).toBe(0);
  });
});

describe('Scurrius — rat wandering', () => {
  it('stays inside the leash', () => {
    let n = 0;
    const rand = () => [0.1, 0.9, 0.5, 0.3][n++ % 4];
    for (let i = 0; i < 20; i++) {
      const p = ratWanderTarget(800, 400, rand, 1728, 768);
      expect(Math.hypot(p.x - 800, p.y - 400)).toBeLessThanOrEqual(SCURRIUS_WANDER_LEASH + 0.001);
    }
  });

  it('is clamped to the board, so a rat sheared at the edge cannot leave it', () => {
    const p = ratWanderTarget(5, 5, () => 0.99, 1728, 768, 26);
    expect(p.x).toBeGreaterThanOrEqual(26);
    expect(p.y).toBeGreaterThanOrEqual(26);
  });

  it('leaves the road — successive targets are not the same point', () => {
    let n = 0;
    const rand = () => [0.2, 0.8, 0.7, 0.4][n++ % 4];
    const a = ratWanderTarget(800, 400, rand, 1728, 768);
    const b = ratWanderTarget(800, 400, rand, 1728, 768);
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/game/systems/boss-mechanics.test.ts`
Expected: FAIL — `scurriusShouldShear is not defined` (and the other new names).

- [ ] **Step 3: Implement the constants and pure functions**

Append to `lib/game/systems/boss-mechanics.ts`, after the Brutus block and before the shared-boss-state section:

```ts
// ─────────────────────────────────── Scurrius ──────────────────────────────
/**
 * The swarm axis. A heavy hit **shears a Giant rat off his own health bar**: the rat
 * carries HP taken *from him*, so the encounter total never grows — it only changes
 * shape, from one fat target into several small moving ones.
 *
 * That is the whole fairness argument. Burst is not punished, it is *redistributed*:
 * a board with AoE takes the shape change for free, a pure single-target board
 * manufactures its own problem, and it does so by a visible choice rather than a roll.
 *
 * The question he asks: **does your board handle HP that has been redistributed, or
 * only HP that is stacked?** The Mole asks about space, Cerberus about composition;
 * this is the third axis and nobody else owns it.
 */

/** A single hit must be this fraction of his max HP to shear a rat. Big hits shear;
 *  chip damage never does, which is what makes the mechanic a consequence of how the
 *  player built rather than a tax on time. */
export const SCURRIUS_SHEAR_FRAC = 0.05;
/** HP a sheared rat carries, as a fraction of his max — taken from him, never added. */
export const SCURRIUS_RAT_HP_FRAC = 0.06;
/** Seconds before he may shear again. Without it a single AoE volley landing on him
 *  in one frame would produce the whole litter at once. */
export const SCURRIUS_SHEAR_COOLDOWN = 1.2;
/** Live rats at once. The anti-frustration cap — it binds the squeak as well as the
 *  shear, so no combination of triggers can bury the board. */
export const SCURRIUS_MAX_RATS = 5;
/** He stops shearing at or below this HP fraction, so the end of the fight is a clean
 *  kill rather than an endless stream of adds off a boss that will not die. */
export const SCURRIUS_SHEAR_FLOOR = 0.12;
/** Seconds between guaranteed squeaks. The floor: a pure chip-damage board never
 *  triggers a shear, and a boss whose mechanic never fires teaches nothing (the exact
 *  failure that made the first two tower-disables read as bugs). */
export const SCURRIUS_SQUEAK_INTERVAL = 12;
/** Rat speed as a multiple of his. Rats are quick; they get clear of him at once. */
export const SCURRIUS_RAT_SPEED_MULT = 1.6;
/** Seconds a rat wanders before it turns and heads home. */
export const SCURRIUS_WANDER_SECS = 5;
/** How far from the shear point a rat may roam (≈4 tiles). Keeps the distraction in
 *  the same stretch of board as the fight it came out of. */
export const SCURRIUS_WANDER_LEASH = 128;
/** How close a returning rat must get to be absorbed. */
export const SCURRIUS_REFUND_RADIUS = 26;
/** His overhead on the guaranteed squeak — the OSRS convention of announcing it. */
export const SCURRIUS_SAY = '*squeaks*';

/** Where a sheared rat is in its short life. */
export type RatPhase = 'wander' | 'return';

/**
 * Does this hit shear a rat off him?
 *
 * Every guard that keeps the mechanic from becoming an avalanche lives here rather
 * than at the call site, so a future caller cannot forget one: the cooldown, the live
 * cap and the HP floor are all part of the answer.
 */
export function scurriusShouldShear(
  hit: number, maxHp: number, hpFrac: number, cooldown: number, liveRats: number,
): boolean {
  if (cooldown > 0) return false;
  if (liveRats >= SCURRIUS_MAX_RATS) return false;
  if (hpFrac <= SCURRIUS_SHEAR_FLOOR) return false;
  return hit >= maxHp * SCURRIUS_SHEAR_FRAC;
}

/**
 * HP the rat takes with it — and therefore the HP he loses in the same frame.
 *
 * Clamped so the shear can never carry him below {@link SCURRIUS_SHEAR_FLOOR}. Without
 * that clamp a shear at low health could kill him, and "HP is conserved" would stop
 * being true at the exact moment the player is watching the bar.
 */
export function scurriusRatHp(maxHp: number, currentHp: number): number {
  const want = Math.max(1, Math.round(maxHp * SCURRIUS_RAT_HP_FRAC));
  const spare = Math.max(0, Math.floor(currentHp - maxHp * SCURRIUS_SHEAR_FLOOR));
  return Math.min(want, spare);
}

/**
 * The next point a wandering rat skitters to: **uniform random inside the leash**, and
 * deliberately unbiased.
 *
 * A rat that homed in on towers would read as a guided missile; an aimless one reads as
 * vermin, which is what makes it a *distraction*. Towers get visited plenty anyway,
 * because towers sit near the road and the road is where the rat was born.
 *
 * `rand` is injected so the walk is testable; the engine passes `Math.random`.
 */
export function ratWanderTarget(
  originX: number, originY: number, rand: () => number,
  width: number, height: number, margin = 26,
): Point {
  const ang = rand() * Math.PI * 2;
  const dist = SCURRIUS_WANDER_LEASH * (0.35 + 0.65 * rand());
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    x: clamp(originX + Math.cos(ang) * dist, margin, width - margin),
    y: clamp(originY + Math.sin(ang) * dist, margin, height - margin),
  };
}

/**
 * HP the king actually regains when a rat makes it home — whatever the rat still holds,
 * capped at full. Ignoring the rats therefore *undoes* the burst that created them,
 * which is the price of ignoring them, and it is a price paid in time rather than lives.
 */
export function ratRefund(ratHp: number, kingHp: number, kingMaxHp: number): number {
  return Math.min(kingMaxHp, kingHp + Math.max(0, ratHp)) - kingHp;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/boss-mechanics.test.ts`
Expected: PASS, all new tests green, no existing test broken.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add lib/game/systems/boss-mechanics.ts lib/game/systems/boss-mechanics.test.ts
git commit -F - <<'EOF'
feat(bosses): Scurrius shear maths — HP changes shape, never grows

A heavy hit shears a Giant rat off his own bar; the rat carries HP taken from
him, clamped so a shear can never carry him below the floor. The cooldown, the
live-rat cap and the floor all live inside the predicate, so no call site can
forget one.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 2: Content — the two stat blocks and the type unions

**Files:**
- Modify: `lib/game/data/enemies.ts`
- Modify: `lib/game/types.ts`
- Modify: `lib/game/data/drops.ts`
- Modify: `lib/game/systems/boss-mechanics.ts` (`BossId`, `MECHANIC_BOSSES`, `SCHEDULABLE_BOSSES`, `BossState`, `freshBossState`)

**Interfaces:**
- Consumes: the constants from Task 1.
- Produces: `EnemyType` members `'scurrius' | 'giant_rat'`; `BossId` member `'scurrius'`; `BossState` fields `scurriusShearCooldown?: number`, `squeakTimer?: number`, `ratsShorn?: number`; `Enemy` fields `ratPhase?: RatPhase`, `ratTimer?: number`, `ratTargetX?: number`, `ratTargetY?: number`.

**Add the union members first** and let the typecheck list every exhaustive `Record<>` that now needs a value — that error list is the checklist for this task.

- [ ] **Step 1: Add the union members**

In `lib/game/types.ts`, add `'scurrius'` and `'giant_rat'` to the `EnemyType` union.

In the same file, add these fields to the `Enemy` interface (near the existing `orbit` / `healer` / `soulStyle` escort fields):

```ts
  /** Scurrius's sheared rat: where it is in its short life. Absent on everything else.
   *  A rat with a phase drives itself and does not walk the path. */
  ratPhase?: RatPhase;
  /** Seconds left in the current {@link ratPhase} (the `return` leg ends on arrival). */
  ratTimer?: number;
  /** The point this rat is currently skittering toward while wandering. */
  ratTargetX?: number;
  ratTargetY?: number;
```

Import the type at the top of `types.ts`:

```ts
import type { RatPhase } from './systems/boss-mechanics';
```

- [ ] **Step 2: Run the typecheck to get the checklist**

Run: `npx tsc --noEmit`
Expected: FAIL, with errors naming every exhaustive record missing `scurrius` / `giant_rat` (drop tables, any `Record<EnemyType, …>`). Keep this list; the following steps clear it.

- [ ] **Step 3: Add the stat blocks**

In `lib/game/data/enemies.ts`, add to `ENEMIES`:

```ts
  scurrius: {
    type: 'scurrius',
    name: 'Scurrius',
    // The tier-0 companion to Brutus. He needs a *deep* bar rather than a tough one:
    // the fight is about the bar being split up, so it has to have enough in it to
    // split. His real OSRS hitpoints are 500 (cache NPC 7222, stats[3]); the extra
    // here buys the shear enough room to fire several times before the floor.
    hp: 900,
    speed: 40,
    color: '#7d6b58',
    reward: 340,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.2
  },
  giant_rat: {
    type: 'giant_rat',
    // Sheared off Scurrius, so it lives on his Collection Log page rather than in the
    // Monsters roster — it is not something a wave can send.
    summonedBy: 'scurrius',
    // The cache's Giant rat (NPC 7223) shares its rig with NPC 2510, which the game
    // already ships baked as `rat`. Pointing at that slug costs no new asset work.
    animSlug: 'rat',
    renderScale: 0.9,
    name: 'Giant Rat',
    // Overwritten per-spawn from `scurriusRatHp` — this is only the table default.
    hp: 54,
    speed: 64,
    color: '#8b8b8b',
    // Deliberately small: the payoff for killing a rat is denying the refund, not gold.
    // Inflating gold here would pay the player for the boss's own mechanic firing.
    reward: 4
  },
```

Add to the `WEAKNESSES` map in the same file:

```ts
  giant_rat: 'air',
```

> **Blocked:** Scurrius's own elemental weakness is a wiki infobox value and is **not**
> in the cache. Do **not** guess it. Leave him out of `WEAKNESSES` (he keeps the neutral
> default) and raise it with the user before this task is marked done.

- [ ] **Step 4: Register him as a boss**

In `lib/game/systems/boss-mechanics.ts`:

```ts
export type BossId = 'zulrah' | 'vorkath' | 'jad' | 'hydra' | 'giant_mole' | 'dusk' | 'dawn' | 'cerberus' | 'brutus' | 'scurrius';
```

Add `'scurrius'` to `MECHANIC_BOSSES`. In `SCHEDULABLE_BOSSES`, insert him **second, right after `brutus`** — that list's order is the introduction order, and he is the tier-0 companion:

```ts
export const SCHEDULABLE_BOSSES: readonly BossId[] = [
  'brutus', 'scurrius', 'giant_mole', 'jad', 'vorkath', 'zulrah', 'dusk', 'cerberus', 'hydra',
];
```

Add to the `BossState` interface:

```ts
  /** Scurrius: seconds before he may shear another rat. */
  scurriusShearCooldown?: number;
  /** Scurrius: counts down to the next guaranteed squeak. */
  squeakTimer?: number;
  /** Scurrius: rats shorn so far, read out on the boss bar. */
  ratsShorn?: number;
```

And to `freshBossState`, beside the other per-kind blocks:

```ts
  if (kind === 'scurrius') {
    state.scurriusShearCooldown = 0;
    state.squeakTimer = SCURRIUS_SQUEAK_INTERVAL;
    state.ratsShorn = 0;
  }
```

- [ ] **Step 5: Drops and pets are out of scope**

**Do not touch `lib/game/data/drops.ts`.** There is no per-monster loot table to fill
(`drops.ts` holds generic tiered tables rolled by wave, and Brutus has no entry of his own),
and neither the spec nor the user asked for a pet. Skip straight to Step 6.

- [ ] **Step 6: Clear the typecheck**

Run: `npx tsc --noEmit`
Expected: no output. If any exhaustive record still complains, add the two members there.

- [ ] **Step 7: Run the suite**

Run: `npx vitest run`
Expected: 561+ passed; only `changelog-classify.test.ts` fails to collect (pre-existing).

- [ ] **Step 8: Commit**

```bash
git add lib/game/types.ts lib/game/data/enemies.ts lib/game/data/drops.ts lib/game/systems/boss-mechanics.ts
git commit -F - <<'EOF'
feat(bosses): Scurrius and his Giant rats join the roster

Two stat blocks and their union members. The rat is `summonedBy: 'scurrius'`
so it lives on his Collection Log page, and it borrows the already-baked `rat`
slug — cache NPC 7223 shares its rig with 2510, so the swarm costs no new
asset work. He slots into the schedulable ladder second, beside Brutus.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 3: Engine wiring

The largest task, and the one with the trap. Read the warning before writing code.

> ### ⚠ The rats are NOT escorts
>
> Jad's healers and Cerberus's souls set `escort: true`. Do **not** copy that for the rats.
> `escort` carries three behaviours that are all wrong here:
>
> 1. **Orphan cull** — `handleBossMechanics` (`engine.ts:2470-2473`) deletes any escort whose
>    owner is gone. Our rats must *outlive* Scurrius: that is spec edge case 1, and without it
>    a burst board erases the mechanic for free and "HP is conserved" becomes a lie.
> 2. **No leak cost** — `engine.ts:3351` charges no life for an escort. A rat that outlives the
>    king must leak like any other enemy; the HP left his bar and is still on the board.
> 3. **No gold / no kill count** — `engine.ts:4332`. Ordinary enemies get both, which is what
>    we want.
>
> A rat therefore carries `ownerId` (so it can find the king to refund) but **never** `escort`.
> One consequence must be fixed by hand: the Collection Log kill gate at `engine.ts:4329` is
> written as `enemy.escort && ENEMIES[enemy.type]?.summonedBy`, so a non-escort summon would
> never record a kill. Step 6 widens it.

**Files:**
- Modify: `lib/game/core/engine.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: `private updateScurrius(e: Enemy, dt: number): void`, `private shearRat(king: Enemy): void`, `private updateRat(e: Enemy, dt: number): void`, `private liveRatsOf(kingId: string): number`.

- [ ] **Step 1: Import the new names**

Add to the existing `from '../systems/boss-mechanics'` import in `engine.ts`:

```ts
  SCURRIUS_SHEAR_COOLDOWN, SCURRIUS_SQUEAK_INTERVAL, SCURRIUS_RAT_SPEED_MULT,
  SCURRIUS_WANDER_SECS, SCURRIUS_REFUND_RADIUS, SCURRIUS_SAY, SCURRIUS_MAX_RATS,
  scurriusShouldShear, scurriusRatHp, ratWanderTarget, ratRefund,
```

- [ ] **Step 2: Hook the shear into `damageEnemy`**

In `damageEnemy`, beside the existing per-boss hooks (`engine.ts:4243-4256`), add:

```ts
    // Scurrius: a heavy hit shears a rat off his own bar. Placed with the other
    // per-boss damage hooks so it reads against Brutus's rage accumulator and Jad's
    // damage ring — same shape, same place.
    if (dealt > 0 && enemy.bossState?.kind === 'scurrius') {
      const st = enemy.bossState;
      if (scurriusShouldShear(dealt, enemy.maxHp, enemy.hp / enemy.maxHp,
                              st.scurriusShearCooldown ?? 0, this.liveRatsOf(enemy.id))) {
        this.shearRat(enemy);
      }
    }
```

- [ ] **Step 3: Add the shear, the rat counter and the rat spawn**

Add these methods near `summonJadHealers`:

```ts
  /** Rats currently alive that belong to this king. */
  private liveRatsOf(kingId: string): number {
    let n = 0;
    for (const e of this.enemies) if (e.type === 'giant_rat' && e.ownerId === kingId) n++;
    return n;
  }

  /**
   * Split a Giant rat off Scurrius: the rat's HP comes **out of his bar in the same
   * frame**, which is the whole mechanic made visible in one beat — a creature appears
   * and his health drops by exactly what it carries.
   *
   * The rat is a plain enemy, never an `escort`: it has to outlive him. See the note in
   * the plan — an escort would be culled the moment he dies, and the HP that left his
   * bar would vanish with it.
   */
  private shearRat(king: Enemy) {
    const st = king.bossState!;
    const hp = scurriusRatHp(king.maxHp, king.hp);
    if (hp <= 0) return;
    king.hp -= hp;
    st.scurriusShearCooldown = SCURRIUS_SHEAR_COOLDOWN;
    st.ratsShorn = (st.ratsShorn ?? 0) + 1;
    const speed = king.speed * SCURRIUS_RAT_SPEED_MULT;
    const target = ratWanderTarget(king.x, king.y, Math.random, this.width, this.height);
    this.enemies.push({
      ...ENEMIES.giant_rat,
      id: uid(),
      type: 'giant_rat',
      name: 'Giant Rat',
      ownerId: king.id,
      debug: king.debug,
      x: king.x,
      y: king.y,
      hp,
      maxHp: hp,
      speed,
      baseSpeed: speed,
      naturalSpeed: speed,
      pathIndex: king.pathIndex,
      ratPhase: 'wander',
      ratTimer: SCURRIUS_WANDER_SECS,
      ratTargetX: target.x,
      ratTargetY: target.y,
      slowTimer: 0,
      stunTimer: 0,
      tauntTimer: 0,
      groundTimer: 0,
      animTime: Math.random() * 2,
      spawnAnim: SPAWN_ANIM_SECONDS,
    });
    this.addRing(king.x, king.y, 6, 40, '#c9b28a', 0.45, 3);
    this.sound.play('combat_hit', 45);
  }
```

- [ ] **Step 4: Add `updateScurrius` and dispatch it**

```ts
  /**
   * Scurrius: the swarm axis. The shear itself is driven from `damageEnemy` — it is a
   * *reaction*, which is what makes it the player's doing — so all this owns is the
   * cooldown and the guaranteed squeak.
   *
   * The squeak is the floor, not the mechanic. A board that only chips never lands a hit
   * big enough to shear, and a boss whose idea never fires teaches nothing; the squeak
   * guarantees he still gets to make his point. It respects the same live-rat cap, so it
   * can never be the thing that buries the board.
   */
  private updateScurrius(e: Enemy, dt: number) {
    const st = e.bossState!;
    st.scurriusShearCooldown = Math.max(0, (st.scurriusShearCooldown ?? 0) - dt);
    st.squeakTimer = (st.squeakTimer ?? SCURRIUS_SQUEAK_INTERVAL) - dt;
    if (st.squeakTimer > 0) return;
    st.squeakTimer = SCURRIUS_SQUEAK_INTERVAL;
    if (this.liveRatsOf(e.id) >= SCURRIUS_MAX_RATS) return;
    e.say = SCURRIUS_SAY;
    e.sayTimer = 1.4;
    this.shearRat(e);
  }
```

Dispatch it in `handleBossMechanics` beside the others (`engine.ts:2504`):

```ts
      } else if (st.kind === 'scurrius') {
        this.updateScurrius(e, dt);
      }
```

- [ ] **Step 5: Step the rats, and stop them walking the path**

Add the rat stepper:

```ts
  /**
   * A sheared rat drives itself: it skitters to random points **off the road and across
   * towers**, then turns and runs the HP it carries back into the king.
   *
   * The wandering is the point rather than flavour. A rat drifting through a tower's range
   * pulls that tower's fire off Scurrius, which is at once the right play (killing it denies
   * the refund) and the wrong one (the king is not dying). It never *disables* what it walks
   * over — that is Brutus's job, and it has a visible cause there.
   *
   * With the king gone there is nothing to run back to, so the rat stops driving itself and
   * the ordinary path walk takes over from wherever it stands. It aims at its next waypoint,
   * so an off-road rat simply angles back onto the road — no special rejoin leg needed.
   */
  private updateRat(e: Enemy, dt: number) {
    const king = e.ownerId ? this.enemies.find((o) => o.id === e.ownerId) : undefined;
    if (!king) {
      // Spec edge case 1 & 2: the HP left his bar and is still on the board. It becomes an
      // ordinary enemy that walks, leaks and costs a life like any other.
      e.ratPhase = undefined;
      return;
    }
    if (e.ratPhase === 'wander') {
      e.ratTimer = (e.ratTimer ?? 0) - dt;
      const tx = e.ratTargetX ?? e.x;
      const ty = e.ratTargetY ?? e.y;
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        const next = ratWanderTarget(e.x, e.y, Math.random, this.width, this.height);
        e.ratTargetX = next.x;
        e.ratTargetY = next.y;
      } else {
        const step = Math.min(d, e.speed * dt);
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
      }
      if ((e.ratTimer ?? 0) <= 0) e.ratPhase = 'return';
      return;
    }
    // Heading home. Arrival is by distance, not by clock — the king keeps moving.
    const dx = king.x - e.x, dy = king.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= SCURRIUS_REFUND_RADIUS) {
      const healed = ratRefund(e.hp, king.hp, king.maxHp);
      king.hp += healed;
      // Say it out loud: the refund is the one moment of this fight that would otherwise
      // be invisible, and an unexplained rising boss bar reads as a bug.
      if (healed > 0) this.addFloatText(king.x, king.y, `+${Math.round(healed)}`, '#48d04a');
      this.addRing(king.x, king.y, 5, 34, '#48d04a', 0.4, 3);
      const idx = this.enemies.indexOf(e);
      if (idx >= 0) this.enemies.splice(idx, 1);
      return;
    }
    const step = e.speed * dt;
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
  }
```

> **Check the float-text helper's real name before writing this.** Grep `engine.ts` for how
> damage numbers are pushed (e.g. `addFloatText` / `addPopup` / `floats.push`) and use that
> signature. Do not invent one.

Call it from `handleBossMechanics`, in the same loop that culls orphaned escorts, before the
`bossState` loop:

```ts
    for (const e of this.enemies) if (e.type === 'giant_rat') this.updateRat(e, dt);
```

And skip the path walk for a rat that is driving itself — beside the Mole and Brutus guards
(`engine.ts:3332-3335`):

```ts
      // A sheared rat drives itself (wander, then the run home). Walking it as well would
      // slide it along the road while it is meant to be off it.
      if (e.ratPhase) continue;
```

- [ ] **Step 6: Widen the Collection Log kill gate**

At `engine.ts:4329`, the gate requires `escort`, which our non-escort rats are not. Replace:

```ts
    if (!enemy.debug && enemy.escort && ENEMIES[enemy.type]?.summonedBy) {
```

with:

```ts
    // Any summon with its own Collection Log line records the kill, even though escorts
    // pay nothing — the entry would otherwise be permanently unobtainable. Keyed on
    // `summonedBy` alone: Scurrius's rats are summons that are deliberately *not* escorts
    // (they outlive him), and requiring `escort` here would silently skip them. The
    // non-escort branch below already counts them, so guard against double-counting.
    if (!enemy.debug && enemy.escort && ENEMIES[enemy.type]?.summonedBy) {
```

> **Decide, then write one of the two.** Trace whether a `giant_rat` already reaches the
> `!enemy.escort` branch at `engine.ts:4332` (it should — it is not an escort). If it does,
> it is **already counted** and this gate needs **no change at all**; leave it alone and
> delete this step. Only widen the gate if the trace shows rats are not counted. Do not
> change both branches — that double-counts every rat kill.

- [ ] **Step 7: Typecheck and test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean typecheck; 561+ tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/game/core/engine.ts
git commit -F - <<'EOF'
feat(bosses): Scurrius sheds rats that wander the board and run his HP back

A heavy hit splits a Giant rat off his bar in the same frame the rat appears.
Rats wander off-road and over towers as aggro bait, then turn and refund
whatever HP they still carry, so ignoring them undoes the burst that made them.
They are deliberately not escorts: when he dies they keep the HP that left his
bar and walk the road like anything else.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 4: The return tether

The refund is the one state in this fight with no natural picture. The tether is what makes it legible *before* it happens, not after.

**Files:**
- Modify: `lib/game/core/renderer.ts`

**Interfaces:**
- Consumes: `Enemy.ratPhase`, `Enemy.ownerId`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Draw the tether**

In `renderer.ts`, in the enemy-drawing pass (find where enemies are iterated — `this.e.enemies`), add a pre-pass that draws under the sprites:

```ts
    // Scurrius: a rat on its way home is about to hand his health back. Nothing else in
    // the fight would show that, and a boss bar that rises for no visible reason reads as
    // a bug rather than as a mechanic — so the rat is leashed to him while it returns.
    for (const e of this.e.enemies) {
      if (e.ratPhase !== 'return' || !e.ownerId) continue;
      const king = this.e.enemies.find((o) => o.id === e.ownerId);
      if (!king) continue;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#48d04a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -(this.e.gameTime * 30) % 12;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(king.x, king.y);
      ctx.stroke();
      ctx.restore();
    }
```

> Match the surrounding code's context variable (`ctx` vs `c`) and confirm `gameTime` is
> reachable from the renderer (it holds a back-reference `this.e` to the engine and keeps no
> state of its own). The dash offset makes the leash crawl toward the king, so the direction
> of the refund is readable without motion.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Verify it on screen**

The renderer has no unit tests, and a green typecheck proves nothing about what is drawn.
Use the `game-verify` skill to drive the exported game headless, spawn Scurrius from the debug
panel, and confirm: the bar drops as a rat appears, rats leave the road and cross towers, the
tether appears on the way back, and the bar rises with a green number on arrival.

- [ ] **Step 4: Commit**

```bash
git add lib/game/core/renderer.ts
git commit -F - <<'EOF'
feat(bosses): leash a returning rat to Scurrius so the refund is visible

A rat carrying health home is the one part of the fight with no picture, and a
boss bar that climbs for no visible reason reads as a bug. The dashed leash
crawls toward the king, so which way the health is moving is readable at a
glance.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 5: Assets — bake Scurrius's clips

**Files:**
- Modify: `scripts/enemy-anims.config.json`
- Create: `public/assets/enemies/scurrius/` (generated)
- Modify: `lib/game/data/enemy-anims.data.ts` (generated)
- Modify: `lib/game/core/sound.ts`

Verified already (spec § Cache verification): Scurrius is NPC **7221**/**7222**, `size 3`,
`standingAnimation 10687`, `walkingAnimation 10690`, `runAnimation 10691`. The rat needs
nothing — it borrows the baked `rat` slug.

- [ ] **Step 1: Pick the hurt and death sequence ids**

Scurrius has **no entry in the observed-anims oracle** (`scripts/data/openosrs-observed-anims.json`
is sparse and he post-dates it), so ids must come from the framemap-candidate method used for
Brutus — **not** from eyeballing neighbouring ids.

Dispatch the `npc-anim-auditor` agent with: *"Pick walk/hurt/death sequence ids for Scurrius,
NPC 7221 (also 7222). His rig is standingAnimation 10687, walkingAnimation 10690, runAnimation
10691. He has no observed-anims entry, so use `scripts/find-npc-anim-candidates.mjs` across the
block around those ids, keep only ids sharing his framemap, render the candidates and pick.
Add the entry to `scripts/enemy-anims.config.json`, bake, and verify the sheets."*

- [ ] **Step 2: Bake**

Run:
```bash
npm run export:enemy-gltf -- --only scurrius
npm run bake:enemies -- --only scurrius
npm run anims:data
```
Expected: `public/assets/enemies/scurrius/{walk,hurt,death}.png` + `scurrius.json`, and a
regenerated `lib/game/data/enemy-anims.data.ts`.

- [ ] **Step 3: Look at the sheets**

Open each PNG. Confirm the model faces side-on, is not clipped, and that the death clip ends
lying down rather than mid-pose. A sheet that looks wrong is not persisted — re-pick the id.

- [ ] **Step 4: Wire the death sound**

The engine plays `death_<type>`. Extract a Scurrius death sound from the cache
(`npm run extract:sounds`) and register `death_scurrius` in `lib/game/core/sound.ts`, following
the neighbouring `death_*` entries. If no distinct clip exists for him, leave it unmapped — the
generic `death` fallback at `engine.ts:4320` already handles it. **Do not substitute another
NPC's sound.**

- [ ] **Step 5: Commit**

```bash
git add scripts/enemy-anims.config.json lib/game/data/enemy-anims.data.ts lib/game/core/sound.ts public/assets/enemies/scurrius
git commit -F - <<'EOF'
feat(bosses): bake Scurrius's animation clips from the cache

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

### Task 6: The tip, the wave, and the ledger

**Files:**
- Modify: `lib/game/systems/boss-tips.ts`
- Modify: `docs/boss-design.md`
- Verify only (no edit expected): `lib/game/data/waves.ts`

- [ ] **Step 1: Verify the kill tip — it already landed**

> **Already done.** `BOSS_TIPS` is typed `Record<BossId, string>`, so adding `'scurrius'` to
> `BossId` in Task 2 made the typecheck demand this entry immediately — it could not wait for
> Task 6. The entry exists as of commit `9009f77`. **Do not add it again**: a second
> `scurrius:` key in the same object literal is a silent duplicate (last one wins), not an
> error. Confirm the text below is what is in the file and move on.

```ts
  scurrius:
    'Every heavy hit splits a Giant rat off him, carrying health out of his own bar — so burst alone just turns one big target into several small ones. The rats scatter across the board and then run back to him, handing the health straight back, so kill them before they arrive. Bring something that hits more than one thing at a time.',
```

Written as an instruction, not lore — what the player should *do*, in one breath. In-game
strings stay English.

- [ ] **Step 2: Confirm his wave placement — no file change expected**

`LANDMARK_WAVES` in `lib/game/data/waves.ts` holds **trash waves only** (waves 1–9, goblins and
rats); no boss appears in it, Brutus included. Bosses are drawn by `rollWaveBosses` from
`SCHEDULABLE_BOSSES`, where Task 2 already placed him second.

So **this step should require no edit.** Confirm it rather than assuming: grep `rollWaveBosses`
in `lib/game/core/engine.ts` and check that boss selection reads `SCHEDULABLE_BOSSES` with no
per-boss wave gate (e.g. a minimum-wave table) that would need a Scurrius entry. If such a gate
exists, add him there beside Brutus. Then spawn him from the debug panel to confirm he arrives.

- [ ] **Step 3: Update the ledger**

In `docs/boss-design.md`:
- Add a row to the "Taken ideas" table: `| Scurrius | Does your board handle HP that has been redistributed? | adds — splitting |`
- Under **§ E. Splitting / swarm**, mark Scurrius `✅ shipped` and rewrite the bullet to describe
  what was actually built (shear on heavy hits, HP conserved, wandering aggro bait, the refund) —
  the doc is the ledger of what *is*, not of what was once planned. Leave Verzik as the open
  inverted variant.
- In the "Suggested build order", mark item 2 ✅.

- [ ] **Step 4: Typecheck and test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; 561+ pass.

- [ ] **Step 5: Commit**

```bash
git add lib/game/systems/boss-tips.ts docs/boss-design.md
git commit -F - <<'EOF'
feat(bosses): Scurrius takes the swarm axis

His Collection Log tip names the real counter — bring something that hits more
than one thing — and the design ledger records the axis as taken.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Re-bake the changelog**

```bash
node scripts/build-changelog.mjs
git add public/data/changelog.json
git commit -F - <<'EOF'
chore: re-bake the changelog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Open questions to settle before the boss is done

1. **Scurrius's elemental weakness** — a wiki infobox value, not in the cache. Blocked in
   Task 2 Step 3; must be confirmed with the user rather than guessed.
2. **The float-text helper's real name** — Task 3 Step 5 assumes `addFloatText`. Grep before
   writing.
3. **The kill-count gate** — Task 3 Step 6 is conditional on a trace. Decide, do one thing, and
   never both branches.

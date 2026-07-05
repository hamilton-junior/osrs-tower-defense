# Community Patch #1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the player-feedback patch: 7 UX/audio fixes (docked sidebar, top wave HUD, tooltips, slayer/auto-start relocations, combat-SFX fade) + the balance hotfix (Blood nerf, TzHaar buff, Regen gating, affix stacking cap).

**Architecture:** Pure rule changes land in `lib/game/systems/` (affixes, magic, geometry) with unit tests — the regression net. The engine (`lib/game/core/engine.ts`) only re-wires call sites. UI work is all in `components/game/GameRoot.tsx` (plus `DebugPanel.tsx`, `globals.css`); the sound work is in `lib/game/core/sound.ts`.

**Tech Stack:** Next.js static export, TypeScript (type errors FAIL the build), Vitest, Canvas 2D. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-05-community-patch-1-design.md`

## Global Constraints

- In-game UI strings are **English**; conversation with the user is pt-BR.
- Every asset must come from the OSRS cache (none needed in this patch — no new assets).
- Verify trio after each task: `npx tsc --noEmit` (must be silent), `npx vitest run` (all pass; 286 before this patch), `npm run build` for UI tasks.
- Never `git add -A` — the repo has untracked `.claude/` and `.vscode/` that must NOT be committed. Stage files by exact path.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (write the message to a scratch file and use `git commit -F <file>` — PowerShell/Git-Bash quoting breaks inline multi-line `-m`).
- Balance numbers are proposals — the user tunes via playtest. Implement exactly the numbers below.

---

### Task 1: Regen affix — gate to wave 12 + wave-scaled ramp

**Files:**
- Modify: `lib/game/systems/affixes.ts`
- Modify: `lib/game/systems/affixes.test.ts`
- Modify: `lib/game/core/engine.ts` (two call sites)

**Interfaces:**
- Consumes: existing `rollAffixes(wave, isBoss, rng)`, `rollBossAffixes(rng)`, `regenPerSec(affixes, maxHp)`.
- Produces: `regenPerSec(affixes: readonly EnemyAffix[], maxHp: number, wave: number): number`; `regenFracForWave(wave: number): number`; consts `REGEN_UNLOCK_WAVE = 12`, `REGEN_FRAC_MIN = 0.01`, `REGEN_FRAC_MAX = 0.02`, `REGEN_RAMP_END_WAVE = 30`; `rollBossAffixes(rng: () => number, wave: number)` (gains a wave param). `REGEN_FRAC_PER_SEC` is **deleted**.

- [ ] **Step 1: Write the failing tests**

In `lib/game/systems/affixes.test.ts`: update the import block (remove `REGEN_FRAC_PER_SEC`, add `regenFracForWave, REGEN_UNLOCK_WAVE, REGEN_FRAC_MIN, REGEN_FRAC_MAX, REGEN_RAMP_END_WAVE`), fix any existing `regenPerSec(a, hp)` calls to pass a wave (use `REGEN_RAMP_END_WAVE` to keep old 2% expectations valid), fix any existing `rollBossAffixes(rng)` calls to pass a wave (use a late one, e.g. `50`, to keep their behaviour), and add:

```ts
describe('regenerating gating + ramp', () => {
  it('never rolls regenerating before its unlock wave', () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollAffixes(REGEN_UNLOCK_WAVE - 1, false, seq(0, i / 200, 0.99));
      expect(roll.affixes).not.toContain('regenerating');
    }
  });
  it('can roll regenerating from its unlock wave', () => {
    const all: string[] = [];
    for (let i = 0; i < 200; i++) all.push(...rollAffixes(60, false, seq(0, i / 200, 0.99)).affixes);
    expect(all).toContain('regenerating');
  });
  it('ramps 1%/s at wave 12 to 2%/s at wave 30+, linearly', () => {
    expect(regenFracForWave(REGEN_UNLOCK_WAVE)).toBeCloseTo(REGEN_FRAC_MIN);
    expect(regenFracForWave(21)).toBeCloseTo((REGEN_FRAC_MIN + REGEN_FRAC_MAX) / 2);
    expect(regenFracForWave(30)).toBeCloseTo(REGEN_FRAC_MAX);
    expect(regenFracForWave(99)).toBeCloseTo(REGEN_FRAC_MAX);
  });
  it('regenPerSec applies the wave-scaled frac', () => {
    expect(regenPerSec(['regenerating'], 1000, REGEN_UNLOCK_WAVE)).toBeCloseTo(10);
    expect(regenPerSec(['regenerating'], 1000, 30)).toBeCloseTo(20);
    expect(regenPerSec(['hasted'], 1000, 30)).toBe(0);
  });
  it('boss rolls also exclude regenerating before the unlock wave', () => {
    for (let i = 0; i < 200; i++) {
      expect(rollBossAffixes(seq(0, i / 200, 0.99), REGEN_UNLOCK_WAVE - 1).affixes).not.toContain('regenerating');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/game/systems/affixes.test.ts`
Expected: FAIL (`regenFracForWave` not exported; wrong arity).

- [ ] **Step 3: Implement in `affixes.ts`**

Replace the `REGEN_FRAC_PER_SEC` const and `regenPerSec` with:

```ts
/** Regenerating never appears before this wave — early DPS can't outpace it. */
export const REGEN_UNLOCK_WAVE = 12;
/** Regen ramps from MIN %/s at its unlock wave to MAX %/s at the ramp end. */
export const REGEN_FRAC_MIN = 0.01;
export const REGEN_FRAC_MAX = 0.02;
export const REGEN_RAMP_END_WAVE = 30;

/** Wave-scaled regen fraction (of max HP, per second). */
export function regenFracForWave(wave: number): number {
  const t = Math.max(0, Math.min(1, (wave - REGEN_UNLOCK_WAVE) / (REGEN_RAMP_END_WAVE - REGEN_UNLOCK_WAVE)));
  return REGEN_FRAC_MIN + (REGEN_FRAC_MAX - REGEN_FRAC_MIN) * t;
}

/** HP regenerated per second (0 when not regenerating). */
export function regenPerSec(affixes: readonly EnemyAffix[], maxHp: number, wave: number): number {
  return has(affixes, 'regenerating') ? maxHp * regenFracForWave(wave) : 0;
}
```

Gate the pools (both roll functions):

```ts
/** The affix pool for a given wave (regenerating is gated late). */
function poolForWave(base: readonly EnemyAffix[], wave: number): EnemyAffix[] {
  return base.filter((a) => a !== 'regenerating' || wave >= REGEN_UNLOCK_WAVE);
}
```

In `rollAffixes`, replace `drawAffixes([...ALL_AFFIXES], …)` with `drawAffixes(poolForWave(ALL_AFFIXES, wave), …)`. Change `rollBossAffixes(rng)` to `rollBossAffixes(rng: () => number, wave: number)` and use `drawAffixes(poolForWave(BOSS_AFFIX_POOL, wave), …)`.

- [ ] **Step 4: Re-wire the engine**

In `lib/game/core/engine.ts`:
- Line ~2122: `const regen = regenPerSec(e.affixes, e.maxHp);` → `const regen = regenPerSec(e.affixes, e.maxHp, this.wave);`
- Grep `rollBossAffixes(` and add `, this.wave` to the call.

- [ ] **Step 5: Verify**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all tests pass, tsc silent.

- [ ] **Step 6: Commit**

```bash
git add lib/game/systems/affixes.ts lib/game/systems/affixes.test.ts lib/game/core/engine.ts
git commit -F <scratch-msg-file>   # "balance(affixes): gate Regenerating to wave 12 with a 1%->2% ramp"
```

---

### Task 2: Affix stacking — max 1 pre-30, max 2 after, banned pairs

**Files:**
- Modify: `lib/game/systems/affixes.ts`
- Modify: `lib/game/systems/affixes.test.ts`

**Interfaces:**
- Consumes: Task 1's `poolForWave`.
- Produces: consts `EXTRA_AFFIX_UNLOCK_WAVE = 30`, `MAX_AFFIXES = 2`, `BANNED_PAIRS: readonly [EnemyAffix, EnemyAffix][]`; `extraAffixChance(wave, granted)` re-anchored (0 before wave 30, ramps over `EXTRA_AFFIX_RAMP_WAVES` from there, 0 once `granted >= MAX_AFFIXES`). `drawAffixes` enforces the cap + bans for BOTH normal and boss rolls.

- [ ] **Step 1: Write the failing tests**

Add to `affixes.test.ts` (import `EXTRA_AFFIX_UNLOCK_WAVE, MAX_AFFIXES, BANNED_PAIRS`; existing `extraAffixChance` expectations that assume the old wave-5 anchor must be updated to the new anchor):

```ts
describe('affix stacking cap + banned pairs', () => {
  it('is a hard max-1 before the extra unlock wave', () => {
    for (let w = AFFIX_UNLOCK_WAVE; w < EXTRA_AFFIX_UNLOCK_WAVE; w++) {
      expect(extraAffixChance(w, 1)).toBe(0);
    }
    for (let i = 0; i < 300; i++) {
      const roll = rollAffixes(EXTRA_AFFIX_UNLOCK_WAVE - 1, false, seq(0, i / 300, 0, 0, 0));
      expect(roll.affixes.length).toBeLessThanOrEqual(1);
    }
  });
  it('re-anchors the ramp at the unlock wave (no cliff)', () => {
    expect(extraAffixChance(EXTRA_AFFIX_UNLOCK_WAVE, 1)).toBeCloseTo(0);
    expect(extraAffixChance(EXTRA_AFFIX_UNLOCK_WAVE + EXTRA_AFFIX_RAMP_WAVES, 1)).toBeCloseTo(EXTRA_AFFIX_MAX);
  });
  it('never exceeds MAX_AFFIXES even with an always-yes rng', () => {
    for (let i = 0; i < 300; i++) {
      const roll = rollAffixes(200, false, seq(0, i / 300, 0, 0, 0, 0, 0));
      expect(roll.affixes.length).toBeLessThanOrEqual(MAX_AFFIXES);
    }
  });
  it('banned pairs never co-occur, in either draw order', () => {
    for (let i = 0; i < 500; i++) {
      const affixes = rollAffixes(200, false, seq(0, i / 500, i % 100 / 100, 0)).affixes;
      for (const [a, b] of BANNED_PAIRS) {
        expect(affixes.includes(a) && affixes.includes(b)).toBe(false);
      }
    }
  });
  it('boss rolls respect the bans and the cap', () => {
    for (let i = 0; i < 500; i++) {
      const affixes = rollBossAffixes(seq(0, i / 500, 0, 0, 0), 200).affixes;
      expect(affixes.length).toBeLessThanOrEqual(MAX_AFFIXES);
      for (const [a, b] of BANNED_PAIRS) {
        expect(affixes.includes(a) && affixes.includes(b)).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/game/systems/affixes.test.ts`
Expected: FAIL (missing exports; lengths exceed caps).

- [ ] **Step 3: Implement in `affixes.ts`**

Replace the multi-affix tuning block + `extraAffixChance` + `drawAffixes`:

```ts
/** Second affix unlocks here; before it every elite is exactly one affix. */
export const EXTRA_AFFIX_UNLOCK_WAVE = 30;
/** Hard ceiling on affixes per enemy (normal AND boss rolls). */
export const MAX_AFFIXES = 2;
export const EXTRA_AFFIX_MAX = 0.5;        // extra-affix chance at full ramp
export const EXTRA_AFFIX_RAMP_WAVES = 25;  // waves from extra-unlock → full ramp
export const EXTRA_AFFIX_DECAY = 0.5;      // kept for tuning symmetry

/** Pairs that must never co-occur (unkillable-feeling combos). */
export const BANNED_PAIRS: readonly [EnemyAffix, EnemyAffix][] = [
  ['regenerating', 'warded'],
  ['regenerating', 'shielded'],
];

export function extraAffixChance(wave: number, granted: number): number {
  if (granted >= MAX_AFFIXES) return 0;
  const ramp = Math.max(0, Math.min(1, (wave - EXTRA_AFFIX_UNLOCK_WAVE) / EXTRA_AFFIX_RAMP_WAVES));
  return EXTRA_AFFIX_MAX * ramp * Math.pow(EXTRA_AFFIX_DECAY, Math.max(0, granted - 1));
}

function drawAffixes(pool: EnemyAffix[], rng: () => number, extraChance: (granted: number) => number): AffixRoll {
  const take = () => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const affixes: EnemyAffix[] = [take()];
  // Prune anything banned alongside what's already granted.
  const prune = () => {
    for (let i = pool.length - 1; i >= 0; i--) {
      const c = pool[i];
      if (BANNED_PAIRS.some(([a, b]) => (affixes.includes(a) && c === b) || (affixes.includes(b) && c === a))) pool.splice(i, 1);
    }
  };
  prune();
  while (pool.length && affixes.length < MAX_AFFIXES && rng() < extraChance(affixes.length)) {
    affixes.push(take());
    prune();
  }
  const roll: AffixRoll = { affixes };
  if (affixes.includes('armored')) roll.armoredStyle = rollArmoredStyle(rng);
  return roll;
}
```

Update the module doc comment (top of file) — it currently promises "NO hard ceiling on the count"; rewrite that sentence to describe the max-1 → max-2-at-30 rule and the banned pairs.

- [ ] **Step 4: Verify**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: green + silent. (If pre-existing `extraAffixChance` tests still assert the old wave-5 anchor, update them to the new anchor — the behaviour change is the point of the task.)

- [ ] **Step 5: Commit**

```bash
git add lib/game/systems/affixes.ts lib/game/systems/affixes.test.ts
git commit -F <scratch-msg-file>   # "balance(affixes): cap stacking (1 pre-30, 2 after) + ban Regen+Warded/Shielded"
```

---

### Task 3: Blood Barrage nerf — (0.75·L)% of max HP, capped at 30·L

**Files:**
- Modify: `lib/game/systems/magic.ts`
- Modify: `lib/game/systems/magic.test.ts`
- Modify: `lib/game/types.ts` (Projectile gains `bonusMaxHpCap?`)
- Modify: `lib/game/core/engine.ts` (fire site ~2269, hit sites ~2601 and ~2611)

**Interfaces:**
- Consumes: existing `bloodBonusFrac(level)`, projectile field `bonusMaxHpFrac?: number`.
- Produces: `bloodBonusFrac(towerLevel): number` = `(0.75·L)/100`; new `bloodBonusCap(towerLevel): number` = `30·L`; `Projectile.bonusMaxHpCap?: number`.

- [ ] **Step 1: Write the failing tests**

In `lib/game/systems/magic.test.ts` add (import `bloodBonusCap`):

```ts
describe('blood barrage nerf', () => {
  it('bonus frac is (0.75·level)% — steep level scaling', () => {
    expect(bloodBonusFrac(1)).toBeCloseTo(0.0075);
    expect(bloodBonusFrac(2)).toBeCloseTo(0.015);
    expect(bloodBonusFrac(3)).toBeCloseTo(0.0225);
    expect(bloodBonusFrac(4)).toBeCloseTo(0.03);
  });
  it('flat cap is 30·level', () => {
    expect(bloodBonusCap(1)).toBe(30);
    expect(bloodBonusCap(4)).toBe(120);
  });
  it('cap engages against giant max-HP pools', () => {
    // 100k HP boss at L4: 3% would be 3000 — the cap holds it to 120.
    expect(Math.min(Math.floor(100_000 * bloodBonusFrac(4)), bloodBonusCap(4))).toBe(120);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/game/systems/magic.test.ts`
Expected: FAIL (old frac values; `bloodBonusCap` missing). Update any existing test asserting the old `(3+0.5L)%` values.

- [ ] **Step 3: Implement in `magic.ts`**

Replace `bloodBonusFrac` (and its doc) with:

```ts
/**
 * Blood barrage bonus damage as a fraction of the target's max HP:
 * `(0.75·level)%` (0.75% at L1 → 3% at L4) — deliberately weak early and 4×
 * across the tiers, per the community balance pass. Each hit's bonus is also
 * flat-capped by {@link bloodBonusCap} so it cannot scale into infinity
 * against giant boss HP pools.
 */
export function bloodBonusFrac(towerLevel: number): number {
  return (0.75 * towerLevel) / 100;
}

/** Flat per-hit ceiling of the Blood %max-HP bonus: 30·level damage. */
export function bloodBonusCap(towerLevel: number): number {
  return 30 * towerLevel;
}
```

Update `ANCIENTS.blood.desc` to: `'AoE barrage; bonus damage = (0.75·level)% of max HP (capped), plus a chance to restore a life on a kill'`.

- [ ] **Step 4: Thread the cap through the projectile**

`lib/game/types.ts` — find `bonusMaxHpFrac?: number;` on the Projectile interface and add below it:

```ts
  /** Flat per-hit ceiling of the %max-HP bonus (Blood barrage cap). */
  bonusMaxHpCap?: number;
```

`engine.ts` fire site (~2269): import `bloodBonusCap` in the magic import list, add a `let projBonusMaxHpCap = 0;` beside `projBonusMaxHpFrac` (~2246), then:

```ts
          // Blood barrage adds (0.75·level)% of each target's max HP, capped at 30·level.
          if (anc === 'blood') { projBonusMaxHpFrac = bloodBonusFrac(tower.level); projBonusMaxHpCap = bloodBonusCap(tower.level); }
```

…and in the projectile literal (~2337) after `bonusMaxHpFrac`: `bonusMaxHpCap: projBonusMaxHpCap || undefined,`.

Hit sites — AoE (~2601):

```ts
        const bonus = p.bonusMaxHpFrac
          ? Math.min(Math.floor(e.maxHp * p.bonusMaxHpFrac * scale), Math.floor((p.bonusMaxHpCap ?? Infinity) * scale))
          : 0;
```

Single-target (~2611):

```ts
      const bonus = p.bonusMaxHpFrac
        ? Math.min(Math.floor(target.maxHp * p.bonusMaxHpFrac), Math.floor(p.bonusMaxHpCap ?? Infinity))
        : 0;
```

- [ ] **Step 5: Verify**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: green + silent.

- [ ] **Step 6: Commit**

```bash
git add lib/game/systems/magic.ts lib/game/systems/magic.test.ts lib/game/types.ts lib/game/core/engine.ts
git commit -F <scratch-msg-file>   # "balance(blood): (0.75*L)% max-HP bonus, flat-capped at 30*L per hit"
```

---

### Task 4: TzHaar — stun from L1, knockback audit, shove FX, cost 125

**Files:**
- Modify: `lib/game/systems/magic.ts` (stun table)
- Modify: `lib/game/systems/magic.test.ts`
- Modify: `lib/game/systems/geometry.ts` (+ its test) — extract the knockback step
- Modify: `lib/game/core/engine.ts` (pushback/crush cases, `knockback()`)
- Modify: `lib/game/data/towers.ts` (L1 cost)

**Interfaces:**
- Consumes: `tzhaarKnockback(level)`, engine cases `'pushback'`/`'crush'` in `applyOnHit` (~2760/~2770), `engine.knockback(e, dist)` (~2810), `engine.addRing(x, y, r0, r1, color, life, width)`.
- Produces: `TZHAAR_STUN: readonly number[]` and `tzhaarStun(level: number): number` in magic.ts; `knockbackStep(x, y, tx, ty, dist): { x: number; y: number; moved: number }` in geometry.ts.

- [ ] **Step 1: Write the failing tests**

`magic.test.ts`:

```ts
describe('tzhaar stun from level 1', () => {
  it('stuns at every tier, scaling into the maul values', () => {
    expect(tzhaarStun(1)).toBeCloseTo(0.3);
    expect(tzhaarStun(2)).toBeCloseTo(0.45);
    expect(tzhaarStun(3)).toBeCloseTo(0.6);
    expect(tzhaarStun(4)).toBeCloseTo(0.6);
  });
  it('clamps out-of-range levels like tzhaarKnockback', () => {
    expect(tzhaarStun(0)).toBeCloseTo(0.3);
    expect(tzhaarStun(9)).toBeCloseTo(0.6);
  });
});
```

`geometry.test.ts` (knockback audit — proves the shove really moves the enemy back along the path):

```ts
describe('knockbackStep', () => {
  it('moves the point toward the target by dist', () => {
    const r = knockbackStep(100, 0, 0, 0, 28);
    expect(r.x).toBeCloseTo(72);
    expect(r.y).toBeCloseTo(0);
    expect(r.moved).toBeCloseTo(28);
  });
  it('clamps at the target waypoint instead of overshooting', () => {
    const r = knockbackStep(10, 0, 0, 0, 28);
    expect(r.x).toBeCloseTo(0);
    expect(r.moved).toBeCloseTo(10);
  });
  it('no-ops when already on the waypoint or dist <= 0', () => {
    expect(knockbackStep(0.5, 0, 0, 0, 28).moved).toBe(0);
    expect(knockbackStep(100, 0, 0, 0, 0).moved).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/game/systems/magic.test.ts lib/game/systems/geometry.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement the pure pieces**

`magic.ts`, right under `tzhaarKnockback`:

```ts
/** TzHaar on-hit stun seconds per weapon tier — every tier stuns (community
 *  balance pass), the dagger tiers briefly and the mauls at the full crush 0.6s. */
export const TZHAAR_STUN: readonly number[] = [0.3, 0.45, 0.6, 0.6];

/** TzHaar stun seconds for a weapon tier (clamped to the table). */
export function tzhaarStun(level: number): number {
  const i = Math.max(0, Math.min(TZHAAR_STUN.length - 1, Math.floor(level) - 1));
  return TZHAAR_STUN[i];
}
```

`geometry.ts`:

```ts
/** One knockback shove: move (x,y) toward the waypoint (tx,ty) by up to `dist`,
 *  clamped at the waypoint. Returns the new position and the distance moved —
 *  the pure core of the engine's knockback, extracted so the shove is testable. */
export function knockbackStep(x: number, y: number, tx: number, ty: number, dist: number): { x: number; y: number; moved: number } {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d < 1 || dist <= 0) return { x, y, moved: 0 };
  const step = Math.min(dist, d);
  return { x: x + (dx / d) * step, y: y + (dy / d) * step, moved: step };
}
```

- [ ] **Step 4: Re-wire the engine**

Import `tzhaarStun` (magic import list, line 16) and `knockbackStep` (geometry import). Replace the body of `knockback()` (~2810):

```ts
  private knockback(e: Enemy, dist: number): number {
    const prev = this.path[e.pathIndex];
    if (!prev) return 0;
    const r = knockbackStep(e.x, e.y, prev.x, prev.y, dist);
    e.x = r.x;
    e.y = r.y;
    return r.moved;
  }
```

`'pushback'` case (~2760) — add the TzHaar stun + shove FX after the existing `recordEffect`:

```ts
      case 'pushback': {
        const src = p.sourceTowerId ? this.towers.find(t => t.id === p.sourceTowerId) : undefined;
        const dist = (src?.type === 'tzhaar' ? tzhaarKnockback(src.level) : AIR_KNOCKBACK) * (1 - this.tenacity(e));
        const moved = this.knockback(e, dist);
        this.noteDebuffHit(e);
        if (moved > 0) this.stats.recordEffect(fx, this.wave, { pushCount: 1, pushTiles: moved / GRID });
        // TzHaar always stuns on hit now (0.3s/0.45s at the dagger tiers) so the
        // shove reads as a real setback instead of an instant walk-back.
        if (src?.type === 'tzhaar') {
          if (moved > 0) this.addRing(e.x, e.y, 3, 16, '#ffb066', 0.28, 2);
          const eff = tzhaarStun(src.level) * (1 - this.tenacity(e));
          if (eff > 0) {
            e.stunTimer = Math.max(e.stunTimer, eff);
            this.stats.recordEffect(fx, this.wave, { stunCount: 1, stunSeconds: eff });
          }
        }
        break;
      }
```

`'crush'` case (~2770) — use the table + the same FX (replace the hardcoded `0.6`):

```ts
      case 'crush': {
        const src = p.sourceTowerId ? this.towers.find(t => t.id === p.sourceTowerId) : undefined;
        const moved = this.knockback(e, tzhaarKnockback(src?.level ?? 3) * (1 - this.tenacity(e)));
        if (moved > 0) this.addRing(e.x, e.y, 3, 16, '#ffb066', 0.28, 2);
        const eff = tzhaarStun(src?.level ?? 3) * (1 - this.tenacity(e));
        this.noteDebuffHit(e);
        if (eff > 0) e.stunTimer = Math.max(e.stunTimer, eff);
        this.stats.recordEffect(fx, this.wave, {
          ...(moved > 0 ? { pushCount: 1, pushTiles: moved / GRID } : {}),
          ...(eff > 0 ? { stunCount: 1, stunSeconds: eff } : {}),
        });
        break;
      }
```

- [ ] **Step 5: Cost cut in `towers.ts`**

TzHaar tier 1 (line ~96): `upgradeCost: 150` → `upgradeCost: 125` (tier-0's `upgradeCost` doubles as the build cost). Update the tzhaar block comment to mention that every tier now also stuns.

- [ ] **Step 6: Verify**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: green + silent.

- [ ] **Step 7: Commit**

```bash
git add lib/game/systems/magic.ts lib/game/systems/magic.test.ts lib/game/systems/geometry.ts lib/game/systems/geometry.test.ts lib/game/core/engine.ts lib/game/data/towers.ts
git commit -F <scratch-msg-file>   # "balance(tzhaar): stun from L1, knockback extracted+tested, shove FX, cost 125"
```

---

### Task 5: Combat-SFX fade-out on wave end

**Files:**
- Modify: `lib/game/core/sound.ts`
- Create: `lib/game/core/sound.test.ts`
- Modify: `lib/game/core/engine.ts` (3 hooks)

**Interfaces:**
- Consumes: `SoundManager.pools` (private node ring), `checkWaveEnd()` (~3141, right after `this.waveActive = false;`), the game-over path (grep `play('game_over')`, `waveActive = false` beside it), `startWave()` (grep `this.sound.play('wave')` at ~1667).
- Produces: `soundCategory(key: string): 'combat' | 'ui'` (exported, pure); `SoundManager.fadeCombat(secs = 0.6): void`; `SoundManager.setCombatSuppressed(on: boolean): void`.

- [ ] **Step 1: Write the failing test**

`lib/game/core/sound.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { soundCategory } from './sound';

describe('soundCategory', () => {
  it('classifies firing, casting, impacts and deaths as combat', () => {
    for (const k of ['fire_archer', 'fire_tzhaar', 'cast_fire_3', 'cast_ice_4', 'hit_water_2', 'hit', 'death', 'death_goblin', 'base_hit']) {
      expect(soundCategory(k)).toBe('combat');
    }
  });
  it('classifies interface/meta sounds as ui', () => {
    for (const k of ['click', 'select', 'interface_open', 'interface_close', 'wave', 'sell', 'fireworks', 'game_over', 'prayer_on', 'prayer_on_piety', 'ge_offer']) {
      expect(soundCategory(k)).toBe('ui');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/game/core/sound.test.ts`
Expected: FAIL (`soundCategory` not exported).

- [ ] **Step 3: Implement in `sound.ts`**

Above the `SoundManager` class:

```ts
/** Sound categories: `combat` rings out with the fight (and is faded/suppressed
 *  between waves); `ui` (interface, prayers, GE, jingles) always plays. */
export type SoundCategory = 'combat' | 'ui';
export function soundCategory(key: string): SoundCategory {
  if (/^(fire_|cast_|hit_|death_)/.test(key)) return 'combat';
  return key === 'hit' || key === 'death' || key === 'base_hit' ? 'combat' : 'ui';
}
```

Inside `SoundManager` add the field + methods:

```ts
  /** While set, combat-category plays are dropped (between waves — stragglers
   *  landing after the clear stay silent). UI sounds are unaffected. */
  private combatSuppressed = false;

  setCombatSuppressed(on: boolean) {
    this.combatSuppressed = on;
  }

  /** Fade every currently-ringing combat clip to silence over `secs`, then stop
   *  it and restore the node's volume for future plays. Also suppresses new
   *  combat plays until {@link setCombatSuppressed}(false). */
  fadeCombat(secs = 0.6) {
    this.combatSuppressed = true;
    if (typeof requestAnimationFrame === 'undefined') return; // SSR guard
    for (const [key, pool] of this.pools) {
      if (soundCategory(key) !== 'combat') continue;
      for (const node of pool) {
        if (node.paused || node.ended) continue;
        const startVol = node.volume;
        const t0 = performance.now();
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
          node.volume = startVol * (1 - k);
          if (k < 1 && !node.paused) requestAnimationFrame(step);
          else {
            try { node.pause(); } catch { /* ignore */ }
            node.volume = this.gain();
          }
        };
        requestAnimationFrame(step);
      }
    }
  }
```

In `play()`, right after the `muted` check: `if (this.combatSuppressed && soundCategory(key) === 'combat') return;`

- [ ] **Step 4: Engine hooks**

- `checkWaveEnd()` — immediately after `this.waveActive = false;` (line ~3144): `this.sound.fadeCombat();` (before the sandbox early-return, so sandbox clears fade too).
- Game-over path — grep `play('game_over')`; immediately before it: `this.sound.fadeCombat();`
- `startWave()` — before its `this.sound.play('wave')`: `this.sound.setCombatSuppressed(false);` (also covers run restarts, which go through startWave).

- [ ] **Step 5: Verify**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: green + silent. Manual check is the user's playtest (big wave clear → sounds fade in ~0.6s).

- [ ] **Step 6: Commit**

```bash
git add lib/game/core/sound.ts lib/game/core/sound.test.ts lib/game/core/engine.ts
git commit -F <scratch-msg-file>   # "fix(audio): fade combat SFX at wave end, suppress stragglers between waves"
```

---

### Task 6: Blood life-steal visual indicator

**Files:**
- Modify: `lib/game/core/engine.ts` (`tryLifesteal` ~2801, `UIState` interface ~300, the `emit()` payload ~816)
- Modify: `components/game/GameRoot.tsx` (INITIAL_UI, lives orb, pop element)
- Modify: `app/globals.css` (keyframes)

**Interfaces:**
- Consumes: `tryLifesteal(sourceTowerId?)`, `addRing(x, y, r0, r1, color, life, width)`, the Lives `<Orb>` in the top-right HUD cluster (`data-tut="hud"`, ~1305), `INITIAL_UI` const (~157).
- Produces: `UIState.lifestealSeq: number` (monotonic counter; bumps once per life stolen).

- [ ] **Step 1: Engine — count + FX**

Add a private field near the autoplay fields (~585): `private lifestealSeq = 0;`
Rewrite `tryLifesteal`:

```ts
  /** Blood barrage lifesteal: a level-scaled chance to restore one life. On a
   *  success, ring the casting tower red and bump `lifestealSeq` so the UI can
   *  celebrate it (lives-orb blip + floating heart). */
  private tryLifesteal(sourceTowerId?: string) {
    if (this.lives >= this.maxLives) return;
    const tower = sourceTowerId ? this.towers.find(t => t.id === sourceTowerId) : null;
    if (Math.random() >= lifestealChance(tower?.level ?? 1)) return;
    this.lives += 1;
    this.lifestealSeq += 1;
    if (tower) this.addRing(tower.x, tower.y, 4, 26, '#c81e1e', 0.5, 3);
    this.emit();
  }
```

In the `UIState` interface (near `autoplay: boolean;` ~303) add:

```ts
  /** Bumps once per Blood-barrage life steal — the UI keys its ❤ pop off it. */
  lifestealSeq: number;
```

In the emit payload (near `autoplay: this.autoplay,` ~816): `lifestealSeq: this.lifestealSeq,`

- [ ] **Step 2: GameRoot — orb blip + floating heart**

In `INITIAL_UI` (~157) add `lifestealSeq: 0,`.
Wrap the Lives `<Orb>` (first orb in the `data-tut="hud"` cluster, ~1306) in a relative wrapper that replays a pop on each steal:

```tsx
        <div className="relative">
          <div key={ui.lifestealSeq} className={ui.lifestealSeq > 0 ? 'rs-orb-blip' : undefined}>
            <Orb
              icon={ASSETS.misc.orb_hitpoints}
              title="Lives"
              value={ui.lives}
              /* …existing props unchanged… */
            />
          </div>
          {ui.lifestealSeq > 0 && (
            <span key={`h${ui.lifestealSeq}`} className="rs-lifesteal-pop" aria-hidden>
              ❤ +1
            </span>
          )}
        </div>
```

(`key={ui.lifestealSeq}` remounts the node each steal, so the CSS animation replays; seq 0 renders nothing.)

- [ ] **Step 3: globals.css keyframes**

```css
/* Blood-barrage life steal: the lives orb blips and a heart floats off it. */
.rs-orb-blip { animation: rs-orb-blip 0.5s ease-out; }
@keyframes rs-orb-blip {
  0% { filter: drop-shadow(0 0 0 rgba(200, 30, 30, 0)); transform: scale(1); }
  30% { filter: drop-shadow(0 0 8px rgba(200, 30, 30, 0.9)); transform: scale(1.12); }
  100% { filter: drop-shadow(0 0 0 rgba(200, 30, 30, 0)); transform: scale(1); }
}
.rs-lifesteal-pop {
  position: absolute;
  right: 100%;
  top: 50%;
  margin-right: 0.4em;
  color: #ff6b6b;
  font-weight: bold;
  white-space: nowrap;
  pointer-events: none;
  animation: rs-lifesteal-pop 1.1s ease-out forwards;
}
@keyframes rs-lifesteal-pop {
  0% { opacity: 0; transform: translateY(0); }
  15% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-1.4em); }
}
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all green.

```bash
git add lib/game/core/engine.ts components/game/GameRoot.tsx app/globals.css
git commit -F <scratch-msg-file>   # "feat(blood): visual life-steal indicator (tower ring + lives-orb heart pop)"
```

---

### Task 7: Docked, collapsible sidebar

**Files:**
- Modify: `components/game/GameRoot.tsx` (root layout ~937-949; shop panel ~1662-2040; `onSideTab` ~438; `sideBodyMin` ~416-421; `dpsVisible` ~420)

**Interfaces:**
- Consumes: root `return (<div className="relative w-full h-full …">` (~938); the shop `MovablePanel` block (`id="shop"`, ~1662); `engine.resize()` (public, re-measures the canvas).
- Produces: state `sideCollapsed: boolean` persisted as `ui_side_collapsed`; the shop content rendered inside an `<aside>`; `sideBodyMin` **deleted** (and its `ui_min_sidebody` reads).

- [ ] **Step 1: Restructure the root**

Change the outermost return to a flex row and wrap ALL current children (canvas + every floating overlay) in a game-area div — the overlays keep anchoring to the map, not the page:

```tsx
  return (
    <div className="w-full h-full flex overflow-hidden bg-black select-none font-osrs">
      <div className="relative flex-1 min-w-0 h-full overflow-hidden">
        {/* …EVERYTHING currently inside the old root moves here unchanged,
            EXCEPT the shop MovablePanel (Step 2)… */}
      </div>
      {/* aside from Step 2 */}
    </div>
  );
```

- [ ] **Step 2: The aside**

State (replace the `sideBodyMin` pair at ~416):

```tsx
  // Docked sidebar collapse: collapsed = a thin rail of tab stones (map grows).
  const [sideCollapsed, setSideCollapsed] = useState(() =>
    (typeof window !== 'undefined' && window.innerWidth < 900) || loadBool('ui_side_collapsed', false));
  useEffect(() => { try { localStorage.setItem('ui_side_collapsed', JSON.stringify(sideCollapsed)); } catch { /* ignore */ } }, [sideCollapsed]);
  // The canvas element resizes when the aside collapses/expands — re-measure.
  useEffect(() => { engineRef.current?.resize(); }, [sideCollapsed]);
```

`onSideTab` becomes:

```tsx
  const onSideTab = useCallback((t: SideTab) => {
    if (sideCollapsed) { setSideCollapsed(false); setTab(t); return; } // rail → expand into the tab
    if (tab === t) { setSideCollapsed(true); return; } // active stone → collapse (old minimise gesture)
    setTab(t);
  }, [tab, sideCollapsed]);
```

`dpsVisible` (~420): `const dpsVisible = tab === 'dps' && !sideCollapsed;`

The aside (sibling of the game-area div). Cut the whole shop `MovablePanel` block and re-home its children:

```tsx
      <aside
        data-tut="sidebar"
        className="relative shrink-0 h-full rs-panel flex flex-col"
        style={sideCollapsed
          ? { width: '3.4em', fontSize: fs('clamp(14px, 0.9vw, 19px)') }
          : { width: 'clamp(300px, 22vw, 400px)', fontSize: fs('clamp(14px, 0.9vw, 19px)') }}
      >
        <button
          onClick={() => setSideCollapsed((c) => !c)}
          title={sideCollapsed ? 'Expand menu' : 'Collapse menu'}
          className="rs-btn absolute top-1/2 -left-[0.9em] -translate-y-1/2 z-20 px-[0.15em] py-[0.7em] text-[0.8em]"
        >
          {sideCollapsed ? '◀' : '▶'}
        </button>
        {sideCollapsed ? (
          /* Rail: the same tab stones, stacked vertically; a click expands into
             that tab. Each stone is the strip's existing <button> verbatim
             (same icon/badge/title/onClick), e.g. the Home stone: */
          <div className="flex flex-col items-center gap-[0.4em] pt-[0.6em]">
            <button onClick={() => onSideTab('home')} title="Towers &amp; Wave" className="rs-tab">
              <img src={ASSETS.misc.multicombat_icon} alt="Towers &amp; Wave" onError={hideBrokenImg} />
            </button>
            {/* …repeat verbatim for the remaining stones: essence (data-tut +
                badge), slayer (badge), Collection Log, dps (stats_icon), debug 🛠,
                help ❓, feedback 💬 (FEEDBACK_ENABLED-gated) — copied from the
                existing strip, minus their `rs-tab-on` active-state term. */}
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 p-3">
            {/* the MovablePanel's current children move here VERBATIM:
                order-2 tab strip · order-1 tab body · order-3 Start Wave slot ·
                order-4 tower dock — keep classes and order-* exactly as they are */}
          </div>
        )}
      </aside>
```

Notes: keep the `data-tut="sidebar"` anchor (it was on the strip; the aside now carries it — the strip's own `data-tut` moves up). Every `!sideBodyMin` condition inside the moved children is deleted (the expanded aside always shows the body); `rs-tab-on` conditions drop their `!sideBodyMin` term. The `MovablePanel` import stays (other panels use it).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean. Playtest note for the user: map is never covered; ◀/▶ collapses; stones expand.

- [ ] **Step 4: Commit**

```bash
git add components/game/GameRoot.tsx
git commit -F <scratch-msg-file>   # "feat(ui): dock the main menu as a collapsible right sidebar (map never covered)"
```

---

### Task 8: Top HUD — wave progress + always-visible next-wave preview

**Files:**
- Modify: `components/game/GameRoot.tsx` (top-centre cluster ~1284-1302; home-tab wave block ~1749-1774; start-wave hover preview ~1934-1963)

**Interfaces:**
- Consumes: `ui.waveActive, ui.wave, ui.remaining, ui.waveTotal, ui.bossWave, ui.wavePreview, ui.bossOnField, ui.gameOver`, `runStarted`, `enemySpriteStyle(type)` (already defined in GameRoot), `WaveEventChip`, `activeInfoboxes`.
- Produces: one top-centre flex-col wrapper holding (1) the new wave strip and (2) the existing event-chip/infobox row beneath it.

- [ ] **Step 1: Build the strip inside the existing top-centre wrapper**

Replace the block at ~1288-1302 with a flex-col that always renders while the run is live:

```tsx
      {runStarted && !ui.gameOver && (
        <div
          data-tut="waveevent"
          className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-[0.35em] transition-[top] duration-300"
          style={{ top: ui.bossOnField ? '4.5rem' : '0.5rem', fontSize: fs('clamp(13px, 0.85vw, 18px)') }}
        >
          {/* Wave strip: progress while fighting, next-wave preview while prepping. */}
          <div className="rs-panel px-[0.7em] py-[0.35em] pointer-events-none min-w-[16em] max-w-[46em]">
            {ui.waveActive ? (
              <>
                <div className="flex items-center justify-between gap-[1em] text-[0.8em] text-osrs-orange mb-[0.2em]">
                  <span>⚔ Wave {ui.wave}{ui.bossWave ? ' — BOSS' : ''}</span>
                  <span className="text-[#cdbe91]">{ui.remaining} left</span>
                </div>
                <div className="rs-progress">
                  <div
                    className={`rs-progress-fill ${ui.bossWave ? 'rs-progress-fill-boss' : ''}`}
                    style={{ width: `${ui.waveTotal ? Math.round(((ui.waveTotal - ui.remaining) / ui.waveTotal) * 100) : 0}%` }}
                  />
                </div>
              </>
            ) : ui.wavePreview.length > 0 && (
              <>
                <div className="text-center text-[0.62em] text-[#d3c3a0] uppercase tracking-wide mb-[0.25em]">
                  Next: Wave {ui.wave} · {ui.wavePreview.reduce((s, m) => s + m.count, 0)} incoming
                </div>
                <div className="flex items-center justify-center gap-[0.7em] flex-wrap">
                  {ui.wavePreview.map((m) => {
                    const style = enemySpriteStyle(m.type);
                    return (
                      <span key={m.type} className="flex items-center gap-[0.3em]" title={m.name}>
                        <span className="inline-block w-[1.5em] h-[1.5em] shrink-0" style={style ? { ...style, imageRendering: 'pixelated' } : undefined} />
                        <span className={`text-[0.7em] ${m.isBoss ? 'text-osrs-red font-bold uppercase tracking-wide' : 'text-[#e8dcc0]'}`}>
                          {m.isBoss ? `⚠ ${m.name}` : `×${m.count}`}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {/* Event chip + potion infoboxes (existing row, now BELOW the strip). */}
          {((ui.waveActive && ui.activeEvent) || activeInfoboxes.length > 0) && (
            <div className="flex items-start gap-[0.4em]">
              {ui.waveActive && ui.activeEvent && <WaveEventChip event={ui.activeEvent} />}
              {activeInfoboxes.map((o) => (
                /* …existing infobox JSX unchanged… */
              ))}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 2: Remove the superseded copies**

- Home tab (~1749-1763): delete the during-wave progress `<div className="mb-[0.6em]">…</div>` but KEEP the `WaveEventBanner` — re-anchor it as `{ui.waveActive && ui.activeEvent && <WaveEventBanner event={ui.activeEvent} />}` in the same spot; keep the between-waves "Mode:" badge.
- Start Wave button (~1934-1963): delete the hover-preview `rs-panel` block (the button keeps `data-tut="startwave"`); drop the now-unneeded `relative group` wrapper.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run build`

```bash
git add components/game/GameRoot.tsx
git commit -F <scratch-msg-file>   # "feat(hud): wave progress + always-visible next-wave preview at top-centre"
```

---

### Task 9: Styled tooltips on the top Boons/Hazards chip + infoboxes

**Files:**
- Modify: `components/game/GameRoot.tsx` (`WaveEventChip` ~3755; the infobox JSX inside the Task-8 cluster)

**Interfaces:**
- Consumes: `event.name / event.tone / event.desc / event.color`, infobox `o.name / o.desc / o.activeSecs`.
- Produces: hover tooltips (styled `rs-panel`, no native `title`).

- [ ] **Step 1: WaveEventChip tooltip**

Remove the chip's `title` attr; make the chip a `relative group` and append inside it:

```tsx
      <span className="rs-panel absolute top-full left-1/2 -translate-x-1/2 mt-[0.4em] p-[0.5em] w-[17em] hidden group-hover:block z-40 pointer-events-none text-left">
        <span className="flex items-center gap-[0.4em] leading-none">
          <span className="text-[0.85em] font-bold" style={{ color: event.color }}>{event.name}</span>
          <span className="text-[0.58em] uppercase tracking-wide px-[0.35em] py-[0.05em] rounded-sm" style={{ background: `${event.color}22`, color: event.color }}>
            {boon ? 'Boon' : 'Hazard'}
          </span>
        </span>
        <span className="block text-[0.68em] text-[#cdbe91] mt-[0.25em] leading-tight">{event.desc}</span>
      </span>
```

- [ ] **Step 2: Infobox tooltips**

The infoboxes (Task 8 cluster) currently carry `title={…}` and `pointer-events-none`. Change each to `pointer-events-auto relative group`, remove `title`, and append the same tooltip pattern with `{o.name}` / `{o.desc}` / `{o.activeSecs}s left` as the content lines.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npm run build`

```bash
git add components/game/GameRoot.tsx
git commit -F <scratch-msg-file>   # "fix(ui): styled hover tooltips on the top event chip + potion infoboxes"
```

---

### Task 10: Slayer block → Slayer tab; Auto-start → main menu

**Files:**
- Modify: `components/game/GameRoot.tsx` (home-tab slayer block ~1721-1747; slayer tab ~1863; Start Wave slot ~1921-1966; engine-init effect ~493)
- Modify: `components/game/DebugPanel.tsx` (~260-272)

**Interfaces:**
- Consumes: `ui.slayerTask / ui.slayerMaster / ui.slayerPoints / ui.slayerHelmet`, `engine.setAutoplay(on)`, `ui.autoplay`, `loadBool`.
- Produces: localStorage key `ui_autostart`; DebugPanel keeps only the Delay row.

- [ ] **Step 1: Move the slayer block**

Cut the whole `{ui.slayerTask && (…)}` block from the Home tab (~1721-1747) and paste it as the FIRST child inside the Slayer tab's fragment (`{tab === 'slayer' && (<> …`), above the rewards content. No content changes — pure relocation.

- [ ] **Step 2: Auto-start toggle under Start Wave**

Inside the Start Wave slot (after the `<button data-tut="startwave">…</button>`):

```tsx
            <label
              className="mt-[0.35em] flex items-center justify-center gap-[0.35em] text-[0.72em] text-[#cdbe91] cursor-pointer select-none"
              title="Automatically start the next wave once the field is clear (waits on a pending draft)"
            >
              <input
                type="checkbox"
                checked={ui.autoplay}
                onChange={(e) => {
                  engineRef.current?.setAutoplay(e.target.checked);
                  try { localStorage.setItem('ui_autostart', JSON.stringify(e.target.checked)); } catch { /* ignore */ }
                }}
              />
              Auto-start next wave
            </label>
```

Seed it in the engine-init effect (~493, right after `new GameEngine(…)`): `engine.setAutoplay(loadBool('ui_autostart', false));`

- [ ] **Step 3: Prune DebugPanel**

Remove the "Autoplay waves" On/Off row (~261-269). Keep the `Delay (s)` NumberRow; change the note to: `Auto-start lives in the main menu now — this sets its delay between waves.`

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit && npm run build`

```bash
git add components/game/GameRoot.tsx components/game/DebugPanel.tsx
git commit -F <scratch-msg-file>   # "feat(ui): slayer task in the Slayer tab; auto-start toggle in the main menu"
```

---

### Task 11: Tutorial-mirror copy + final verification

**Files:**
- Modify: `components/game/GameRoot.tsx` (`LEARN_STEPS` ~2657; `TLDR` ~2778)

**Interfaces:**
- Consumes: everything shipped in Tasks 7-10.
- Produces: tips/How-to copy that matches the new UI (mirror rule: LEARN_STEPS and TLDR must describe the same, current systems).

- [ ] **Step 1: Audit + update the copy**

Grep `LEARN_STEPS` and `TLDR` for strings referencing moved UI — search terms: `hover`, `preview`, `progress`, `Start Wave`, `Slayer`, `panel`, `menu`. Update every stale sentence:
- the 'start' step (target `startwave`): mention the wave bar + next-wave icons now live at the top of the screen;
- any Slayer tip: the task now shows in the Slayer tab;
- any mention of the shop "window/panel": it is now the right sidebar (collapsible with ◀/▶).
Verify each `data-tut` target still resolves: `map`, `hud`, `waveevent`, `sidebar`, `essence`, `slayer`, `startwave`, `dock`, `controls`, `prayers`, `help` (grep `data-tut=` and cross-check against `LEARN_STEPS` targets).

- [ ] **Step 2: Full verify**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all green (test count grows past 286).

- [ ] **Step 3: Commit**

```bash
git add components/game/GameRoot.tsx
git commit -F <scratch-msg-file>   # "docs(tips): update learn-tips + How-to for the sidebar/top-HUD layout"
```

---

## Post-plan notes

- **User playtest checklist** (their job, offer after the last commit): wave-clear audio fades; sidebar collapse/expand + map never covered; top strip during/between waves; event chip tooltip; slayer task in its tab; auto-start toggle; Blood damage feel + ❤ pop; TzHaar shove+stun feel; no Regen before wave 12; no double-affix before wave 30.
- **Deploy** stays a separate, explicit ask (`git push origin wip:main`) — never part of a task.
- Deferred to P3 (recorded in the spec): moving Blood's life-steal to another tower.

# Cards & economy with meaning in the late game (A2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the roguelite gold↔cards loop meaningful late by smoothly re-weighting the draft pool toward cards that escape the damage soft-cap, and mirror that soft-cap onto the fireRate and range run modifiers so the late game can't just relocate the runaway.

**Architecture:** Two pure, unit-tested additions in `lib/game/systems/` plus their thin wiring. (1) A category-derived classifier (`lateAffinity`) and a per-card wave multiplier (`lateWeightMult`) fold into `rollDraft`'s per-card selection weight; the engine passes the current wave. (2) `softCapMult` (already parameterised by ceiling) wraps the raw range/fireRate run-mod lines in `tower-combat.ts`, with two new ceiling constants. No `UIState` change, no new engine state, no draft-UI change — only the odds and two combat multipliers move.

**Tech Stack:** TypeScript, Vitest (pure-logic unit tests next to each module). Static Next.js export.

**Design spec:** `docs/superpowers/specs/2026-07-25-cards-economy-late-game-design.md`

## Global Constraints

- **Balance numbers are tunable knobs, not final values.** The spec fixes only the *shape*; these initial values are the plan's concrete starting point (the user retunes in one place each): `RAMP_START = 20`, `RAMP_FULL = 60`, `FADE_FLOOR = 0.25`, `RISE_CEIL = 3`, `FIRE_RATE_MULT_CEILING = 3.5`, `RANGE_MULT_CEILING = 2.5`.
- **Pre-late game must stay identical.** Below `RAMP_START` every late multiplier is exactly 1; `rollDraft`'s new `wave` parameter defaults to `0` so every existing caller and test rolls today's distribution unchanged.
- **Only card-stacked run mods are capped.** The range/fireRate soft-cap applies solely to `ctx.runMods.range`/`ctx.runMods.fireRate` — mageBuff, wave-event `globalMods`, potions, equipment and tier stats stay raw, mirroring the existing damage-cap policy.
- **No new cards, no new card tier, no foil state, no roll-cost/gold-income change.** A2 is a re-organisation of the existing pool plus two soft-caps.
- Pure logic lives in `lib/game/systems/` with a matching `*.test.ts`. In-game strings stay English. Gate = `npx tsc --noEmit` + `npx vitest run` + `npm run build`.
- Commit style is conventional-commit; badge follows the changelog convention. These are player-perceivable balance changes → type `balance` (badge **Balanced**).

---

### Task 1: Soft-cap fireRate and range run modifiers

**Files:**
- Modify: `lib/game/systems/run-modifiers.ts` (add two ceiling constants)
- Modify: `lib/game/systems/tower-combat.ts:211-213` (wrap the two raw lines)
- Test: `lib/game/systems/run-modifiers.test.ts` (new-ceiling cases)

**Interfaces:**
- Consumes: existing `softCapMult(raw, ceiling = DAMAGE_MULT_CEILING)` from `run-modifiers.ts`.
- Produces: exported constants `FIRE_RATE_MULT_CEILING` and `RANGE_MULT_CEILING` (numbers).

- [ ] **Step 1: Write the failing test**

Add to `lib/game/systems/run-modifiers.test.ts` (extend its imports to include the two new constants):

```ts
import { softCapMult, DAMAGE_MULT_CEILING, FIRE_RATE_MULT_CEILING, RANGE_MULT_CEILING } from './run-modifiers';

describe('softCapMult with the range/fireRate ceilings', () => {
  it('exposes distinct, sensible ceilings below the damage ceiling', () => {
    expect(FIRE_RATE_MULT_CEILING).toBeGreaterThan(1);
    expect(RANGE_MULT_CEILING).toBeGreaterThan(1);
    // both are tighter than the damage cap (these stats are more game-changing)
    expect(FIRE_RATE_MULT_CEILING).toBeLessThan(DAMAGE_MULT_CEILING);
    expect(RANGE_MULT_CEILING).toBeLessThan(DAMAGE_MULT_CEILING);
  });

  it('leaves raw <= 1 untouched for either ceiling', () => {
    expect(softCapMult(1, FIRE_RATE_MULT_CEILING)).toBe(1);
    expect(softCapMult(0.8, RANGE_MULT_CEILING)).toBe(0.8);
  });

  it('approaches but never reaches each ceiling', () => {
    expect(softCapMult(50, FIRE_RATE_MULT_CEILING)).toBeLessThan(FIRE_RATE_MULT_CEILING);
    expect(softCapMult(50, RANGE_MULT_CEILING)).toBeLessThan(RANGE_MULT_CEILING);
    // and gets close for a big raw stack
    expect(softCapMult(50, FIRE_RATE_MULT_CEILING)).toBeGreaterThan(FIRE_RATE_MULT_CEILING - 0.05);
  });

  it('gives an early single card nearly full value (slope ~1 at raw=1)', () => {
    // a +4% fireRate card lands within a whisker of raw
    expect(softCapMult(1.04, FIRE_RATE_MULT_CEILING)).toBeGreaterThan(1.039);
    expect(softCapMult(1.04, FIRE_RATE_MULT_CEILING)).toBeLessThanOrEqual(1.04);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/run-modifiers.test.ts`
Expected: FAIL — `FIRE_RATE_MULT_CEILING`/`RANGE_MULT_CEILING` are not exported (import error / undefined).

- [ ] **Step 3: Add the two ceiling constants**

In `lib/game/systems/run-modifiers.ts`, after the `DAMAGE_MULT_CEILING` declaration, add:

```ts
/**
 * Ceilings for the stacked card **fire-rate** and **range** multipliers, mirroring
 * {@link DAMAGE_MULT_CEILING}. Tighter than the damage cap: attack-speed and range
 * reshape coverage and DPS harder than flat damage, so their runaway is capped
 * sooner. Same concave curve ({@link softCapMult}); tuning knobs, retune here.
 */
export const FIRE_RATE_MULT_CEILING = 3.5;
export const RANGE_MULT_CEILING = 2.5;
```

- [ ] **Step 4: Wrap the raw combat lines**

In `lib/game/systems/tower-combat.ts`, import the constants (extend the existing `run-modifiers` import) and replace lines 211-213. Current:

```ts
    damageMultiplier *= softCapMult(ctx.runMods.damage[s]);
    rangeMultiplier *= ctx.runMods.range[s];
    speedMultiplier *= ctx.runMods.fireRate[s];
```

becomes:

```ts
    damageMultiplier *= softCapMult(ctx.runMods.damage[s]);
    rangeMultiplier *= softCapMult(ctx.runMods.range[s], RANGE_MULT_CEILING);
    speedMultiplier *= softCapMult(ctx.runMods.fireRate[s], FIRE_RATE_MULT_CEILING);
```

Also update the comment above (currently "Range/fireRate stay raw.") to say all three now fold through the concave ceiling.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/run-modifiers.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (confirms the `tower-combat.ts` import resolves).

- [ ] **Step 7: Commit**

```bash
git add lib/game/systems/run-modifiers.ts lib/game/systems/run-modifiers.test.ts lib/game/systems/tower-combat.ts
git commit -m "balance: soft-cap stacked fireRate and range like damage"
```

---

### Task 2: The late-affinity classifier and re-weight function

**Files:**
- Modify: `lib/game/systems/roguelite-draft.ts` (add pure `lateAffinity` + `lateWeightMult` and the four tuning constants; no wiring yet)
- Test: `lib/game/systems/roguelite-draft.test.ts` (classifier + multiplier cases)

**Interfaces:**
- Consumes: `DraftEffect`, `DraftCard`, `RARITY_WEIGHT` (existing, same file).
- Produces:
  - `lateAffinity(effect: DraftEffect): 'fade' | 'rise' | 'neutral'`
  - `lateWeightMult(card: DraftCard, wave: number): number`
  - exported constants `RAMP_START`, `RAMP_FULL`, `FADE_FLOOR`, `RISE_CEIL`.

- [ ] **Step 1: Write the failing test**

Add to `lib/game/systems/roguelite-draft.test.ts` (extend imports with the new symbols and the existing `DRAFT_POOL`):

```ts
import {
  lateAffinity,
  lateWeightMult,
  RAMP_START,
  RAMP_FULL,
  FADE_FLOOR,
  RISE_CEIL,
} from './roguelite-draft';

const card = (kind: DraftCard['effect']['kind'], rarity: DraftCard['rarity'] = 'common'): DraftCard =>
  ({ id: `t_${kind}`, name: kind, desc: '', rarity, icon: '', effect: { kind } as DraftCard['effect'] });

describe('lateAffinity', () => {
  it('fades the capped/late-dead kinds', () => {
    for (const k of ['damage', 'essence', 'slayerPoints'] as const)
      expect(lateAffinity({ kind: k } as DraftCard['effect'])).toBe('fade');
  });
  it('rises range/fireRate and every behavioural/synergy/mage kind', () => {
    for (const k of ['range', 'fireRate', 'ricochet', 'overkill', 'killStreak',
      'lastStand', 'berserker', 'bloodPact', 'greed', 'doubleShot', 'venomTips',
      'chainFreeze', 'pierce', 'packTactics', 'trinity', 'vanguard', 'loneWolf',
      'mageBuff'] as const)
      expect(lateAffinity({ kind: k } as DraftCard['effect'])).toBe('rise');
  });
  it('keeps life/maxLife/multi neutral', () => {
    for (const k of ['life', 'maxLife', 'multi'] as const)
      expect(lateAffinity({ kind: k } as DraftCard['effect'])).toBe('neutral');
  });
  it('classifies every effect kind present in the pool', () => {
    // exhaustiveness in practice: no pool card throws / returns undefined
    for (const c of DRAFT_POOL)
      expect(['fade', 'rise', 'neutral']).toContain(lateAffinity(c.effect));
  });
});

describe('lateWeightMult', () => {
  it('is exactly 1 for every affinity at and below RAMP_START', () => {
    expect(lateWeightMult(card('damage'), RAMP_START)).toBe(1);
    expect(lateWeightMult(card('fireRate'), RAMP_START - 5)).toBe(1);
    expect(lateWeightMult(card('life'), 0)).toBe(1);
  });
  it('slides fade down toward the floor, never reaching zero', () => {
    const mid = lateWeightMult(card('damage'), (RAMP_START + RAMP_FULL) / 2);
    const full = lateWeightMult(card('damage'), RAMP_FULL);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(full);
    expect(full).toBeGreaterThan(0);
    expect(full).toBeCloseTo(FADE_FLOOR, 5);
  });
  it('slides rise up toward the ceiling', () => {
    const mid = lateWeightMult(card('fireRate'), (RAMP_START + RAMP_FULL) / 2);
    const full = lateWeightMult(card('range'), RAMP_FULL);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(full);
    expect(full).toBeCloseTo(RISE_CEIL, 5);
  });
  it('clamps past RAMP_FULL (no overshoot beyond floor/ceiling)', () => {
    expect(lateWeightMult(card('damage'), RAMP_FULL + 999)).toBeCloseTo(FADE_FLOOR, 5);
    expect(lateWeightMult(card('range'), RAMP_FULL + 999)).toBeCloseTo(RISE_CEIL, 5);
  });
  it('holds neutral at exactly 1 at every wave', () => {
    for (const w of [0, RAMP_START, (RAMP_START + RAMP_FULL) / 2, RAMP_FULL, RAMP_FULL + 50])
      expect(lateWeightMult(card('multi'), w)).toBe(1);
  });
  it('is monotone in wave for fade (down) and rise (up)', () => {
    let prevFade = Infinity, prevRise = -Infinity;
    for (let w = RAMP_START; w <= RAMP_FULL; w += 5) {
      const f = lateWeightMult(card('essence'), w);
      const r = lateWeightMult(card('overkill'), w);
      expect(f).toBeLessThanOrEqual(prevFade);
      expect(r).toBeGreaterThanOrEqual(prevRise);
      prevFade = f; prevRise = r;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/roguelite-draft.test.ts`
Expected: FAIL — `lateAffinity`/`lateWeightMult`/constants not exported.

- [ ] **Step 3: Implement the classifier and re-weight function**

In `lib/game/systems/roguelite-draft.ts`, after the `RARITY_WEIGHT`/`BOOSTED_RARITY_WEIGHT` block (they belong with the other draft-odds logic), add:

```ts
/**
 * Late-game re-weighting knobs. Below {@link RAMP_START} the draft is exactly
 * today's; between RAMP_START and {@link RAMP_FULL} the pool smoothly shifts its
 * character; past RAMP_FULL it holds. Tuning constants — retune here, in one place.
 */
export const RAMP_START = 20;
export const RAMP_FULL = 60;
/** A faded kind's weight floor (never zero — a damage/resource card can still appear). */
export const FADE_FLOOR = 0.25;
/** A risen kind's weight ceiling. */
export const RISE_CEIL = 3;

/**
 * A card's **late affinity**, derived purely from its {@link DraftEffect} kind (no
 * per-card annotation). As the run climbs, `fade` kinds lose draft weight and `rise`
 * kinds gain it, so the pool converts late gold into cards that still matter:
 *
 * - **fade**: `damage` (the soft-capped stat) and the late-dead resource cards
 *   (`essence`, `slayerPoints`).
 * - **rise**: `range`/`fireRate` (repeatable, and now capped only gently) plus every
 *   run-changing behavioural / placement-synergy / mage kind.
 * - **neutral**: `life`/`maxLife` (always situationally useful) and `multi` (a bundle
 *   whose affinity is deliberately left flat until playtest says otherwise).
 *
 * The `never` default makes a newly-added effect kind a compile error until it is
 * classified here.
 */
export function lateAffinity(effect: DraftEffect): 'fade' | 'rise' | 'neutral' {
  switch (effect.kind) {
    case 'damage':
    case 'essence':
    case 'slayerPoints':
      return 'fade';
    case 'range':
    case 'fireRate':
    case 'ricochet':
    case 'overkill':
    case 'killStreak':
    case 'lastStand':
    case 'berserker':
    case 'bloodPact':
    case 'greed':
    case 'doubleShot':
    case 'venomTips':
    case 'chainFreeze':
    case 'pierce':
    case 'packTactics':
    case 'trinity':
    case 'vanguard':
    case 'loneWolf':
    case 'mageBuff':
      return 'rise';
    case 'life':
    case 'maxLife':
    case 'multi':
      return 'neutral';
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

/**
 * The per-card late multiplier applied on top of {@link RARITY_WEIGHT}. Ramps from
 * ×1 at {@link RAMP_START} to the affinity's floor/ceiling at {@link RAMP_FULL},
 * linearly, then holds. Below RAMP_START it is exactly 1 (early/mid draft untouched).
 * Pure.
 */
export function lateWeightMult(card: DraftCard, wave: number): number {
  const t = Math.max(0, Math.min(1, (wave - RAMP_START) / (RAMP_FULL - RAMP_START)));
  switch (lateAffinity(card.effect)) {
    case 'fade': return 1 + (FADE_FLOOR - 1) * t;
    case 'rise': return 1 + (RISE_CEIL - 1) * t;
    default: return 1;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/roguelite-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (proves the exhaustive `never` guard is satisfied — every current kind is classified).

- [ ] **Step 6: Commit**

```bash
git add lib/game/systems/roguelite-draft.ts lib/game/systems/roguelite-draft.test.ts
git commit -m "balance: late-game draft re-weighting classifier"
```

---

### Task 3: Wire the re-weight into the roll and the engine

**Files:**
- Modify: `lib/game/systems/roguelite-draft.ts` (`rollDraft` gains a `wave` param and folds `lateWeightMult` into the per-card weight)
- Modify: `lib/game/core/engine.ts` (both `rollDraft` call sites pass `this.wave`)
- Test: `lib/game/systems/roguelite-draft.test.ts` (integration: late hand skews to rise-kinds; early hand matches today)

**Interfaces:**
- Consumes: `lateWeightMult` (Task 2), existing `rollDraft` internals.
- Produces: `rollDraft(rng, count?, pool?, weights?, wave?)` — new optional 5th param `wave` defaulting to `0` (yields all ×1, so every existing caller is unchanged).

- [ ] **Step 1: Write the failing test**

Add to `lib/game/systems/roguelite-draft.test.ts`. Uses the existing `seq` deterministic-RNG helper already in the file:

```ts
describe('rollDraft late re-weighting', () => {
  // Count how often a full hand of many draws lands on a rise-affinity card,
  // early (wave 0 → all ×1) vs deep-late (>= RAMP_FULL → full skew), same RNG.
  const riseShare = (wave: number): number => {
    const rng = seq(0.05, 0.37, 0.61, 0.83, 0.12, 0.49, 0.71, 0.93, 0.28, 0.55);
    let rise = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      const hand = rollDraft(rng, 3, DRAFT_POOL, RARITY_WEIGHT, wave);
      for (const c of hand) { total++; if (lateAffinity(c.effect) === 'rise') rise++; }
    }
    return rise / total;
  };

  it('draws rise-affinity cards materially more often deep in a run', () => {
    expect(riseShare(RAMP_FULL + 20)).toBeGreaterThan(riseShare(0) + 0.1);
  });

  it('defaults to today’s distribution when no wave is passed', () => {
    // Same RNG, same pool: omitting wave must equal passing wave 0 (t = 0, all ×1).
    const rng1 = seq(0.05, 0.37, 0.61, 0.83, 0.12);
    const rng2 = seq(0.05, 0.37, 0.61, 0.83, 0.12);
    const a = rollDraft(rng1, 3, DRAFT_POOL, RARITY_WEIGHT);
    const b = rollDraft(rng2, 3, DRAFT_POOL, RARITY_WEIGHT, 0);
    expect(a.map(c => c.id)).toEqual(b.map(c => c.id));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/roguelite-draft.test.ts`
Expected: FAIL — `rollDraft` ignores the 5th arg, so the late/early shares are equal (the `> +0.1` assertion fails). The default-distribution test passes already (harmless).

- [ ] **Step 3: Fold the multiplier into `rollDraft`**

In `lib/game/systems/roguelite-draft.ts`, change the `rollDraft` signature and the two weight expressions. Add the `wave` parameter and a single local weight helper so the reduce and the roll-loop stay in sync:

```ts
export function rollDraft(
  rng: () => number,
  count = 3,
  pool: readonly DraftCard[] = DRAFT_POOL,
  weights: Record<DraftRarity, number> = RARITY_WEIGHT,
  wave = 0,
): DraftCard[] {
  const remaining = [...pool];
  const hand: DraftCard[] = [];
  const usedGroups = new Set<'currency' | 'lives'>();
  const weightOf = (c: DraftCard) => weights[c.rarity] * lateWeightMult(c, wave);
  const n = Math.min(count, remaining.length);
  for (let i = 0; i < n; i++) {
    const eligible = remaining.filter(c => { const g = resourceGroup(c); return !g || !usedGroups.has(g); });
    const pickFrom = eligible.length ? eligible : remaining;
    const total = pickFrom.reduce((s, c) => s + weightOf(c), 0);
    let roll = rng() * total;
    let idx = 0;
    for (let j = 0; j < pickFrom.length; j++) {
      roll -= weightOf(pickFrom[j]);
      if (roll < 0) { idx = j; break; }
      idx = j;
    }
    const card = pickFrom[idx];
    const g = resourceGroup(card);
    if (g) usedGroups.add(g);
    hand.push(card);
    remaining.splice(remaining.indexOf(card), 1);
  }
  return hand;
}
```

Also extend `rollDraft`'s doc comment with a line: the optional `wave` applies the late re-weighting (`lateWeightMult`); it defaults to `0` (below `RAMP_START`, so ×1 for every card — today's odds).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/roguelite-draft.test.ts`
Expected: PASS (both the skew and the default-distribution tests).

- [ ] **Step 5: Pass the current wave from the engine**

In `lib/game/core/engine.ts`, both `rollDraft` calls take `this.wave` as the new 5th argument.

`offerDraft` (~line 4953):

```ts
    this.pendingDraft = rollDraft(
      Math.random,
      3 + this.relicFx.handBonus,
      availableCards(this.draftedUnique),
      boosted ? BOOSTED_RARITY_WEIGHT : RARITY_WEIGHT,
      this.wave,
    );
```

`rerollDraft` (~line 5037):

```ts
    this.pendingDraft = rollDraft(
      Math.random,
      3 + this.relicFx.handBonus,
      availableCards(this.draftedUnique),
      this.draftBoosted ? BOOSTED_RARITY_WEIGHT : RARITY_WEIGHT,
      this.wave,
    );
```

- [ ] **Step 6: Full gate**

Run: `npx tsc --noEmit` — expected clean.
Run: `npx vitest run` — expected all pass (the whole suite; confirms no existing `rollDraft` caller/test regressed, since the default keeps their behaviour).
Run: `npm run build` — expected a clean static export.

- [ ] **Step 7: Commit**

```bash
git add lib/game/systems/roguelite-draft.ts lib/game/systems/roguelite-draft.test.ts lib/game/core/engine.ts
git commit -m "balance: draft odds shift toward cap-escaping cards as a run climbs"
```

---

## Notes

- **No UI / tutorial mirror needed.** A2 changes only draft *odds* and two combat multipliers; the draft panel, `LEARN_STEPS`, and `TLDR` describe the same interface. A headless drive is optional, not required (spec Block 4).
- **`multi` reclassification** is a recorded tuning follow-up (reclassify by strongest sub-effect affinity if combos come to dominate late hands) — not built here.
- **Pre-existing unrelated breakage:** `lib/game/changelog-classify.test.ts` fails to load (imports `scripts/build-changelog.mjs`, whose `#!` shebang is an invalid module token). It is orthogonal to A2; if `npx vitest run` reports it, it is not introduced by this plan.

## Self-review

- **Spec coverage:** Block 1 (classifier + re-weight) → Task 2. Block 2 (wire into roll + engine) → Task 3. Block 3 (soft-cap fireRate/range) → Task 1. Block 4 (testing) → folded into each task's TDD + the Task 3 full gate. All four blocks covered.
- **Placeholder scan:** none — every constant has a concrete value, every code step shows the full code.
- **Type consistency:** `lateAffinity`/`lateWeightMult`/`RAMP_START`/`RAMP_FULL`/`FADE_FLOOR`/`RISE_CEIL` are defined in Task 2 and consumed by Task 3 with matching names; `FIRE_RATE_MULT_CEILING`/`RANGE_MULT_CEILING` defined and consumed within Task 1. `rollDraft`'s new 5th param `wave` is optional (`= 0`), so Task 1's world and every existing caller compile before Task 3 lands.

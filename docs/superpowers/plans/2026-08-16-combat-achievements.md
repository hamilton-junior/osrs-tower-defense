# Combat Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permanent, account-wide Combat Achievements ladder — 40 named tasks across the six real OSRS CA tiers — that fires a collection-log popup on completion, fills a new Collection Log tab, and grants a cosmetic tier title.

**Architecture:** The engine records *facts* about the run into a flat `runStats` object. A pure module holds the task table and an `evaluate()` returning newly-satisfied ids. The engine calls it at three checkpoints (wave end, boss death, run end). Every predicate is a pure function of state, so the whole ruleset is unit-testable without an engine.

**Tech Stack:** TypeScript, Next.js 15 App Router (static export), Vitest, React 19.

**Spec:** `docs/superpowers/specs/2026-08-16-combat-achievements-design.md`

## Global Constraints

- **In-game strings are English.** Task names and descriptions, tab labels, titles — all English, regardless of the conversation language.
- **Assets come from the local OSRS cache only** (`npm run extract:sprites`). Never hot-link a wiki URL, never substitute a placeholder. If a needed sprite cannot be located in the cache, **stop and ask** — do not improvise.
- **Rewards are non-monetary.** No gold, no Rune Essence, no stat effect. Tier titles are cosmetic only.
- **The New Game+ unlock rule is untouched.** A difficulty tier is still unlocked only by winning the tier below it. Do not modify `lib/game/systems/difficulty.ts`.
- **The board is a fixed 1440×640 logic resolution.** Never derive game state from screen size, window size, or `devicePixelRatio`.
- **Every floating panel over the board is a `MovablePanel`.** Only the bottom bar and its four stone panels are fixed.
- **Task ids are permanent.** They are the persisted key. Never rename one in place.
- **`data/` must not import values from `core/`.** Use `import type` for the type-only references, so no runtime import cycle exists.
- **The legacy `lib/game/data/achievements.ts` is not touched.** It stays as legacy; this feature does not read, modify, or delete it.
- **Verification gate:** `npx tsc --noEmit` → `npx vitest run` → `npm run build`. TypeScript errors fail the build; ESLint does not gate.
- **Do not propose or run a playtest.** Balance and playtesting are the user's own job.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/game/systems/combat-achievements.ts` (create) | Every type (`CaTier`, `CaTask`, `RunStats`, `CaAccount`), plus `emptyRunStats()`, `evaluate()`, `tierProgress()`, `earnedTitles()`, `highestTitle()`. Imports the table from `data/`. |
| `lib/game/data/combat-achievements.ts` (create) | The 40 `CaTask` definitions and `CA_BOSS_ROSTER`. Nothing else. Takes a **type-only** import from `systems/`. |
| `lib/game/systems/combat-achievements.test.ts` (create) | The ruleset's regression net. |
| `lib/game/core/engine.ts` (modify) | Owns `runStats`, records facts at ~10 sites, runs the three checkpoints, fires the popup, emits `achievements`. |
| `lib/game/systems/run-save.ts` (modify) | Optional `caStats` field; **version stays 3**. |
| `components/game/GameRoot.tsx` (modify) | `osrs_td_achievements` store, the sixth Collection Log tab, the title on the victory and start screens, the tutorial mirror. |

The runtime import graph stays acyclic: `core/engine` → `systems/combat-achievements` → `data/combat-achievements`. The data file's reference to `RunStats`/`CaAccount`/`CaTask` is `import type`, which TypeScript erases, so the apparent cycle never exists at runtime.

---

### Task 1: Pure module — types, helpers, and the Easy tier

**Files:**
- Create: `lib/game/systems/combat-achievements.ts`
- Create: `lib/game/data/combat-achievements.ts`
- Test: `lib/game/systems/combat-achievements.test.ts`

**Interfaces:**
- Consumes: `GameMode` and `DifficultyTier` (type-only) from `lib/game/core/engine.ts` and `lib/game/systems/difficulty.ts`; `EnemyType`, `CombatStyle` from `lib/game/types.ts`.
- Produces: `CaTier`, `CA_TIERS`, `CA_TIER_NAMES`, `CaTask`, `RunStats`, `CaAccount`, `emptyRunStats()`, `evaluate(s, account): string[]`, `tierProgress(completed)`, `earnedTitles(completed)`, `highestTitle(completed)`, and `CA_TASKS` / `CA_BOSS_ROSTER` from the data file. **The full `RunStats` interface is defined in this task** even though the Easy tier uses only part of it — later tasks depend on every field existing.

- [ ] **Step 1: Write the failing test**

Create `lib/game/systems/combat-achievements.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  emptyRunStats, evaluate, tierProgress, earnedTitles, highestTitle,
  CA_TIERS, type RunStats,
} from './combat-achievements';
import { CA_TASKS } from '../data/combat-achievements';

/** A RunStats with the given fields overridden — every test starts from empty. */
const stats = (over: Partial<RunStats> = {}): RunStats => ({ ...emptyRunStats('classic', 0), ...over });
const none = { completed: new Set<string>() };

describe('table integrity', () => {
  it('has unique ids', () => {
    const ids = CA_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses kebab-case ids', () => {
    for (const t of CA_TASKS) expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('only uses known tiers', () => {
    for (const t of CA_TASKS) expect(CA_TIERS).toContain(t.tier);
  });
});

describe('easy tier', () => {
  it('rat-catcher needs Scurrius dead', () => {
    expect(evaluate(stats(), none)).not.toContain('rat-catcher');
    expect(evaluate(stats({ bossKillSeconds: { scurrius: 31 } }), none)).toContain('rat-catcher');
  });

  it('first-contract needs one Slayer task', () => {
    expect(evaluate(stats({ slayerTasksDone: 0 }), none)).not.toContain('first-contract');
    expect(evaluate(stats({ slayerTasksDone: 1 }), none)).toContain('first-contract');
  });

  it('answered-prayer needs a prayer active at wave end', () => {
    expect(evaluate(stats({ prayerActiveAtWaveEnd: false }), none)).not.toContain('answered-prayer');
    expect(evaluate(stats({ prayerActiveAtWaveEnd: true }), none)).toContain('answered-prayer');
  });

  it('full-house needs all six tower types at once', () => {
    expect(evaluate(stats({ hadAllSixAtOnce: false }), none)).not.toContain('full-house');
    expect(evaluate(stats({ hadAllSixAtOnce: true }), none)).toContain('full-house');
  });

  it('not-a-scratch needs one clean wave', () => {
    expect(evaluate(stats({ cleanWaveStreak: 0 }), none)).not.toContain('not-a-scratch');
    expect(evaluate(stats({ cleanWaveStreak: 1 }), none)).toContain('not-a-scratch');
  });

  it('ledger-opened needs wave 20', () => {
    expect(evaluate(stats({ maxWaveReached: 19 }), none)).not.toContain('ledger-opened');
    expect(evaluate(stats({ maxWaveReached: 20 }), none)).toContain('ledger-opened');
  });
});

describe('evaluate', () => {
  it('never re-reports a completed id', () => {
    const s = stats({ maxWaveReached: 20 });
    expect(evaluate(s, none)).toContain('ledger-opened');
    expect(evaluate(s, { completed: new Set(['ledger-opened']) })).not.toContain('ledger-opened');
  });

  it('does not mutate the account set it is given', () => {
    const completed = new Set<string>();
    evaluate(stats({ maxWaveReached: 20 }), { completed });
    expect(completed.size).toBe(0);
  });
});

describe('tier helpers', () => {
  it('counts progress per tier', () => {
    const p = tierProgress(new Set(['ledger-opened']));
    expect(p.easy.done).toBe(1);
    expect(p.easy.total).toBe(CA_TASKS.filter((t) => t.tier === 'easy').length);
    expect(p.medium.done).toBe(0);
  });

  it('grants no title until a tier is whole', () => {
    expect(earnedTitles(new Set(['ledger-opened']))).toEqual([]);
    expect(highestTitle(new Set(['ledger-opened']))).toBeNull();
    const allEasy = new Set(CA_TASKS.filter((t) => t.tier === 'easy').map((t) => t.id));
    expect(earnedTitles(allEasy)).toEqual(['easy']);
    expect(highestTitle(allEasy)).toBe('easy');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/game/systems/combat-achievements.test.ts`
Expected: FAIL — cannot resolve `./combat-achievements`.

- [ ] **Step 3: Create the pure module**

Create `lib/game/systems/combat-achievements.ts`:

```ts
/**
 * Combat Achievements — the pure ruleset.
 *
 * The engine records *facts* about a run into {@link RunStats}; every task is a
 * pure predicate over those facts, so the whole ladder is testable without an
 * engine. Task content lives in `data/combat-achievements.ts`; this module owns
 * the types and the evaluation.
 */
import type { GameMode } from '../core/engine';
import type { DifficultyTier } from './difficulty';
import type { EnemyType, CombatStyle } from '../types';
import { CA_TASKS } from '../data/combat-achievements';

export type CaTier = 'easy' | 'medium' | 'hard' | 'elite' | 'master' | 'grandmaster';

/** Ladder order — every consumer iterates this, never Object.keys. */
export const CA_TIERS: readonly CaTier[] = ['easy', 'medium', 'hard', 'elite', 'master', 'grandmaster'];

/** Display name = the title granted by clearing the tier. */
export const CA_TIER_NAMES: Record<CaTier, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
  elite: 'Elite', master: 'Master', grandmaster: 'Grandmaster',
};

export interface CaTask {
  /** Stable id — this is the persisted key. Never rename one in place. */
  id: string;
  tier: CaTier;
  /** English, OSRS-flavoured. Shown in the popup and the log. */
  name: string;
  /** One line saying exactly how to complete it. */
  desc: string;
  /** Set only on the mode-exclusive tasks; absent means "either mode". */
  mode?: GameMode;
  check(s: RunStats, a: CaAccount): boolean;
}

/**
 * Facts about the run in progress. Every field is a plain value so the whole
 * object survives `structuredClone` into the run save.
 */
export interface RunStats {
  mode: GameMode;
  tier: DifficultyTier;
  runPhase: 'normal' | 'endless';
  won: boolean;
  /** Wall-clock seconds spent on the run (engine `runSeconds`). */
  runSeconds: number;
  maxWaveReached: number;

  livesLostRun: number;
  livesLostThisWave: number;
  /** Waves cleared back-to-back with no life lost; reset by any loss. */
  cleanWaveStreak: number;

  towersBuilt: number;
  towersSold: number;
  maxTowersOnField: number;
  hadAllSixAtOnce: boolean;
  /** Kills credited to the tower that landed the killing blow, by tower id. */
  killsByTower: Record<string, number>;
  /** Distinct combat styles of every tower built this run. */
  stylesUsed: CombatStyle[];

  slayerTasksDone: number;
  prayerEverUsed: boolean;
  prayerActiveAtWaveEnd: boolean;

  /** Seconds the boss spent on the field before dying. Undefined = never killed. */
  bossKillSeconds: Partial<Record<EnemyType, number>>;
  /** Internal: when the boss currently on the field arrived. Cleared on its death. */
  bossSpawnSeconds: Partial<Record<EnemyType, number>>;
  /** Lives lost while this boss was on the field. */
  livesLostDuringBoss: Partial<Record<EnemyType, number>>;

  bossFlags: {
    /** A Yt-HurKot healed Jad at least once. */
    jadHealed: boolean;
    /** How many of the Hydra's two vents were broken. */
    hydraVentsBroken: number;
    /** The Hydra healed at a vent at least once. */
    hydraVentHealed: boolean;
    /** No Guardian was ever revived this run. Starts true. */
    duskDawnClean: boolean;
    /** A Summoned Soul reached the exit. */
    cerberusSoulLeaked: boolean;
  };
}

export interface CaAccount {
  completed: ReadonlySet<string>;
}

export function emptyRunStats(mode: GameMode, tier: DifficultyTier): RunStats {
  return {
    mode, tier, runPhase: 'normal', won: false, runSeconds: 0, maxWaveReached: 1,
    livesLostRun: 0, livesLostThisWave: 0, cleanWaveStreak: 0,
    towersBuilt: 0, towersSold: 0, maxTowersOnField: 0, hadAllSixAtOnce: false,
    killsByTower: {}, stylesUsed: [],
    slayerTasksDone: 0, prayerEverUsed: false, prayerActiveAtWaveEnd: false,
    bossKillSeconds: {}, bossSpawnSeconds: {}, livesLostDuringBoss: {},
    bossFlags: {
      jadHealed: false, hydraVentsBroken: 0, hydraVentHealed: false,
      duskDawnClean: true, cerberusSoulLeaked: false,
    },
  };
}

/**
 * Ids satisfied now and not already completed. Pure: never mutates `account`.
 *
 * Runs to a fixed point (at most two passes) so a capstone that depends on the
 * other tasks can still fire on the very checkpoint that completes the last of
 * them, rather than waiting for the next one.
 */
export function evaluate(s: RunStats, account: CaAccount): string[] {
  const completed = new Set(account.completed);
  const gained: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (const t of CA_TASKS) {
      if (completed.has(t.id)) continue;
      if (t.mode && t.mode !== s.mode) continue;
      if (!t.check(s, { completed })) continue;
      completed.add(t.id);
      gained.push(t.id);
      changed = true;
    }
    if (!changed) break;
  }
  return gained;
}

/** Per-tier completion counts, for the log's progress bars. */
export function tierProgress(completed: ReadonlySet<string>): Record<CaTier, { done: number; total: number }> {
  const out = {} as Record<CaTier, { done: number; total: number }>;
  for (const tier of CA_TIERS) {
    const tasks = CA_TASKS.filter((t) => t.tier === tier);
    out[tier] = { done: tasks.filter((t) => completed.has(t.id)).length, total: tasks.length };
  }
  return out;
}

/** Tiers completed in full — each grants its cosmetic title. */
export function earnedTitles(completed: ReadonlySet<string>): CaTier[] {
  const progress = tierProgress(completed);
  return CA_TIERS.filter((tier) => progress[tier].total > 0 && progress[tier].done === progress[tier].total);
}

/** The highest tier cleared in full, or null. */
export function highestTitle(completed: ReadonlySet<string>): CaTier | null {
  const earned = earnedTitles(completed);
  return earned.length > 0 ? earned[earned.length - 1] : null;
}
```

- [ ] **Step 4: Create the data table with the Easy tier**

Create `lib/game/data/combat-achievements.ts`:

```ts
/**
 * The Combat Achievements table. Content only — the types and the evaluation
 * live in `systems/combat-achievements.ts`.
 *
 * The import below is **type-only** on purpose: `systems/` imports this file's
 * value (`CA_TASKS`), so a value import back would close a runtime cycle.
 *
 * Ids are permanent — they are the persisted key. Never rename one in place;
 * retire a task by deleting it (unknown stored ids are ignored on read).
 */
import type { CaTask } from '../systems/combat-achievements';
import type { EnemyType } from '../types';

/** The ten bosses a full run must defeat, for `perfect-roster`. */
export const CA_BOSS_ROSTER: readonly EnemyType[] = [
  'scurrius', 'brutus', 'giant_mole', 'dusk', 'dawn',
  'cerberus', 'zulrah', 'vorkath', 'jad', 'hydra',
];

export const CA_TASKS: readonly CaTask[] = [
  // --- Easy: teach the systems; reachable inside the first ~20 waves ---
  {
    id: 'rat-catcher', tier: 'easy', name: 'Rat Catcher',
    desc: 'Defeat Scurrius.',
    check: (s) => s.bossKillSeconds.scurrius !== undefined,
  },
  {
    id: 'first-contract', tier: 'easy', name: 'First Contract',
    desc: 'Complete a Slayer task.',
    check: (s) => s.slayerTasksDone >= 1,
  },
  {
    id: 'answered-prayer', tier: 'easy', name: 'Answered Prayer',
    desc: 'Finish a wave with a tower prayer active.',
    check: (s) => s.prayerActiveAtWaveEnd,
  },
  {
    id: 'full-house', tier: 'easy', name: 'Full House',
    desc: 'Have all six tower types on the field at once.',
    check: (s) => s.hadAllSixAtOnce,
  },
  {
    id: 'not-a-scratch', tier: 'easy', name: 'Not a Scratch',
    desc: 'Clear a wave without losing a life.',
    check: (s) => s.cleanWaveStreak >= 1,
  },
  {
    id: 'ledger-opened', tier: 'easy', name: 'Ledger Opened',
    desc: 'Reach wave 20.',
    check: (s) => s.maxWaveReached >= 20,
  },
];
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/combat-achievements.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If it reports a circular-import or unresolved-type error between `data/` and `systems/`, the `import type` in the data file was written as a value import — fix that, do not restructure the layering.

- [ ] **Step 7: Commit**

```bash
git add lib/game/systems/combat-achievements.ts lib/game/systems/combat-achievements.test.ts lib/game/data/combat-achievements.ts
git commit -m "feat(achievements): pure Combat Achievements ruleset + Easy tier"
```

---

### Task 2: Medium and Hard tiers

**Files:**
- Modify: `lib/game/data/combat-achievements.ts` (append to `CA_TASKS`)
- Test: `lib/game/systems/combat-achievements.test.ts` (append describe blocks)

**Interfaces:**
- Consumes: `CaTask`, `RunStats` from Task 1; `emptyRunStats`, `evaluate` for the tests.
- Produces: 14 further entries in `CA_TASKS`. No new exported symbols.

- [ ] **Step 1: Write the failing tests**

Append to `lib/game/systems/combat-achievements.test.ts`:

```ts
describe('medium tier', () => {
  it('bodyguard needs Brutus dead with no life lost to him', () => {
    expect(evaluate(stats({ bossKillSeconds: { brutus: 40 }, livesLostDuringBoss: { brutus: 1 } }), none))
      .not.toContain('bodyguard');
    expect(evaluate(stats({ bossKillSeconds: { brutus: 40 } }), none)).toContain('bodyguard');
  });

  it('molehill needs the Giant Mole dead', () => {
    expect(evaluate(stats(), none)).not.toContain('molehill');
    expect(evaluate(stats({ bossKillSeconds: { giant_mole: 55 } }), none)).toContain('molehill');
  });

  it('sun-and-moon needs both Guardians dead with no revive', () => {
    const both = { dusk: 30, dawn: 35 };
    expect(evaluate(stats({ bossKillSeconds: both, bossFlags: { ...emptyRunStats('classic', 0).bossFlags, duskDawnClean: false } }), none))
      .not.toContain('sun-and-moon');
    expect(evaluate(stats({ bossKillSeconds: { dusk: 30 } }), none)).not.toContain('sun-and-moon');
    expect(evaluate(stats({ bossKillSeconds: both }), none)).toContain('sun-and-moon');
  });

  it('thrifty needs wave 30 with at most 8 towers built', () => {
    expect(evaluate(stats({ maxWaveReached: 30, towersBuilt: 9 }), none)).not.toContain('thrifty');
    expect(evaluate(stats({ maxWaveReached: 29, towersBuilt: 8 }), none)).not.toContain('thrifty');
    expect(evaluate(stats({ maxWaveReached: 30, towersBuilt: 8 }), none)).toContain('thrifty');
  });

  it('specialist needs 100 kills on one tower', () => {
    expect(evaluate(stats({ killsByTower: { a: 99, b: 99 } }), none)).not.toContain('specialist');
    expect(evaluate(stats({ killsByTower: { a: 100 } }), none)).toContain('specialist');
  });

  it('taskmaster needs 5 Slayer tasks', () => {
    expect(evaluate(stats({ slayerTasksDone: 4 }), none)).not.toContain('taskmaster');
    expect(evaluate(stats({ slayerTasksDone: 5 }), none)).toContain('taskmaster');
  });

  it('untouchable needs a 5-wave clean streak', () => {
    expect(evaluate(stats({ cleanWaveStreak: 4 }), none)).not.toContain('untouchable');
    expect(evaluate(stats({ cleanWaveStreak: 5 }), none)).toContain('untouchable');
  });
});

describe('hard tier', () => {
  const flags = (over: Partial<RunStats['bossFlags']>) => ({
    ...emptyRunStats('classic', 0).bossFlags, ...over,
  });

  it('fire-cape needs Jad dead and never healed', () => {
    expect(evaluate(stats({ bossKillSeconds: { jad: 120 }, bossFlags: flags({ jadHealed: true }) }), none))
      .not.toContain('fire-cape');
    expect(evaluate(stats({ bossKillSeconds: { jad: 120 } }), none)).toContain('fire-cape');
  });

  it('vent-breaker needs both Hydra vents broken', () => {
    expect(evaluate(stats({ bossFlags: flags({ hydraVentsBroken: 1 }) }), none)).not.toContain('vent-breaker');
    expect(evaluate(stats({ bossFlags: flags({ hydraVentsBroken: 2 }) }), none)).toContain('vent-breaker');
  });

  it('hellhounds-master needs Cerberus dead with no soul escaping', () => {
    expect(evaluate(stats({ bossKillSeconds: { cerberus: 70 }, bossFlags: flags({ cerberusSoulLeaked: true }) }), none))
      .not.toContain('hellhounds-master');
    expect(evaluate(stats({ bossKillSeconds: { cerberus: 70 } }), none)).toContain('hellhounds-master');
  });

  it('snake-charmer needs Zulrah under 90 seconds', () => {
    expect(evaluate(stats(), none)).not.toContain('snake-charmer');
    expect(evaluate(stats({ bossKillSeconds: { zulrah: 90 } }), none)).not.toContain('snake-charmer');
    expect(evaluate(stats({ bossKillSeconds: { zulrah: 89 } }), none)).toContain('snake-charmer');
  });

  it('dragonfire-drill needs Vorkath dead with no life lost to him', () => {
    expect(evaluate(stats({ bossKillSeconds: { vorkath: 80 }, livesLostDuringBoss: { vorkath: 1 } }), none))
      .not.toContain('dragonfire-drill');
    expect(evaluate(stats({ bossKillSeconds: { vorkath: 80 } }), none)).toContain('dragonfire-drill');
  });

  it('minimalist needs wave 50 with at most 6 towers on the field', () => {
    expect(evaluate(stats({ maxWaveReached: 50, maxTowersOnField: 7 }), none)).not.toContain('minimalist');
    expect(evaluate(stats({ maxWaveReached: 50, maxTowersOnField: 6 }), none)).toContain('minimalist');
  });

  it('purist needs wave 40 with nothing sold', () => {
    expect(evaluate(stats({ maxWaveReached: 40, towersSold: 1 }), none)).not.toContain('purist');
    expect(evaluate(stats({ maxWaveReached: 40, towersSold: 0 }), none)).toContain('purist');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/game/systems/combat-achievements.test.ts`
Expected: FAIL — the new ids are never returned by `evaluate`.

- [ ] **Step 3: Append the 14 tasks**

Append inside the `CA_TASKS` array in `lib/game/data/combat-achievements.ts`, after the Easy entries:

```ts
  // --- Medium ---
  {
    id: 'bodyguard', tier: 'medium', name: 'Bodyguard',
    desc: 'Defeat Brutus without losing a life.',
    check: (s) => s.bossKillSeconds.brutus !== undefined && (s.livesLostDuringBoss.brutus ?? 0) === 0,
  },
  {
    id: 'molehill', tier: 'medium', name: 'Molehill',
    desc: 'Defeat the Giant Mole.',
    check: (s) => s.bossKillSeconds.giant_mole !== undefined,
  },
  {
    id: 'sun-and-moon', tier: 'medium', name: 'Sun and Moon',
    desc: 'Defeat Dusk and Dawn in the correct order, with neither reviving.',
    check: (s) => s.bossKillSeconds.dusk !== undefined
      && s.bossKillSeconds.dawn !== undefined
      && s.bossFlags.duskDawnClean,
  },
  {
    id: 'thrifty', tier: 'medium', name: 'Thrifty',
    desc: 'Reach wave 30 having built no more than 8 towers.',
    check: (s) => s.maxWaveReached >= 30 && s.towersBuilt <= 8,
  },
  {
    id: 'specialist', tier: 'medium', name: 'Specialist',
    desc: 'Get 100 kills with a single tower.',
    check: (s) => Object.values(s.killsByTower).some((n) => n >= 100),
  },
  {
    id: 'taskmaster', tier: 'medium', name: 'Taskmaster',
    desc: 'Complete 5 Slayer tasks in one run.',
    check: (s) => s.slayerTasksDone >= 5,
  },
  {
    id: 'untouchable', tier: 'medium', name: 'Untouchable',
    desc: 'Clear 5 waves in a row without losing a life.',
    check: (s) => s.cleanWaveStreak >= 5,
  },

  // --- Hard ---
  {
    id: 'fire-cape', tier: 'hard', name: 'Fire Cape',
    desc: 'Defeat TzTok-Jad without a Yt-HurKot healing him.',
    check: (s) => s.bossKillSeconds.jad !== undefined && !s.bossFlags.jadHealed,
  },
  {
    id: 'vent-breaker', tier: 'hard', name: 'Vent Breaker',
    desc: "Break both of the Alchemical Hydra's vents.",
    check: (s) => s.bossFlags.hydraVentsBroken >= 2,
  },
  {
    id: 'hellhounds-master', tier: 'hard', name: "Hellhound's Master",
    desc: 'Defeat Cerberus without a Summoned Soul escaping.',
    check: (s) => s.bossKillSeconds.cerberus !== undefined && !s.bossFlags.cerberusSoulLeaked,
  },
  {
    id: 'snake-charmer', tier: 'hard', name: 'Snake Charmer',
    desc: 'Defeat Zulrah in under 90 seconds.',
    check: (s) => (s.bossKillSeconds.zulrah ?? Infinity) < 90,
  },
  {
    id: 'dragonfire-drill', tier: 'hard', name: 'Dragonfire Drill',
    desc: 'Defeat Vorkath without losing a life.',
    check: (s) => s.bossKillSeconds.vorkath !== undefined && (s.livesLostDuringBoss.vorkath ?? 0) === 0,
  },
  {
    id: 'minimalist', tier: 'hard', name: 'Minimalist',
    desc: 'Reach wave 50 with no more than 6 towers on the field.',
    check: (s) => s.maxWaveReached >= 50 && s.maxTowersOnField <= 6,
  },
  {
    id: 'purist', tier: 'hard', name: 'Purist',
    desc: 'Reach wave 40 without selling a tower.',
    check: (s) => s.maxWaveReached >= 40 && s.towersSold === 0,
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/combat-achievements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game/data/combat-achievements.ts lib/game/systems/combat-achievements.test.ts
git commit -m "feat(achievements): Medium and Hard tiers"
```

---

### Task 3: Elite and Master tiers

**Files:**
- Modify: `lib/game/data/combat-achievements.ts` (append to `CA_TASKS`)
- Test: `lib/game/systems/combat-achievements.test.ts` (append describe blocks)

**Interfaces:**
- Consumes: `CaTask`, `RunStats` from Task 1.
- Produces: 14 further entries, two of them carrying `mode` (`old-school` → `'classic'`, `gambler` → `'roguelite'`). No new exported symbols.

- [ ] **Step 1: Write the failing tests**

Append to `lib/game/systems/combat-achievements.test.ts`:

```ts
describe('elite tier', () => {
  const win = (over: Partial<RunStats> = {}) => stats({ won: true, ...over });

  it('champion needs a win', () => {
    expect(evaluate(stats(), none)).not.toContain('champion');
    expect(evaluate(win(), none)).toContain('champion');
  });

  it('old-school and gambler are mode-locked', () => {
    const classicWin = evaluate({ ...win(), mode: 'classic' }, none);
    expect(classicWin).toContain('old-school');
    expect(classicWin).not.toContain('gambler');

    const rogueWin = evaluate({ ...win(), mode: 'roguelite' }, none);
    expect(rogueWin).toContain('gambler');
    expect(rogueWin).not.toContain('old-school');
  });

  it('speed-runner needs a win under 45 minutes', () => {
    expect(evaluate(win({ runSeconds: 45 * 60 }), none)).not.toContain('speed-runner');
    expect(evaluate(win({ runSeconds: 45 * 60 - 1 }), none)).toContain('speed-runner');
  });

  it('iron-wall allows at most 5 lives lost', () => {
    expect(evaluate(win({ livesLostRun: 6 }), none)).not.toContain('iron-wall');
    expect(evaluate(win({ livesLostRun: 5 }), none)).toContain('iron-wall');
  });

  it('one-true-style needs exactly one style', () => {
    expect(evaluate(win({ stylesUsed: ['ranged', 'magic'] }), none)).not.toContain('one-true-style');
    expect(evaluate(win({ stylesUsed: [] }), none)).not.toContain('one-true-style');
    expect(evaluate(win({ stylesUsed: ['ranged'] }), none)).toContain('one-true-style');
  });

  it('deep-cut needs Endless wave 120', () => {
    expect(evaluate(stats({ maxWaveReached: 120, runPhase: 'normal' }), none)).not.toContain('deep-cut');
    expect(evaluate(stats({ maxWaveReached: 119, runPhase: 'endless' }), none)).not.toContain('deep-cut');
    expect(evaluate(stats({ maxWaveReached: 120, runPhase: 'endless' }), none)).toContain('deep-cut');
  });
});

describe('master tier', () => {
  const win = (over: Partial<RunStats> = {}) => stats({ won: true, ...over });

  it('hard-mode and elite-company gate on the difficulty tier', () => {
    expect(evaluate(win({ tier: 2 }), none)).not.toContain('hard-mode');
    expect(evaluate(win({ tier: 3 }), none)).toContain('hard-mode');
    expect(evaluate(win({ tier: 3 }), none)).not.toContain('elite-company');
    expect(evaluate(win({ tier: 4 }), none)).toContain('elite-company');
  });

  it('flawless-fight-caves needs a clean Jad on Hard or above', () => {
    expect(evaluate(stats({ tier: 2, bossKillSeconds: { jad: 100 } }), none))
      .not.toContain('flawless-fight-caves');
    expect(evaluate(stats({ tier: 3, bossKillSeconds: { jad: 100 }, livesLostDuringBoss: { jad: 1 } }), none))
      .not.toContain('flawless-fight-caves');
    expect(evaluate(stats({ tier: 3, bossKillSeconds: { jad: 100 } }), none))
      .toContain('flawless-fight-caves');
  });

  it('perfect-hydra needs the Hydra dead having never healed at a vent', () => {
    const healed = { ...emptyRunStats('classic', 0).bossFlags, hydraVentHealed: true };
    expect(evaluate(stats({ bossKillSeconds: { hydra: 150 }, bossFlags: healed }), none))
      .not.toContain('perfect-hydra');
    expect(evaluate(stats({ bossKillSeconds: { hydra: 150 } }), none)).toContain('perfect-hydra');
  });

  it('bare-bones allows at most 10 towers built', () => {
    expect(evaluate(win({ towersBuilt: 11 }), none)).not.toContain('bare-bones');
    expect(evaluate(win({ towersBuilt: 10 }), none)).toContain('bare-bones');
  });

  it('no-gods-no-prayers needs a prayerless win', () => {
    expect(evaluate(win({ prayerEverUsed: true }), none)).not.toContain('no-gods-no-prayers');
    expect(evaluate(win({ prayerEverUsed: false }), none)).toContain('no-gods-no-prayers');
  });

  it('endless-endurance needs Endless wave 200', () => {
    expect(evaluate(stats({ maxWaveReached: 200, runPhase: 'normal' }), none)).not.toContain('endless-endurance');
    expect(evaluate(stats({ maxWaveReached: 200, runPhase: 'endless' }), none)).toContain('endless-endurance');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/game/systems/combat-achievements.test.ts`
Expected: FAIL — the new ids are never returned.

- [ ] **Step 3: Append the 14 tasks**

Append inside `CA_TASKS`, after the Hard entries:

```ts
  // --- Elite ---
  {
    id: 'champion', tier: 'elite', name: 'Champion',
    desc: 'Win a run.',
    check: (s) => s.won,
  },
  {
    id: 'old-school', tier: 'elite', name: 'Old School',
    desc: 'Win a run in Classic mode.',
    mode: 'classic',
    check: (s) => s.won,
  },
  {
    id: 'gambler', tier: 'elite', name: 'Gambler',
    desc: 'Win a run in Roguelite mode.',
    mode: 'roguelite',
    check: (s) => s.won,
  },
  {
    id: 'speed-runner', tier: 'elite', name: 'Speed Runner',
    desc: 'Win a run in under 45 minutes.',
    check: (s) => s.won && s.runSeconds < 45 * 60,
  },
  {
    id: 'iron-wall', tier: 'elite', name: 'Iron Wall',
    desc: 'Win a run losing no more than 5 lives.',
    check: (s) => s.won && s.livesLostRun <= 5,
  },
  {
    id: 'one-true-style', tier: 'elite', name: 'One True Style',
    desc: 'Win a run using towers of a single combat style.',
    check: (s) => s.won && s.stylesUsed.length === 1,
  },
  {
    id: 'deep-cut', tier: 'elite', name: 'Deep Cut',
    desc: 'Reach wave 120 in Endless.',
    check: (s) => s.runPhase === 'endless' && s.maxWaveReached >= 120,
  },

  // --- Master ---
  {
    id: 'hard-mode', tier: 'master', name: 'Hard Mode',
    desc: 'Win a run on Hard difficulty or above.',
    check: (s) => s.won && s.tier >= 3,
  },
  {
    id: 'elite-company', tier: 'master', name: 'Elite Company',
    desc: 'Win a run on Elite difficulty or above.',
    check: (s) => s.won && s.tier >= 4,
  },
  {
    id: 'flawless-fight-caves', tier: 'master', name: 'Flawless Fight Caves',
    desc: 'Defeat TzTok-Jad without losing a life, on Hard difficulty or above.',
    check: (s) => s.tier >= 3
      && s.bossKillSeconds.jad !== undefined
      && (s.livesLostDuringBoss.jad ?? 0) === 0,
  },
  {
    id: 'perfect-hydra', tier: 'master', name: 'Perfect Hydra',
    desc: 'Defeat the Alchemical Hydra without it healing at a vent.',
    check: (s) => s.bossKillSeconds.hydra !== undefined && !s.bossFlags.hydraVentHealed,
  },
  {
    id: 'bare-bones', tier: 'master', name: 'Bare Bones',
    desc: 'Win a run having built no more than 10 towers.',
    check: (s) => s.won && s.towersBuilt <= 10,
  },
  {
    id: 'no-gods-no-prayers', tier: 'master', name: 'No Gods, No Prayers',
    desc: 'Win a run without activating a single prayer.',
    check: (s) => s.won && !s.prayerEverUsed,
  },
  {
    id: 'endless-endurance', tier: 'master', name: 'Endless Endurance',
    desc: 'Reach wave 200 in Endless.',
    check: (s) => s.runPhase === 'endless' && s.maxWaveReached >= 200,
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/combat-achievements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/game/data/combat-achievements.ts lib/game/systems/combat-achievements.test.ts
git commit -m "feat(achievements): Elite and Master tiers"
```

---

### Task 4: Grandmaster tier and the capstone

**Files:**
- Modify: `lib/game/data/combat-achievements.ts` (append to `CA_TASKS`)
- Test: `lib/game/systems/combat-achievements.test.ts` (append describe block)

**Interfaces:**
- Consumes: `CA_BOSS_ROSTER` from Task 1; `CaTask`, `RunStats`, `CaAccount` from Task 1.
- Produces: the final 6 entries, bringing `CA_TASKS.length` to 40. `the-whole-log` reads `a.completed` — it is the only task that uses the second `check` argument.

- [ ] **Step 1: Write the failing tests**

Append to `lib/game/systems/combat-achievements.test.ts`:

```ts
describe('grandmaster tier', () => {
  const win = (over: Partial<RunStats> = {}) => stats({ won: true, ...over });

  it('has exactly 40 tasks in total', () => {
    expect(CA_TASKS.length).toBe(40);
  });

  it('grandmaster needs a tier-6 win', () => {
    expect(evaluate(win({ tier: 5 }), none)).not.toContain('grandmaster');
    expect(evaluate(win({ tier: 6 }), none)).toContain('grandmaster');
  });

  it('untouchable-champion needs a flawless win', () => {
    expect(evaluate(win({ livesLostRun: 1 }), none)).not.toContain('untouchable-champion');
    expect(evaluate(win({ livesLostRun: 0 }), none)).toContain('untouchable-champion');
  });

  it('perfect-roster needs all ten bosses, none costing a life', () => {
    type Kills = RunStats['bossKillSeconds'];
    const all: Kills = Object.fromEntries(CA_BOSS_ROSTER.map((b) => [b, 30])) as Kills;
    expect(evaluate(win({ bossKillSeconds: all, livesLostDuringBoss: { jad: 1 } }), none))
      .not.toContain('perfect-roster');
    const missingOne: Kills = { ...all };
    delete missingOne[CA_BOSS_ROSTER[0]];
    expect(evaluate(win({ bossKillSeconds: missingOne }), none)).not.toContain('perfect-roster');
    expect(evaluate(win({ bossKillSeconds: all }), none)).toContain('perfect-roster');
  });

  it('speed-grandmaster needs Master+ under an hour', () => {
    expect(evaluate(win({ tier: 4, runSeconds: 100 }), none)).not.toContain('speed-grandmaster');
    expect(evaluate(win({ tier: 5, runSeconds: 60 * 60 }), none)).not.toContain('speed-grandmaster');
    expect(evaluate(win({ tier: 5, runSeconds: 60 * 60 - 1 }), none)).toContain('speed-grandmaster');
  });

  it('ascetic-grandmaster needs Elite+, nothing sold, at most 12 built', () => {
    expect(evaluate(win({ tier: 4, towersSold: 1, towersBuilt: 12 }), none)).not.toContain('ascetic-grandmaster');
    expect(evaluate(win({ tier: 4, towersSold: 0, towersBuilt: 13 }), none)).not.toContain('ascetic-grandmaster');
    expect(evaluate(win({ tier: 3, towersSold: 0, towersBuilt: 12 }), none)).not.toContain('ascetic-grandmaster');
    expect(evaluate(win({ tier: 4, towersSold: 0, towersBuilt: 12 }), none)).toContain('ascetic-grandmaster');
  });

  it('the-whole-log never counts itself and fires on the last task', () => {
    const others = CA_TASKS.filter((t) => t.id !== 'the-whole-log').map((t) => t.id);
    // All but one already done: the capstone must not fire yet.
    const allButOne = new Set(others.slice(0, -1));
    expect(evaluate(stats(), { completed: allButOne })).not.toContain('the-whole-log');
    // Everything else done: it fires.
    expect(evaluate(stats(), { completed: new Set(others) })).toContain('the-whole-log');
  });

  it('the-whole-log fires in the same evaluate that completes the 39th task', () => {
    const others = CA_TASKS.filter((t) => t.id !== 'the-whole-log').map((t) => t.id);
    // Everything except ledger-opened, which this very RunStats satisfies.
    const completed = new Set(others.filter((id) => id !== 'ledger-opened'));
    const gained = evaluate(stats({ maxWaveReached: 20 }), { completed });
    expect(gained).toContain('ledger-opened');
    expect(gained).toContain('the-whole-log');
  });
});
```

Add `CA_BOSS_ROSTER` to the file's existing import from `../data/combat-achievements`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/game/systems/combat-achievements.test.ts`
Expected: FAIL — `CA_TASKS.length` is 34, and the new ids are never returned.

- [ ] **Step 3: Append the final 6 tasks**

Append inside `CA_TASKS`, after the Master entries:

```ts
  // --- Grandmaster ---
  {
    id: 'grandmaster', tier: 'grandmaster', name: 'Grandmaster',
    desc: 'Win a run on Grandmaster difficulty.',
    check: (s) => s.won && s.tier >= 6,
  },
  {
    id: 'untouchable-champion', tier: 'grandmaster', name: 'Untouchable Champion',
    desc: 'Win a run without losing a single life.',
    check: (s) => s.won && s.livesLostRun === 0,
  },
  {
    id: 'perfect-roster', tier: 'grandmaster', name: 'Perfect Roster',
    desc: 'Defeat all ten bosses in one run, losing no life to any of them.',
    check: (s) => s.won && CA_BOSS_ROSTER.every(
      (b) => s.bossKillSeconds[b] !== undefined && (s.livesLostDuringBoss[b] ?? 0) === 0,
    ),
  },
  {
    id: 'speed-grandmaster', tier: 'grandmaster', name: 'Speed Grandmaster',
    desc: 'Win on Master difficulty or above in under 60 minutes.',
    check: (s) => s.won && s.tier >= 5 && s.runSeconds < 60 * 60,
  },
  {
    id: 'ascetic-grandmaster', tier: 'grandmaster', name: 'Ascetic Grandmaster',
    desc: 'Win on Elite difficulty or above without selling a tower, having built no more than 12.',
    check: (s) => s.won && s.tier >= 4 && s.towersSold === 0 && s.towersBuilt <= 12,
  },
  {
    id: 'the-whole-log', tier: 'grandmaster', name: 'The Whole Log',
    desc: 'Complete every other Combat Achievement.',
    check: (_s, a) => CA_TASKS.every((t) => t.id === 'the-whole-log' || a.completed.has(t.id)),
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/game/systems/combat-achievements.test.ts`
Expected: PASS — including the two capstone cases, which prove the fixed-point loop in `evaluate` works.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` — expected clean.

```bash
git add lib/game/data/combat-achievements.ts lib/game/systems/combat-achievements.test.ts
git commit -m "feat(achievements): Grandmaster tier and The Whole Log capstone"
```

---

### Task 5: Engine instrumentation — recording the facts

**Files:**
- Modify: `lib/game/core/engine.ts`

**Interfaces:**
- Consumes: `RunStats`, `emptyRunStats` from `lib/game/systems/combat-achievements.ts`.
- Produces: a public `caStats: RunStats` field on `GameEngine`, kept current by the recorders below. Task 6 reads it; nothing else does.

This task only *records*. It does not evaluate, popup, emit, or persist — that is Task 6. After this task the game behaves identically; the only observable change is a new field.

- [ ] **Step 1: Add the field and its reset**

Import at the top of `lib/game/core/engine.ts`:

```ts
import { emptyRunStats, type RunStats } from '../systems/combat-achievements';
```

Declare beside the existing run counters (they are at `engine.ts:800-808`, under the comment `// --- run stats (read directly by the UI, e.g. the game-over screen) ---`):

```ts
  /** Combat Achievement facts for this run. Recorded here, evaluated by the pure
   *  `systems/combat-achievements` module at the three checkpoints. */
  caStats: RunStats = emptyRunStats('roguelite', 0);
```

In `restart()`, beside `this.kills = 0;` (`engine.ts:5660`), add:

```ts
    this.caStats = emptyRunStats(this.gameMode, this.difficultyTier);
```

Place it **after** `this.difficultyTier` is settled for the new run so the tier is correct — the surrounding code already reads `this.difficultyTier` at `engine.ts:5639` (`effectiveStartLives`), so anywhere after that line is safe.

- [ ] **Step 2: Record wave, phase, mode and clock facts**

In `checkWaveEnd()` (`engine.ts:5160`), immediately after `this.wave += 1;` (`engine.ts:5197`):

```ts
    this.caStats.maxWaveReached = Math.max(this.caStats.maxWaveReached, this.wave);
    this.caStats.runPhase = this.runPhase;
    this.caStats.runSeconds = this.runSeconds;
    this.caStats.prayerActiveAtWaveEnd = this.prayer.active.length > 0;
    this.caStats.slayerTasksDone = this.slayer.streak;
    if (this.caStats.livesLostThisWave === 0) this.caStats.cleanWaveStreak += 1;
    else this.caStats.cleanWaveStreak = 0;
    this.caStats.livesLostThisWave = 0;
```

`this.slayer.streak` already counts tasks completed this run and is zeroed by `SlayerSystem.reset()` (`lib/game/systems/slayer-system.ts:96` increments it, `:232` resets it), so no new Slayer instrumentation is needed.

If `this.prayer.active` is not the correct accessor for the currently-active prayers, use whatever field `PrayerSystem` exposes for the list the UI reads — do not add a parallel one.

In the victory latch (`engine.ts:5223-5229`), after `this.won = true;`:

```ts
      this.caStats.won = true;
      this.caStats.runSeconds = this.runSeconds;
```

- [ ] **Step 3: Record life losses**

At the leak site (`engine.ts:3971-3980`), inside the `if (!e.debug && !e.escort) {` block, immediately after `this.lives -= cost;`:

```ts
          this.caStats.livesLostRun += cost;
          this.caStats.livesLostThisWave += cost;
          this.caStats.cleanWaveStreak = 0;
          for (const boss of this.enemies) {
            if (!boss.isBoss) continue;
            this.caStats.livesLostDuringBoss[boss.type] =
              (this.caStats.livesLostDuringBoss[boss.type] ?? 0) + cost;
          }
```

At the Blood Pact life cost (`engine.ts:5192-5193`), after `this.lives -= 1;`:

```ts
      this.caStats.livesLostRun += 1;
      this.caStats.livesLostThisWave += 1;
      this.caStats.cleanWaveStreak = 0;
```

Also record the Summoned Soul leak. In the same leak block, before the boss loop above:

```ts
          if (e.type === 'summoned_soul') this.caStats.bossFlags.cerberusSoulLeaked = true;
```

Note this must sit *outside* the `!e.escort` guard if Summoned Souls are flagged as escorts — check `ENEMIES.summoned_soul` and place it accordingly, at the top of the leak branch (`engine.ts:3963`, right after `this.enemies.splice(i, 1);`) if so.

- [ ] **Step 4: Record tower facts**

In `placeTower`, immediately after `this.towersBuilt += 1;` (`engine.ts:2320`), add:

```ts
    this.caStats.towersBuilt = this.towersBuilt;
    this.caStats.maxTowersOnField = Math.max(this.caStats.maxTowersOnField, this.towers.length);
    if (new Set(this.towers.map((t) => t.type)).size >= 6) this.caStats.hadAllSixAtOnce = true;
    const style = TOWER_STYLES[tower.type]?.style;
    if (style && !this.caStats.stylesUsed.includes(style)) this.caStats.stylesUsed.push(style);
```

`TOWER_STYLES` is already imported at `engine.ts:7` (`import { TOWERS, TOWER_STYLES } from '../data/towers';`) and is the engine's existing style lookup — the same one used at `engine.ts:4248` and `:4333`. Do not add a second mapping. Use whatever local name the placed tower has in that scope; if the new tower object is not in scope at line 2320, read the style from the type that was placed.

In `sellTower(towerId)` (`engine.ts:2658`), after the tower is removed:

```ts
    this.caStats.towersSold += 1;
```

- [ ] **Step 5: Record per-tower kills and boss timings**

At the kill site (`engine.ts:4996`, the `if (!enemy.debug && !enemy.escort) {` block that increments `this.kills`), after `this.kills += 1;`:

```ts
      if (towerId) {
        this.caStats.killsByTower[towerId] = (this.caStats.killsByTower[towerId] ?? 0) + 1;
      }
      if (enemy.isBoss) {
        const spawned = this.caStats.bossSpawnSeconds[enemy.type];
        this.caStats.bossKillSeconds[enemy.type] =
          spawned === undefined ? this.runSeconds : this.runSeconds - spawned;
        delete this.caStats.bossSpawnSeconds[enemy.type];
      }
```

`towerId` is already a parameter of this method — it arrives in the damage meta (`{ towerId: p.sourceTowerId, tag: 'direct' }`, e.g. `engine.ts:4492`). Use the existing name; do not thread a new one.

Record the boss's arrival in the per-frame enemy loop in `update`, guarded so it is written once per appearance:

```ts
      if (e.isBoss && this.caStats.bossSpawnSeconds[e.type] === undefined) {
        this.caStats.bossSpawnSeconds[e.type] = this.runSeconds;
      }
```

- [ ] **Step 6: Record the prayer flag and the boss-mechanic flags**

In `togglePrayer(id)` (`engine.ts:1238`), on the branch that *activates* a prayer:

```ts
    this.caStats.prayerEverUsed = true;
```

Four boss-mechanic flags. Every site already exists — each line below goes directly beside the code that implements the mechanic:

**`jadHealed`** — `engine.ts:3505-3506`, inside `if (heal > 0) {`, right after `e.hp = Math.min(e.maxHp, e.hp + heal);`. The `heal > 0` guard is what keeps a computed-but-zero heal from setting the flag:

```ts
          this.caStats.bossFlags.jadHealed = true;
```

**`hydraVentsBroken`** — in `shatterHydraVent(e)` (`engine.ts:3443`), after `st.shattered = (st.shattered ?? 0) + 1;` (`:3447`):

```ts
    this.caStats.bossFlags.hydraVentsBroken += 1;
```

**`hydraVentHealed`** — `engine.ts:3406-3407`, where the vent regen is applied. Guard on the heal being real, since `hydraVentHeal` scales with `dt`:

```ts
      if (heal > 0) this.caStats.bossFlags.hydraVentHealed = true;
```

**`duskDawnClean`** — in `reviveTwin(e)` (`engine.ts:~3160`, called from `:3134`), at the top of the method:

```ts
    this.caStats.bossFlags.duskDawnClean = false;
```

Setting it inside `reviveTwin` rather than at the call site covers every path that hauls a Guardian back up, now and later.

- [ ] **Step 7: Typecheck and verify nothing regressed**

Run: `npx tsc --noEmit` — expected clean.
Run: `npx vitest run` — expected: the full suite green (737 tests before this feature, plus the new file's cases). No existing test should change.

- [ ] **Step 8: Commit**

```bash
git add lib/game/core/engine.ts
git commit -m "feat(achievements): record Combat Achievement run facts in the engine"
```

---

### Task 6: Checkpoints, popup, and the UI boundary

**Files:**
- Modify: `lib/game/core/engine.ts`

**Interfaces:**
- Consumes: `caStats` from Task 5; `evaluate` from Task 1.
- Produces: `UIState.achievements: string[]`; `UnlockItem.kind` widened to `'prayer' | 'achievement'`; `GameEngine.achievements: Set<string>` seeded from the save; a `seedAchievements(ids: string[])` entry point for `GameRoot` to hydrate the account store.

- [ ] **Step 1: Widen `UnlockItem` and add the state**

`UnlockItem` is at `engine.ts:106-111`. Change:

```ts
export interface UnlockItem {
  kind: 'prayer' | 'achievement';
  name: string;
  desc: string;
  icon: string;
}
```

Add to `UIState` (the interface holding `unlocks` / `unlockSeq`):

```ts
  /** Completed Combat Achievement ids, account-wide. Plain array: the snapshot
   *  crosses the boundary structuredClone'd. */
  achievements: string[];
```

Add the engine field and its seeder, beside `killCounts` (`engine.ts:825`, which is documented as account-wide and NOT cleared on restart — `achievements` behaves identically):

```ts
  /** Completed Combat Achievements. Account-wide: seeded from the save, persisted
   *  by the UI, and NOT cleared on restart. */
  achievements = new Set<string>();

  /** Hydrate the account's completed achievements from storage. */
  seedAchievements(ids: string[]) {
    this.achievements = new Set(ids);
  }
```

Add to `snapshot()` (`engine.ts:1060`), beside `killCounts`:

```ts
      achievements: [...this.achievements],
```

Add `achievements: []` to the `EMPTY_UI` literal in `components/game/GameRoot.tsx` (the object starting at `GameRoot.tsx:300`), beside `killCounts: {}`.

- [ ] **Step 2: Add the checkpoint method**

Add to `GameEngine`, next to `checkPrayerUnlocks` (`engine.ts:1176`):

```ts
  /** Combat Achievements checkpoint: evaluate the ruleset against this run's
   *  recorded facts and celebrate whatever just completed. Cheap enough to call
   *  at every wave end, boss death and run end — `evaluate` is pure and the table
   *  is 40 entries. Caller is responsible for the follow-up `emit`. */
  private checkAchievements() {
    const gained = evaluate(this.caStats, { completed: this.achievements });
    if (gained.length === 0) return;
    for (const id of gained) this.achievements.add(id);
    this.announceUnlocks(gained.map((id) => {
      const task = CA_TASKS.find((t) => t.id === id)!;
      return { kind: 'achievement' as const, name: task.name, desc: task.desc, icon: CA_TIER_ICON[task.tier] };
    }));
  }
```

Import at the top:

```ts
import { evaluate, CA_TIER_ICON } from '../systems/combat-achievements';
import { CA_TASKS } from '../data/combat-achievements';
```

`CA_TIER_ICON` does not exist yet — add it to `lib/game/systems/combat-achievements.ts`:

```ts
/** Per-tier popup icon. Filled in by the asset step below; an empty string renders
 *  no icon, which the unlock popup already tolerates. */
export const CA_TIER_ICON: Record<CaTier, string> = {
  easy: '', medium: '', hard: '', elite: '', master: '', grandmaster: '',
};
```

- [ ] **Step 3: Source the tier icons from the OSRS cache**

Run: `npm run extract:sprites`

Then locate the Combat Achievements interface sprites among the extracted output and wire their paths into `CA_TIER_ICON`, following how `lib/game/assets.ts` exposes other extracted sprites.

**If the Combat Achievements tier sprites cannot be found in the cache, stop and ask the user.** Do not hot-link a wiki image, do not draw a substitute, and do not ship a generic icon in their place. Leaving `CA_TIER_ICON` as empty strings and asking is the correct outcome — the popup renders without an icon and nothing breaks.

- [ ] **Step 4: Call the checkpoint at the three sites**

**Wave end** — in `checkWaveEnd()`, after the fact-recording block added in Task 5 Step 2 and after the victory latch at `engine.ts:5223-5229`, but before the closing `this.emit();` at `engine.ts:5230`:

```ts
    this.checkAchievements();
```

Placing it after the victory latch matters: a win recorded on this wave must be visible to `evaluate` in the same checkpoint, or every win-gated task would wait a wave.

**Boss death** — in the kill block, immediately after the `bossesKilledThisRun` update (`engine.ts:5005-5009`):

```ts
      if (enemy.isBoss) this.checkAchievements();
```

**Run end** — the victory latch is inside `checkWaveEnd`, so the wave-end call above already covers it. No separate site is needed. (The spec lists three checkpoints; two call sites cover them because victory is declared during wave end.)

- [ ] **Step 5: Verify with a headless probe**

The engine has no unit tests, so verify the wiring by driving the game. Use the `game-verify` skill's harness.

Run: `npm run build`

Create `scripts/dev/tmp-ca.mjs`:

```js
import { withGame } from './harness.mjs';

await withGame(async ({ page, sleep }) => {
  // Reach wave 20 the fast way: drive the engine directly through the debug console.
  const got = await page.evaluate(async () => {
    const e = window.__engine;
    if (!e) return 'no engine handle';
    e.caStats.maxWaveReached = 20;
    e.caStats.slayerTasksDone = 1;
    e.checkAchievements?.();
    return [...e.achievements];
  });
  console.log('completed ids:', got);
  await sleep(200);
});
```

If `window.__engine` is not exposed, drive the same assertion through whatever handle the debug console (`Ctrl+'`) uses; grep `GameRoot.tsx` for how it reaches `engineRef.current`.

Run: `node scripts/dev/tmp-ca.mjs`
Expected: the printed list contains `ledger-opened` and `first-contract`.

Then **delete the probe** — `scripts/dev/tmp-*.mjs` is not gitignored:

```bash
rm scripts/dev/tmp-ca.mjs
```

- [ ] **Step 6: Run the gate and commit**

Run: `npx tsc --noEmit` — clean.
Run: `npx vitest run` — green.
Run: `npm run build` — exports.

```bash
git add lib/game/core/engine.ts lib/game/systems/combat-achievements.ts components/game/GameRoot.tsx
git commit -m "feat(achievements): evaluate at checkpoints and fire the unlock popup"
```

---

### Task 7: Persistence

**Files:**
- Modify: `components/game/GameRoot.tsx` (`SAVE_KEYS` at `:332`, the loaders around `:345-393`, the persistence effects around `:951`)
- Modify: `lib/game/systems/run-save.ts`
- Test: `lib/game/systems/run-save.test.ts`

**Interfaces:**
- Consumes: `seedAchievements(ids)` and `UIState.achievements` from Task 6; `RunStats` from Task 1.
- Produces: the `osrs_td_achievements` account store; `RunSave.caStats?: RunStats`.

- [ ] **Step 1: Write the failing run-save test**

Append to `lib/game/systems/run-save.test.ts`:

```ts
describe('caStats', () => {
  it('survives a round trip', () => {
    const save = makeSave(); // reuse the file's existing fixture helper
    save.caStats = { ...emptyRunStats('classic', 0), maxWaveReached: 42 };
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back?.caStats?.maxWaveReached).toBe(42);
  });

  it('accepts a save with no caStats at all', () => {
    const save = makeSave();
    delete (save as { caStats?: unknown }).caStats;
    const back = sanitizeRunSave(JSON.parse(JSON.stringify(save)));
    expect(back).not.toBeNull();
    expect(back?.caStats).toBeUndefined();
  });

  it('keeps the version at 3', () => {
    expect(RUN_SAVE_VERSION).toBe(3);
  });
});
```

Match the file's existing fixture helper name and imports — read the top of `run-save.test.ts` and reuse what is there rather than inventing a second builder.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/game/systems/run-save.test.ts`
Expected: FAIL — `caStats` is not a field of `RunSave`.

- [ ] **Step 3: Add the optional field**

In `lib/game/systems/run-save.ts`, add to the `RunSave` interface beside the other optional fields (`lootBag?`, `cardRollsBought?`):

```ts
  /** Combat Achievement facts for the run in progress. Optional on purpose:
   *  RUN_SAVE_VERSION stays 3, so a run saved before this feature still resumes —
   *  it simply restarts its CA counters. Bumping the version would invalidate
   *  every save currently in a player's browser. */
  caStats?: RunStats;
```

Import the type:

```ts
import type { RunStats } from './combat-achievements';
```

Write it in the save builder (where `lootBag` and `cardRollsBought` are written) as `caStats: engine.caStats`, and restore it in the engine's load path (`engine.ts:5575`, beside `this.cardRollsBought = save.cardRollsBought ?? 0;`):

```ts
    this.caStats = save.caStats ?? emptyRunStats(this.gameMode, this.difficultyTier);
```

**Do not change `RUN_SAVE_VERSION`.** It stays 3.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/game/systems/run-save.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the account store**

In `components/game/GameRoot.tsx`, extend `SAVE_KEYS` (`:332`):

```ts
const SAVE_KEYS = { essence: 'osrs_td_essence', upgrades: 'osrs_td_upgrades', killCounts: 'osrs_td_killcounts', cardCounts: 'osrs_td_cardcounts', bossesSeen: 'osrs_td_bosses_seen', victories: 'osrs_td_victories', run: 'osrs_td_run', difficulty: 'osrs_td_difficulty', achievements: 'osrs_td_achievements' } as const;
```

Add the loader beside `loadVictories` / `loadDifficulty` (`:345`, `:368`), in the same tolerant shape:

```ts
/** Completed Combat Achievement ids. Unknown ids are kept as-is and simply never
 *  match a task — a retired task must not break the log. */
function loadAchievements(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEYS.achievements) ?? 'null');
    if (raw && Array.isArray(raw.completed)) {
      return raw.completed.filter((id: unknown): id is string => typeof id === 'string');
    }
  } catch { /* ignore */ }
  return [];
}
```

Seed the engine where the other account data is seeded (the same effect that seeds `killCounts`, around `:951`), calling `engine.seedAchievements(loadAchievements())`, and persist on change with an effect mirroring the `killCounts` one:

```ts
  useEffect(() => {
    if (ui.achievements.length === 0) return;
    try { localStorage.setItem(SAVE_KEYS.achievements, JSON.stringify({ completed: ui.achievements })); }
    catch { /* ignore */ }
  }, [ui.achievements]);
```

- [ ] **Step 6: Verify persistence in the browser**

Run: `npm run build`

Create `scripts/dev/tmp-ca-persist.mjs`:

```js
import { withGame } from './harness.mjs';

await withGame(async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('osrs_td_achievements', JSON.stringify({ completed: ['ledger-opened', 'bogus-id'] }));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  const seeded = await page.evaluate(() => JSON.parse(localStorage.getItem('osrs_td_achievements')).completed);
  console.log('after reload:', seeded);
});
```

Run: `node scripts/dev/tmp-ca-persist.mjs`
Expected: the list still contains `ledger-opened` — the unknown `bogus-id` must not throw, and the store must not be wiped on load.

Then delete the probe: `rm scripts/dev/tmp-ca-persist.mjs`

- [ ] **Step 7: Run the gate and commit**

Run: `npx tsc --noEmit` — clean. `npx vitest run` — green. `npm run build` — exports.

```bash
git add components/game/GameRoot.tsx lib/game/systems/run-save.ts lib/game/systems/run-save.test.ts lib/game/core/engine.ts
git commit -m "feat(achievements): persist completed achievements and run facts"
```

---

### Task 8: Collection Log tab, titles, and the tutorial mirror

**Files:**
- Modify: `components/game/GameRoot.tsx` (tab state `:682`, `UNLOCK_LABEL` `:330`, the log window `~:5260-5320`, the victory screen, the start screen, `LEARN_STEPS` and `TLDR`)

**Interfaces:**
- Consumes: `ui.achievements` from Task 6; `CA_TASKS` from Task 1; `CA_TIERS`, `CA_TIER_NAMES`, `tierProgress`, `highestTitle` from Task 1.
- Produces: no new exported symbols — this is the presentation layer.

- [ ] **Step 1: Label the popup**

`UNLOCK_LABEL` at `GameRoot.tsx:330` is `Record<UnlockItem['kind'], string>`, so widening `kind` in Task 6 already made this a type error the build catches. Add the entry:

```ts
const UNLOCK_LABEL: Record<UnlockItem['kind'], string> = {
  prayer: 'Prayer Unlocked',
  achievement: 'Combat Achievement',
};
```

- [ ] **Step 2: Add the tab**

Widen the tab state at `GameRoot.tsx:682`:

```ts
  const [logTab, setLogTab] = useState<'bosses' | 'monsters' | 'cards' | 'victories' | 'difficulty' | 'achievements'>('monsters');
```

Add the tab button to the log window's tab strip, matching the markup of the existing `difficulty` tab exactly — same `rs-tab` classes, same active handling — with the label `Achievements`.

- [ ] **Step 3: Render the tab body**

In the log window component (`GameRoot.tsx:~5260`), add a branch for `tab === 'achievements'` that renders six tier sections in `CA_TIERS` order:

```tsx
{CA_TIERS.map((tier) => {
  const p = progress[tier];
  const tasks = CA_TASKS.filter((t) => t.tier === tier);
  const cleared = p.done === p.total;
  return (
    <div key={tier} className="mb-3">
      <div className="rs-panel-title flex items-center justify-between">
        <span>{CA_TIER_NAMES[tier]}</span>
        <span className="rs-num">{p.done}/{p.total}{cleared ? ' — Title earned' : ''}</span>
      </div>
      <div className="rs-progress"><div className="rs-progress-fill" style={{ width: `${(p.done / p.total) * 100}%` }} /></div>
      {tasks.map((t) => {
        const done = completed.has(t.id);
        return (
          <div key={t.id} style={{ opacity: done ? 1 : 0.45 }} className="flex justify-between gap-2">
            <span>{t.name}{t.mode ? ` (${t.mode === 'classic' ? 'Classic' : 'Roguelite'})` : ''}</span>
            <span>{t.desc}</span>
          </div>
        );
      })}
    </div>
  );
})}
```

Derive `completed` as `new Set(ui.achievements)` and `progress` as `tierProgress(completed)` in the component, memoised on `ui.achievements`.

Match the surrounding file's actual styling idiom — read the `difficulty` tab's body and mirror its structure rather than importing new classes. The greyed-incomplete treatment (`opacity: 0.45`) must match how the log already renders a never-encountered enemy; if that file uses a different value or a class, use that one.

- [ ] **Step 4: Show the title**

Compute `highestTitle(new Set(ui.achievements))` and render `CA_TIER_NAMES[title]` when it is non-null:

- on the **victory screen**, beside the existing run summary;
- on the **start screen**, under the heading.

Both are cosmetic text. Do not gate any control, mode, or difficulty tier on it.

- [ ] **Step 5: Mirror the tutorial**

`LEARN_STEPS` and `TLDR` both live in `GameRoot.tsx` and must describe the same interface (see the `game-ui` skill). Find the existing Collection Log sentence in each — the `TLDR` one is at `GameRoot.tsx:4331`, which already names the Victories and Difficulty tabs — and extend both to mention the Combat Achievements tab and that clearing a tier grants a cosmetic title.

Do not add a new `data-tut` anchor; the Collection Log is reached from the existing `help`/bottom-bar anchors.

- [ ] **Step 6: Verify the tab renders**

Run: `npm run build`
Run: `node scripts/screenshot-ui.mjs`

Then open the Collection Log's Achievements tab in a probe and read the PNG to confirm: six tier headings, progress numbers, and that incomplete tasks are legible rather than invisible. Write the probe to `scripts/dev/tmp-ca-ui.mjs`, print terse facts, read the screenshot, and **delete the probe** before committing.

Watch for the trap that `overflow-y-auto` clips `position: absolute` descendants — if a tooltip is added here, anchor it to a non-scrolling `relative` ancestor.

- [ ] **Step 7: Run the gate and commit**

Run: `npx tsc --noEmit` — clean. `npx vitest run` — green. `npm run build` — exports.

```bash
git add components/game/GameRoot.tsx
git commit -m "feat(achievements): Collection Log tab, tier titles and tutorial mirror"
```

---

### Task 9: Close the roadmap entry

**Files:**
- Modify: `docs/feedback-ledger.md`

**Interfaces:**
- Consumes: nothing. Documentation only.

- [ ] **Step 1: Flip the M2 row**

`docs/feedback-ledger.md` line 104 reads:

```
6. **M2** combat achievements (`data/achievements.ts` exists, not wired into the new core) — later.
```

Replace it with a shipped line naming the real commit range, in the style of the entries above it (e.g. item 3, which cites `d815c10`), and stating what shipped: 40 tasks across six tiers, cosmetic tier titles, a Collection Log tab. Note that the legacy `data/achievements.ts` was deliberately left alone and that the new table lives at `lib/game/data/combat-achievements.ts`.

- [ ] **Step 2: Commit**

```bash
git add docs/feedback-ledger.md
git commit -m "docs: mark M2 combat achievements as shipped"
```

---

## Done

After Task 9, run the full gate once more on the finished branch (`npx tsc --noEmit`, `npx vitest run`, `npm run build`), then use **superpowers:finishing-a-development-branch** to decide how the work lands. Do not push to `main` without the user's explicit go-ahead.

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

/** Per-tier popup icon. An empty string renders no icon, which the unlock popup
 *  already tolerates — assets must come from the OSRS cache, never a substitute. */
export const CA_TIER_ICON: Record<CaTier, string> = {
  easy: '', medium: '', hard: '', elite: '', master: '', grandmaster: '',
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
    /** A Summoned Soul was still alive when Cerberus raised the next trio, or when
     *  Cerberus himself died. */
    cerberusSoulSurvived: boolean;
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
      duskDawnClean: true, cerberusSoulSurvived: false,
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

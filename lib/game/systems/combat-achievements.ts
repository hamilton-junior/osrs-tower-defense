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
import type { BiomeId } from '../data/biomes';
import { CA_TASKS } from '../data/combat-achievements';
import { ASSETS } from '../assets';

export type CaTier = 'easy' | 'medium' | 'hard' | 'elite' | 'master' | 'grandmaster';

/** Ladder order — every consumer iterates this, never Object.keys. */
export const CA_TIERS: readonly CaTier[] = ['easy', 'medium', 'hard', 'elite', 'master', 'grandmaster'];

/** Display name = the title granted by clearing the tier. */
export const CA_TIER_NAMES: Record<CaTier, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
  elite: 'Elite', master: 'Master', grandmaster: 'Grandmaster',
};

/** Per-tier popup icon: the game's own CaTierSwords blades, extracted from the
 *  cache (see scripts/extract-osrs-sprites.mjs). */
export const CA_TIER_ICON: Record<CaTier, string> = ASSETS.achievements;

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
 * What a run did inside one region. Every region-flavoured fact lives here rather
 * than in a field of its own, so a task that asks "in Morytania" reads one object
 * and nothing has to be added per region. Filled lazily by {@link regionTally}:
 * a region the run never entered simply has no entry.
 */
export interface RegionStats {
  kills: number;
  /** Kills here, by monster. What lets a diary task name a local monster —
   *  "40 Gargoyles in Morytania" — instead of counting anything that walked past. */
  killsByType: Partial<Record<EnemyType, number>>;
  /** Waves finished while the run was in this region. */
  wavesCleared: number;
  /** Of those, the ones that cost no life. */
  cleanWaves: number;
  livesLost: number;
  /** Bosses put down here, by type — a set in spirit, an array so it clones. */
  bosses: EnemyType[];
  /** Skilling done here: fish landed, herbs pulled, traps sprung, potions brewed. */
  fish: number;
  herbs: number;
  traps: number;
  potions: number;
}

export function emptyRegionStats(): RegionStats {
  return { kills: 0, killsByType: {}, wavesCleared: 0, cleanWaves: 0, livesLost: 0, bosses: [], fish: 0, herbs: 0, potions: 0, traps: 0 };
}

/** The region's tally, created on first use. The one way to reach `s.regions`:
 *  every caller writes through it, so no site has to handle the empty case. */
export function regionTally(s: RunStats, biome: BiomeId): RegionStats {
  return (s.regions[biome] ??= emptyRegionStats());
}

/** A shared all-zero tally, for reading a region the run never entered. Frozen
 *  because every unvisited read hands back this same object — a caller that
 *  wrote to it would be writing to every other region at once. */
const NO_REGION: RegionStats = Object.freeze({ ...emptyRegionStats(), killsByType: Object.freeze({}) }) as RegionStats;

/** The region's tally for **reading**, without creating one. A region the run has
 *  never entered reads as all zeroes, so a check never has to test for absence. */
export function readRegion(s: RunStats, biome: BiomeId): RegionStats {
  return s.regions[biome] ?? NO_REGION;
}

/** Record that the run is now in `biome`: opens its tally and remembers the visit.
 *  Idempotent, so every site that sets the region can call it without checking. */
export function visitRegion(s: RunStats, biome: BiomeId) {
  regionTally(s, biome);
  if (!s.biomesVisited.includes(biome)) s.biomesVisited.push(biome);
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
  /** Two towers with nothing left to upgrade stood on the board at the same time.
   *  The gate on tower fusion (see systems/tower-fusion). Latches true. */
  twoMaxedAtOnce: boolean;
  /** Kills credited to the tower that landed the killing blow, by tower id. */
  killsByTower: Record<string, number>;
  /** Distinct combat styles of every tower built this run. */
  stylesUsed: CombatStyle[];

  slayerTasksDone: number;

  /** Per-region tally — see {@link RegionStats}. The Achievement Diaries read it. */
  regions: Partial<Record<BiomeId, RegionStats>>;
  /** Every region the run has set foot in, in order of arrival and never repeated. */
  biomesVisited: BiomeId[];

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
    /** The King Black Dragon's fire caught at least one tower in its reach. */
    kbdTowerScorched: boolean;
    /** A Dark energy core held a tower long enough to heal the Corporeal Beast at least
     *  once — i.e. the player let a core fire the tower's shot back at them. */
    corpSiphonHeld: boolean;
    /** All three of General Graardor's sergeants were cut down while he was still
     *  standing — the fight solved the way it is built to be solved. */
    graardorGuardsWiped: boolean;
    /** Every one of Nex's four wards was broken by killing its acolyte — none of them
     *  timed out. The fight solved rather than waited out. */
    nexAllWardsBroken: boolean;
  };
}

export interface CaAccount {
  completed: ReadonlySet<string>;
}

export function emptyRunStats(mode: GameMode, tier: DifficultyTier): RunStats {
  return {
    mode, tier, runPhase: 'normal', won: false, runSeconds: 0, maxWaveReached: 1,
    livesLostRun: 0, livesLostThisWave: 0, cleanWaveStreak: 0,
    towersBuilt: 0, towersSold: 0, maxTowersOnField: 0, hadAllSixAtOnce: false, twoMaxedAtOnce: false,
    killsByTower: {}, stylesUsed: [],
    slayerTasksDone: 0, prayerEverUsed: false, prayerActiveAtWaveEnd: false,
    regions: {}, biomesVisited: [],
    bossKillSeconds: {}, bossSpawnSeconds: {}, livesLostDuringBoss: {},
    bossFlags: {
      jadHealed: false, hydraVentsBroken: 0, hydraVentHealed: false,
      duskDawnClean: true, cerberusSoulSurvived: false, kbdTowerScorched: false,
      corpSiphonHeld: false, graardorGuardsWiped: false, nexAllWardsBroken: false,
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

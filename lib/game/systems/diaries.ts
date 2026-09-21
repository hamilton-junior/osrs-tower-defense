/**
 * **Achievement Diaries** — the region-flavoured half of the achievement system.
 *
 * Where a Combat Achievement asks what the run did, a diary task asks *where* it
 * did it: forty Gargoyles in Morytania, ten clean waves in the Wilderness. The
 * facts come out of {@link RunStats.regions}, which the engine fills as the run
 * travels (see `combat-achievements.regionTally`).
 *
 * One diary per real OSRS diary, not one per biome. Mor Ul Rek is not its own
 * diary in OSRS — the TzHaar tasks sit in Karamja's Elite tier — so the TzHaar
 * Caverns belong to the Karamja diary here too, and that diary reads both its
 * regions. Never invent a tier or a diary the game does not have.
 *
 * Like the Combat Achievements, completion is **account-wide** and a task is
 * satisfied by a single run: the ids live in `AccountSave.diaries`, the facts
 * live in the run that is being played, and finishing a task is permanent.
 *
 * This module is pure. The table it evaluates is content and lives in
 * `data/diaries.ts`.
 */
import { ASSETS } from '../assets';
import { DIARIES } from '../data/diaries';
import type { BiomeId } from '../data/biomes';
import { emptyRegionStats, readRegion, type RegionStats, type RunStats } from './combat-achievements';

/** Four tiers, exactly the four OSRS diaries have. */
export type DiaryTier = 'easy' | 'medium' | 'hard' | 'elite';

/** Ladder order — every consumer iterates this, never Object.keys. */
export const DIARY_TIERS: readonly DiaryTier[] = ['easy', 'medium', 'hard', 'elite'];

export const DIARY_TIER_NAMES: Record<DiaryTier, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard', elite: 'Elite',
};

/** The Combat Achievement tier blades, reused: the four names are the same four
 *  tiers, and the popup reads as "a tier of something was completed" either way. */
export const DIARY_TIER_ICON: Record<DiaryTier, string> = {
  easy: ASSETS.achievements.easy,
  medium: ASSETS.achievements.medium,
  hard: ASSETS.achievements.hard,
  elite: ASSETS.achievements.elite,
};

export interface DiaryTask {
  /** Stable id — this is the persisted key. Never rename one in place. */
  id: string;
  tier: DiaryTier;
  /** English, OSRS-flavoured. Shown in the popup and the log. */
  name: string;
  /** One line saying exactly how to complete it. */
  desc: string;
  /**
   * `here` is the diary's own regions, summed — for a one-region diary that is
   * simply that region's tally. A task that means one specific region (Karamja's
   * Elite tier, which is set in Mor Ul Rek) reads `s` with `readRegion` instead.
   */
  check(s: RunStats, here: RegionStats): boolean;
}

/**
 * What finishing a diary's tiers is worth: the region's own OSRS reward item,
 * worn by the whole board but **only while the run is in that diary's region**.
 *
 * `perTier` is the fraction each completed tier adds, so the item grows the way
 * the real one does — Explorer's ring 1 through 4, and no further. Nothing here
 * pays gold: a diary is worth a board that fights better at home.
 */
export interface DiaryReward {
  /** The OSRS item, named as the game names it. */
  item: string;
  /** Its baked inventory icon (`ASSETS.items.*`). */
  icon: string;
  /** One plain sentence for the log. Numbers stay out of it. */
  blurb: string;
  /** Per completed tier, as a fraction. An absent stat is untouched. */
  perTier: { damage?: number; range?: number; fireRate?: number };
}

export interface Diary {
  /** Stable id, also the persisted task-id prefix. */
  id: string;
  /** The real OSRS diary's name. */
  name: string;
  /** The regions its tasks are set in, in the order the log lists them. */
  biomes: readonly BiomeId[];
  /** What its tiers pay, in its own region. */
  reward: DiaryReward;
  tasks: readonly DiaryTask[];
}

/** Board-wide multipliers, the shape `calculateTowerStats` takes. */
export interface DiaryMods { damage: number; range: number; fireRate: number }

export const NO_DIARY_MODS: DiaryMods = { damage: 1, range: 1, fireRate: 1 };

/**
 * The diary's regions as one tally. Only Karamja has two (the jungle and the
 * TzHaar Caverns below it); everything else short-circuits to the one region.
 */
export function mergeRegions(s: RunStats, biomes: readonly BiomeId[]): RegionStats {
  if (biomes.length === 1) return readRegion(s, biomes[0]);
  const out = emptyRegionStats();
  for (const b of biomes) {
    const r = readRegion(s, b);
    out.kills += r.kills;
    out.wavesCleared += r.wavesCleared;
    out.cleanWaves += r.cleanWaves;
    out.livesLost += r.livesLost;
    out.fish += r.fish;
    out.herbs += r.herbs;
    out.traps += r.traps;
    out.potions += r.potions;
    for (const t of r.bosses) if (!out.bosses.includes(t)) out.bosses.push(t);
    for (const [type, n] of Object.entries(r.killsByType)) {
      const key = type as keyof typeof out.killsByType;
      out.killsByType[key] = (out.killsByType[key] ?? 0) + (n ?? 0);
    }
  }
  return out;
}

/**
 * Ids satisfied now and not already completed. Pure: never mutates `completed`.
 *
 * One pass is enough — unlike a Combat Achievement, no diary task depends on
 * another having completed first.
 */
export function evaluateDiaries(s: RunStats, completed: ReadonlySet<string>): string[] {
  const gained: string[] = [];
  for (const diary of DIARIES) {
    const here = mergeRegions(s, diary.biomes);
    for (const task of diary.tasks) {
      if (completed.has(task.id)) continue;
      if (task.check(s, here)) gained.push(task.id);
    }
  }
  return gained;
}

/** Find a task by its persisted id, or undefined if the id has been retired. */
export function diaryTaskById(id: string): { diary: Diary; task: DiaryTask } | undefined {
  for (const diary of DIARIES) {
    const task = diary.tasks.find((t) => t.id === id);
    if (task) return { diary, task };
  }
  return undefined;
}

/** Per-tier completion counts for one diary, for the log's progress bars. */
export function diaryProgress(
  diary: Diary,
  completed: ReadonlySet<string>,
): Record<DiaryTier, { done: number; total: number }> {
  const out = {} as Record<DiaryTier, { done: number; total: number }>;
  for (const tier of DIARY_TIERS) {
    const tasks = diary.tasks.filter((t) => t.tier === tier);
    out[tier] = { done: tasks.filter((t) => completed.has(t.id)).length, total: tasks.length };
  }
  return out;
}

/**
 * How many tiers of `diary` are paid out: the strict ladder's depth, 0 to 4.
 * Easy alone pays 1; Hard finished with a Medium task still open pays 1, not 3.
 */
export function diaryTiersEarned(diary: Diary, completed: ReadonlySet<string>): number {
  const reached = diaryTierReached(diary, completed);
  return reached === null ? 0 : DIARY_TIERS.indexOf(reached) + 1;
}

/**
 * Every diary reward the board is wearing right now, as one set of multipliers.
 *
 * A reward only counts in its own region, so travelling out of Morytania puts
 * the legs away until the run comes back. Karamja's gloves read both of its
 * regions, the jungle and the caverns below it — one diary, one reward.
 */
export function diaryTowerMods(completed: ReadonlySet<string>, biome: BiomeId): DiaryMods {
  const out: DiaryMods = { ...NO_DIARY_MODS };
  for (const diary of DIARIES) {
    if (!diary.biomes.includes(biome)) continue;
    const tiers = diaryTiersEarned(diary, completed);
    if (tiers === 0) continue;
    const { damage = 0, range = 0, fireRate = 0 } = diary.reward.perTier;
    out.damage *= 1 + damage * tiers;
    out.range *= 1 + range * tiers;
    out.fireRate *= 1 + fireRate * tiers;
  }
  return out;
}

/**
 * The highest tier of `diary` completed in full, or null.
 *
 * The ladder is strict, the way OSRS reads it: Hard done with one Medium task
 * still open leaves the diary on nothing, because a diary is only as finished as
 * its lowest unfinished tier.
 */
export function diaryTierReached(diary: Diary, completed: ReadonlySet<string>): DiaryTier | null {
  const progress = diaryProgress(diary, completed);
  let reached: DiaryTier | null = null;
  for (const tier of DIARY_TIERS) {
    const { done, total } = progress[tier];
    if (total === 0 || done < total) break;
    reached = tier;
  }
  return reached;
}

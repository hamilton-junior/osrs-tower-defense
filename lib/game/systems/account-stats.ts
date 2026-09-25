/**
 * What the account has to show for itself, read off the records it already keeps.
 *
 * Every figure here is a tally the game was storing anyway — victories, kill
 * counts, bosses seen, achievement ids, New Game+ progress. Nothing new is
 * counted, so the Account tab costs no new save field and no new bookkeeping.
 *
 * Pure: hand it the stores, get the numbers back.
 */
import type { DifficultyProgress, Victories } from './account-save';

/** The account's numbers, unformatted — the interface decides how to print them. */
export interface AccountStats {
  /** Runs won, all modes. */
  wins: number;
  winsClassic: number;
  winsRoguelite: number;
  /** Fastest victory in simulated seconds, or null with no win yet. */
  fastestSeconds: number | null;
  /** Furthest wave reached in Endless. */
  bestEndlessWave: number;
  /** Every enemy killed on this account, all runs. */
  kills: number;
  /** How many *kinds* of enemy have been killed — the Collection Log's breadth. */
  killKinds: number;
  /** How many kinds of boss have been met. */
  bossKinds: number;
  /** Combat Achievements completed. */
  achievements: number;
  /** Achievement Diary tasks completed. */
  diaries: number;
  /** Highest New Game+ tier cleared in either mode (-1 = none). */
  bestTier: number;
}

/** A `{ id: count }` tally, as the browser stores it. */
type Tally = Record<string, number>;

/** Sum a tally, ignoring anything that is not a positive number on disk. */
function sum(tally: Tally): number {
  let total = 0;
  for (const n of Object.values(tally)) if (Number.isFinite(n) && n > 0) total += n;
  return total;
}

/** How many ids the tally actually has a count for. */
function kinds(tally: Tally): number {
  let count = 0;
  for (const n of Object.values(tally)) if (Number.isFinite(n) && n > 0) count++;
  return count;
}

export function accountStats(input: {
  victories: Victories;
  killCounts: Tally;
  bossesSeen: Tally;
  achievements: readonly string[];
  diaries: readonly string[];
  difficulty: DifficultyProgress;
}): AccountStats {
  const { victories, killCounts, bossesSeen, achievements, diaries, difficulty } = input;
  return {
    wins: victories.total,
    winsClassic: victories.byMode.classic,
    winsRoguelite: victories.byMode.roguelite,
    fastestSeconds: victories.fastestSeconds,
    bestEndlessWave: victories.highestEndlessWave,
    kills: sum(killCounts),
    killKinds: kinds(killCounts),
    bossKinds: kinds(bossesSeen),
    achievements: achievements.length,
    diaries: diaries.length,
    bestTier: Math.max(difficulty.highestCleared.classic, difficulty.highestCleared.roguelite),
  };
}

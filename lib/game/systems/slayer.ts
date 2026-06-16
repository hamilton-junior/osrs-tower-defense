import type { EnemyDef, EnemyType, SlayerTask } from '../types';
import type { SlayerMaster } from '../data/slayer';

export interface RollSlayerTaskOptions {
  /** Every enemy definition (e.g. `Object.values(ENEMIES)`). */
  enemies: EnemyDef[];
  wave: number;
  /** Previous task target — never assigned twice in a row. */
  lastTaskType: EnemyType | null;
  blockedEnemies: string[];
  /** Task types the player has paid to extend (doubled count). */
  extendedTasks: string[];
  /** Streak of completed tasks; raises the reward. */
  consecutiveTasks: number;
  /** `GlobalUpgrades.slayerReward` multiplier. */
  slayerRewardMultiplier: number;
  /** Injectable RNG for deterministic tests. */
  rng?: () => number;
}

/**
 * Roll a new Slayer task for `master`, or return `null` if nothing is
 * assignable (no unlocked, unblocked, non-boss, non-repeat enemy in the
 * master's pool). Pure: side effects (setting `lastTaskType`, sound, UI sync)
 * stay in the engine.
 */
export function rollSlayerTask(
  master: SlayerMaster,
  opts: RollSlayerTaskOptions,
): SlayerTask | null {
  const rng = opts.rng ?? Math.random;

  const available = opts.enemies.filter(
    e =>
      e.waveUnlock !== undefined &&
      e.waveUnlock <= opts.wave &&
      e.type !== opts.lastTaskType &&
      !e.isBoss &&
      !opts.blockedEnemies.includes(e.type) &&
      master.taskPool.includes(e.type),
  );
  if (available.length === 0) return null;

  const type = available[Math.floor(rng() * available.length)].type;

  let count = 5 + Math.floor(rng() * 10) + Math.floor(opts.wave / 2);
  if (opts.extendedTasks.includes(type)) count *= 2;

  const streakMultiplier = 1 + opts.consecutiveTasks * 0.1;
  const reward = Math.floor(
    (master.pointsPerTask + count * 0.1) *
      opts.slayerRewardMultiplier *
      streakMultiplier *
      master.bonusMultiplier,
  );

  return { type, count, total: count, reward };
}

import type { EnemyDef, EnemyType } from '../types';
import type { WaveConfig } from '../data/waves';

export interface BuildWaveOptions {
  /** Every enemy definition (e.g. `Object.values(ENEMIES)`). */
  enemies: EnemyDef[];
  /** Enemy types the player has paid to block from spawning. */
  blockedEnemies: string[];
  /** Active Slayer task; its target gets seeded into the wave. */
  slayerTask?: { type: EnemyType; count: number } | null;
  /** Fixed config for a landmark wave; when present it is used verbatim. */
  landmark?: WaveConfig[];
  /** Injectable RNG for deterministic tests. */
  rng?: () => number;
}

/**
 * Decide the `{ type, count }` makeup of a wave. Pure: given the same options
 * and `rng`, it always returns the same configs. The engine turns these into
 * live `Enemy` instances separately.
 *
 * Landmark waves are returned as-is. Otherwise a "budget" that grows with the
 * wave number is spent greedily on spawnable (unlocked, unblocked, non-boss)
 * enemies, weighted toward those unlocked most recently, after first seeding a
 * few of the current Slayer-task target.
 */
export function buildWaveConfigs(waveNum: number, opts: BuildWaveOptions): WaveConfig[] {
  if (opts.landmark) return [...opts.landmark];

  const rng = opts.rng ?? Math.random;
  const configs: WaveConfig[] = [];

  let remainingBudget = 15 + waveNum * 12;

  const spawnable = opts.enemies.filter(
    e => !e.isBoss && (e.waveUnlock || 1) <= waveNum && !opts.blockedEnemies.includes(e.type),
  );

  const addToConfig = (type: EnemyType, count: number) => {
    const existing = configs.find(c => c.type === type);
    if (existing) existing.count += count;
    else configs.push({ type, count });
  };

  // Seed the Slayer-task target so tasks make progress.
  if (opts.slayerTask && opts.slayerTask.count > 0) {
    const target = opts.enemies.find(e => e.type === opts.slayerTask!.type);
    if (target && (target.waveUnlock || 1) <= waveNum) {
      const countToAdd = Math.min(opts.slayerTask.count, Math.floor(rng() * 3) + 1);
      addToConfig(target.type, countToAdd);
      remainingBudget -= target.reward * countToAdd;
    }
  }

  // Spend the remaining budget on weighted-random spawnable enemies.
  while (remainingBudget > 0) {
    const affordable = spawnable.filter(e => e.reward <= remainingBudget);
    if (affordable.length === 0) break;

    // Newer enemies (closer to their unlock wave) get higher weight.
    const weights = affordable.map(e => Math.max(1, 8 - (waveNum - (e.waveUnlock || 1))));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    let roll = rng() * totalWeight;
    let choice = affordable[0];
    for (let i = 0; i < affordable.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        choice = affordable[i];
        break;
      }
    }

    addToConfig(choice.type, 1);
    remainingBudget -= choice.reward;
  }

  return configs;
}

import type { EnemyDef, EnemyType } from '../types';
import type { WaveConfig } from '../data/waves';
import { SCHEDULABLE_BOSSES } from './boss-mechanics';

export interface BuildWaveOptions {
  /** Every enemy definition (e.g. `Object.values(ENEMIES)`). */
  enemies: EnemyDef[];
  /** Enemy types the player has paid to block from spawning. */
  blockedEnemies: string[];
  /** Active Slayer task; its target gets seeded into the wave. */
  slayerTask?: { type: EnemyType; count: number } | null;
  /** Fixed config for a landmark wave; when present it is used verbatim. */
  landmark?: WaveConfig[];
  /** Lifetime boss sightings (the engine's persisted `bossesSeen`). Omit it and the
   *  wave carries no bosses at all — the legacy engine relies on that. */
  bossesSeen?: Record<string, number>;
  /** Injectable RNG for deterministic tests. */
  rng?: () => number;
}

// ────────────────────────────── boss schedule ──────────────────────────────
/** A boss headlines every Nth wave — and no boss ever appears before the first one. */
export const BOSS_WAVE_INTERVAL = 10;
/** Once every boss has been met, each wave rolls this chance to bring *extra*
 *  bosses on top of the one it was already due (a plain wave is due none). */
export const EXTRA_BOSS_CHANCE = 0.15;
/** How many extras that roll can bring: uniformly 0..this, so it can come up dry. */
export const EXTRA_BOSS_MAX = 2;
/** The rank-and-file budget is cut on any wave carrying a boss — the boss is the
 *  act, and the horde should not punish the player twice for the same wave. */
export const BOSS_WAVE_HORDE_MULT = 0.6;

/** Whether `wave` is due its scheduled boss. */
export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % BOSS_WAVE_INTERVAL === 0;
}

/** Bosses never encountered, in the order they should be introduced. */
export function unseenBosses(bossesSeen: Record<string, number>): EnemyType[] {
  return SCHEDULABLE_BOSSES.filter((b) => !bossesSeen[b]) as EnemyType[];
}

/**
 * The bosses a wave brings.
 *
 * - Nothing before {@link BOSS_WAVE_INTERVAL}: the early game stays boss-free.
 * - Every 10th wave is due one boss. While any boss is still unmet it is the
 *   *next unmet* one, so a new account is introduced to them in `SCHEDULABLE_BOSSES`
 *   order — which runs gentlest to hardest — one per boss wave.
 * - Once every boss has been met — `bossesSeen` is lifetime, so a veteran starts
 *   a fresh run already there — the scheduled boss is drawn at random instead,
 *   and *every* wave from wave 10 on rolls {@link EXTRA_BOSS_CHANCE} for
 *   0..{@link EXTRA_BOSS_MAX} extra bosses beyond what it was due. A plain wave
 *   was due none, so that roll is how a boss shows up off-schedule.
 *
 * Pure: the same `rng` yields the same bosses, which is what lets the Start Wave
 * preview promise exactly what will spawn.
 */
export function rollWaveBosses(
  wave: number,
  bossesSeen: Record<string, number>,
  rng: () => number,
): EnemyType[] {
  if (wave < BOSS_WAVE_INTERVAL) return [];
  const pool = SCHEDULABLE_BOSSES as readonly EnemyType[];
  const unseen = unseenBosses(bossesSeen);
  const pick = () => pool[Math.floor(rng() * pool.length)];
  const out: EnemyType[] = [];

  if (isBossWave(wave)) out.push(unseen.length ? unseen[0] : pick());

  // Extras are the endgame regime — they only unlock once nothing is left to meet.
  if (!unseen.length && rng() < EXTRA_BOSS_CHANCE) {
    const extra = Math.floor(rng() * (EXTRA_BOSS_MAX + 1)); // 0..MAX, so it can whiff
    for (let i = 0; i < extra; i++) out.push(pick());
  }
  return out;
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
  const rng = opts.rng ?? Math.random;
  // Landmark waves keep their fixed makeup, but still get the Slayer seed
  // appended below — otherwise a task assigned during the (all-landmark) early
  // waves or at a ×10 wave never makes progress and softlocks.
  // Copy each landmark config (not just the array) so the Slayer-seed merge below
  // never mutates the shared LANDMARK_WAVES table — this runs repeatedly (wave
  // preview + the real start), so aliasing would inflate the fixed counts.
  const configs: WaveConfig[] = opts.landmark ? opts.landmark.map(c => ({ ...c })) : [];

  const addToConfig = (type: EnemyType, count: number) => {
    const existing = configs.find(c => c.type === type);
    if (existing) existing.count += count;
    else configs.push({ type, count });
  };

  // Seed the Slayer-task target so tasks always make progress — the fail-safe
  // against a task whose monster has dropped out of the procedural mix.
  let seedThreat = 0;
  if (opts.slayerTask && opts.slayerTask.count > 0) {
    const target = opts.enemies.find(e => e.type === opts.slayerTask!.type);
    if (target && (target.waveUnlock || 1) <= waveNum) {
      const countToAdd = Math.min(opts.slayerTask.count, Math.floor(rng() * 3) + 1);
      addToConfig(target.type, countToAdd);
      seedThreat = target.reward * countToAdd;
    }
  }

  // Bosses are scheduled, not bought: they never come out of the threat budget
  // (`spawnable` filters them out below), they *shrink* it.
  const bosses = opts.bossesSeen ? rollWaveBosses(waveNum, opts.bossesSeen, rng) : [];
  for (const b of bosses) addToConfig(b, 1);

  // Landmark waves: the fixed set plus the seed, nothing else.
  if (opts.landmark) return configs;

  let remainingBudget = 15 + waveNum * 12 - seedThreat;
  if (bosses.length) remainingBudget = Math.round(remainingBudget * BOSS_WAVE_HORDE_MULT);

  // `reward > 0` is load-bearing, not cosmetic: the loop below only terminates by
  // *spending* the budget, so an enemy that costs nothing (a boss's summon-only
  // escort, e.g. Cerberus's souls) is affordable forever and spends nothing —
  // once the leftover budget drops below the cheapest paying enemy it would be
  // picked every iteration, and the wave build would never return.
  const spawnable = opts.enemies.filter(
    e => !e.isBoss && e.reward > 0
      && (e.waveUnlock || 1) <= waveNum && !opts.blockedEnemies.includes(e.type),
  );

  // Spend the remaining budget on weighted-random spawnable enemies. Every pick costs
  // at least 1, so this is bounded by `remainingBudget` — but bound it explicitly too:
  // a single zero-cost enemy slipping into the pool is the difference between a wave
  // and a frozen tab, and that is too sharp an edge to leave on a content table.
  const maxPicks = remainingBudget + 1;
  for (let picks = 0; remainingBudget > 0 && picks < maxPicks; picks++) {
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

import type { BiomeId } from '../data/biomes';
import type { EnemyDef, EnemyType } from '../types';

/**
 * **Where a monster lives.** The roster is split in two and a monster is only ever
 * one of them:
 *
 * - **Generic** (`region` absent) — rolls on any map. This is the backbone, deep
 *   enough at every wave band that a biome can fill a whole run from it alone.
 * - **Local** (`region` set) — belongs to exactly one region, and is the only reason
 *   that region plays differently from the last one.
 *
 * Everything downstream reads reachability through here rather than testing
 * `def.region` itself, so the rule lives in one place: wave generation spends its
 * budget on reachable monsters, and a Slayer master only assigns what is in reach.
 *
 * Bosses are deliberately left untagged — the boss is the act, the region is the
 * stage — so the boss ladder is unaffected by where a run is fought.
 *
 * See `docs/enemy-roster.md` for the roster itself and the reasoning behind each tag.
 */

/** Whether `def` can appear while the run is in `biome`. Generic monsters always can. */
export function isNative(def: Pick<EnemyDef, 'region'>, biome: BiomeId | undefined): boolean {
  // No biome (a test, or an engine that has not generated its map yet) means no
  // filtering at all — the pre-split behaviour, so nothing can ever spawn empty.
  if (!biome) return true;
  return !def.region || def.region === biome;
}

/** `enemies` narrowed to what `biome` can send: every generic, plus that region's own. */
export function nativeEnemies<T extends Pick<EnemyDef, 'region'>>(enemies: T[], biome: BiomeId | undefined): T[] {
  return biome ? enemies.filter((e) => isNative(e, biome)) : enemies;
}

/** The monsters native to `biome`, by type — the region's own set, generics excluded. */
export function localTypes(enemies: EnemyDef[], biome: BiomeId): EnemyType[] {
  return enemies.filter((e) => e.region === biome).map((e) => e.type);
}

/**
 * The native monster that best stands in for `def` in `biome`.
 *
 * Used to keep the hand-authored opening (waves 1–9) regional: those waves name
 * specific monsters, seven of them local, so without a substitution the scripted
 * ramp would drag every region's monster onto every map — at exactly the waves a
 * player sees first, which is where the biome most needs to read as a place.
 *
 * The stand-in is the native monster of the closest **threat** (`reward`, the weight
 * wave budgets are spent in), so a swapped wave keeps the shape the ramp was tuned
 * to. Ties break toward the closest unlock wave and then alphabetically, and nothing
 * here rolls: the choice must be identical in the Start Wave preview and in the
 * spawn it promises.
 */
export function nativeSubstitute(
  def: EnemyDef,
  enemies: EnemyDef[],
  biome: BiomeId,
  avoid: ReadonlySet<EnemyType> = new Set(),
): EnemyDef | undefined {
  const pool = enemies.filter(
    (e) => isNative(e, biome) && !e.isBoss && !e.summonedBy && e.reward > 0,
  );
  // Prefer something the wave isn't already sending, so a two-monster wave doesn't
  // collapse into one monster twice; fall back to the full pool if that empties it.
  const preferred = pool.filter((e) => !avoid.has(e.type));
  const from = preferred.length ? preferred : pool;
  return [...from].sort(
    (a, b) =>
      Math.abs(a.reward - def.reward) - Math.abs(b.reward - def.reward) ||
      Math.abs((a.waveUnlock ?? 1) - (def.waveUnlock ?? 1)) - Math.abs((b.waveUnlock ?? 1) - (def.waveUnlock ?? 1)) ||
      a.type.localeCompare(b.type),
  )[0];
}

/** A fixed wave rewritten for `biome`: every non-native entry becomes its
 *  {@link nativeSubstitute}, keeping the original count. Entries that collapse onto
 *  the same stand-in are merged, so counts are preserved rather than lost. */
export function localizeWave<C extends { type: EnemyType; count: number }>(
  configs: C[],
  enemies: EnemyDef[],
  biome: BiomeId | undefined,
): C[] {
  if (!biome) return configs;
  const byType = new Map(enemies.map((e) => [e.type, e] as const));
  const used = new Set<EnemyType>(
    configs.filter((c) => isNative(byType.get(c.type) ?? {}, biome)).map((c) => c.type),
  );
  const out: C[] = [];
  for (const cfg of configs) {
    const def = byType.get(cfg.type);
    let type = cfg.type;
    if (def && !isNative(def, biome)) {
      const sub = nativeSubstitute(def, enemies, biome, used);
      if (!sub) continue; // a region with nothing to send at all: drop rather than break the split
      type = sub.type;
      used.add(type);
    }
    const existing = out.find((c) => c.type === type);
    if (existing) existing.count += cfg.count;
    else out.push({ ...cfg, type });
  }
  return out;
}

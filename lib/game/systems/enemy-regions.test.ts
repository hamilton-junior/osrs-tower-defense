import { describe, it, expect } from 'vitest';
import { isNative, nativeEnemies, localTypes, nativeSubstitute, localizeWave } from './enemy-regions';
import { ENEMIES } from '../data/enemies';
import { LANDMARK_WAVES } from '../data/waves';
import { BIOMES, type BiomeId } from '../data/biomes';
import { SLAYER_MASTERS } from '../data/slayer';
import type { EnemyDef, EnemyType } from '../types';

const ALL = Object.values(ENEMIES);
const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
/** Monsters a wave can actually spend its budget on: no bosses, no summons, no freebies. */
const spawnable = (e: EnemyDef) => !e.isBoss && !e.summonedBy && e.reward > 0;

describe('isNative', () => {
  it('lets a generic monster into any region', () => {
    const generic = { region: undefined };
    expect(BIOME_IDS.every((b) => isNative(generic, b))).toBe(true);
  });

  it('keeps a local monster to its own region', () => {
    const local = { region: 'morytania' as BiomeId };
    expect(isNative(local, 'morytania')).toBe(true);
    expect(isNative(local, 'karamja')).toBe(false);
  });

  it('filters nothing when there is no region — the pre-split behaviour', () => {
    expect(isNative({ region: 'tzhaar' as BiomeId }, undefined)).toBe(true);
    expect(nativeEnemies(ALL, undefined)).toHaveLength(ALL.length);
  });
});

describe('the roster split', () => {
  it('tags every local monster with a region that exists', () => {
    for (const def of ALL) {
      if (def.region) expect(BIOME_IDS).toContain(def.region);
    }
  });

  it('leaves bosses untagged, so the boss ladder ignores where a run is fought', () => {
    expect(ALL.filter((e) => e.isBoss && e.region)).toEqual([]);
  });

  it('gives every region a roster deep enough to fill a run on its own', () => {
    // The generic backbone alone must carry a run at every wave band — a region only
    // adds flavour on top. Without this, a region with few locals would run out of
    // monsters to spend a wave budget on and the ramp would flatten.
    for (const biome of BIOME_IDS) {
      const pool = nativeEnemies(ALL, biome).filter(spawnable);
      expect(pool.length, biome).toBeGreaterThanOrEqual(10);
      for (const wave of [1, 2, 5, 10, 20, 50]) {
        const unlocked = pool.filter((e) => (e.waveUnlock ?? 1) <= wave);
        expect(unlocked.length, `${biome} at wave ${wave}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('leaves every Slayer master something to assign in every region', () => {
    for (const biome of BIOME_IDS) {
      for (const master of SLAYER_MASTERS) {
        const assignable = nativeEnemies(ALL, biome)
          .filter(spawnable)
          .filter((e) => master.taskPool.includes(e.type));
        expect(assignable.length, `${master.id} in ${biome}`).toBeGreaterThan(0);
      }
    }
  });

  it('reports a region\u2019s own monsters, generics excluded', () => {
    const mory = localTypes(ALL, 'morytania');
    expect(mory).toContain('ghost' as EnemyType);
    expect(mory).not.toContain('goblin' as EnemyType);
    expect(mory.every((t) => ENEMIES[t].region === 'morytania')).toBe(true);
  });
});

describe('nativeSubstitute', () => {
  it('stands in with a monster the region can actually send', () => {
    const sub = nativeSubstitute(ENEMIES.ghost, ALL, 'karamja');
    expect(sub).toBeDefined();
    expect(isNative(sub!, 'karamja')).toBe(true);
    expect(spawnable(sub!)).toBe(true);
  });

  it('picks the closest threat, so a swapped wave keeps its shape', () => {
    // A late, high-reward monster must not be replaced by a wave-1 goblin.
    const sub = nativeSubstitute(ENEMIES.nechryael, ALL, 'karamja')!;
    const gap = Math.abs(sub.reward - ENEMIES.nechryael.reward);
    const goblinGap = Math.abs(ENEMIES.goblin.reward - ENEMIES.nechryael.reward);
    expect(gap).toBeLessThan(goblinGap);
  });

  it('avoids what the wave already sends, so two entries stay two monsters', () => {
    const first = nativeSubstitute(ENEMIES.ghost, ALL, 'karamja')!;
    const second = nativeSubstitute(ENEMIES.ghost, ALL, 'karamja', new Set([first.type]));
    expect(second!.type).not.toBe(first.type);
  });

  it('is rng-free, so the Start Wave preview matches what spawns', () => {
    const runs = Array.from({ length: 5 }, () => nativeSubstitute(ENEMIES.gargoyle, ALL, 'wilderness')!.type);
    expect(new Set(runs).size).toBe(1);
  });
});

describe('localizeWave', () => {
  it('passes a wave through untouched when every monster is already native', () => {
    const wave = [{ type: 'goblin' as EnemyType, count: 8 }, { type: 'rat' as EnemyType, count: 4 }];
    expect(localizeWave(wave, ALL, 'karamja')).toEqual(wave);
  });

  it('leaves a region\u2019s own monsters alone', () => {
    const wave = [{ type: 'ghost' as EnemyType, count: 8 }];
    expect(localizeWave(wave, ALL, 'morytania')).toEqual(wave);
  });

  it('rewrites the scripted opening for every region without losing a monster', () => {
    for (const biome of BIOME_IDS) {
      for (const [wave, configs] of Object.entries(LANDMARK_WAVES)) {
        const out = localizeWave(configs.map((c) => ({ ...c })), ALL, biome);
        const where = `wave ${wave} in ${biome}`;
        // Same total headcount, and every survivor is something the region can send.
        const total = (cs: { count: number }[]) => cs.reduce((n, c) => n + c.count, 0);
        expect(total(out), where).toBe(total(configs));
        expect(out.every((c) => isNative(ENEMIES[c.type], biome)), where).toBe(true);
        // A two-monster wave must not collapse into one monster twice.
        expect(new Set(out.map((c) => c.type)).size, where).toBe(out.length);
        expect(out.length, where).toBe(configs.length);
      }
    }
  });

  it('does not mutate the shared LANDMARK_WAVES table it was handed a copy of', () => {
    const before = JSON.stringify(LANDMARK_WAVES[6]);
    localizeWave(LANDMARK_WAVES[6].map((c) => ({ ...c })), ALL, 'karamja');
    expect(JSON.stringify(LANDMARK_WAVES[6])).toBe(before);
  });
});

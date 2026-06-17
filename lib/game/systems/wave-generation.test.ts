import { describe, it, expect } from 'vitest';
import type { EnemyDef } from '../types';
import { buildWaveConfigs } from './wave-generation';

// A tiny enemy registry for deterministic tests.
const def = (type: string, reward: number, waveUnlock: number, isBoss = false): EnemyDef =>
  ({ type, name: type, hp: 10, speed: 50, color: '#fff', reward, waveUnlock, isBoss }) as EnemyDef;

const registry: EnemyDef[] = [
  def('goblin', 5, 1),
  def('imp', 12, 3),
  def('boss', 999, 1, true),
];

const totalCount = (configs: { count: number }[]) => configs.reduce((n, c) => n + c.count, 0);

describe('buildWaveConfigs', () => {
  it('returns landmark waves verbatim (as a copy)', () => {
    const landmark = [{ type: 'goblin' as const, count: 8 }];
    const out = buildWaveConfigs(5, { enemies: registry, blockedEnemies: [], landmark });
    expect(out).toEqual(landmark);
    expect(out).not.toBe(landmark); // copy, not the same reference
  });

  it('spends the budget on spawnable enemies', () => {
    const out = buildWaveConfigs(1, { enemies: registry, blockedEnemies: [], rng: () => 0 });
    expect(totalCount(out)).toBeGreaterThan(0);
    // Only goblin is unlocked + affordable on wave 1.
    expect(out.every(c => c.type === 'goblin')).toBe(true);
  });

  it('never includes bosses or locked enemies', () => {
    const out = buildWaveConfigs(1, { enemies: registry, blockedEnemies: [], rng: () => 0 });
    expect(out.some(c => (c.type as string) === 'boss')).toBe(false);
    expect(out.some(c => c.type === 'imp')).toBe(false); // imp unlocks at wave 3
  });

  it('excludes blocked enemy types', () => {
    const out = buildWaveConfigs(10, { enemies: registry, blockedEnemies: ['imp'], rng: () => 0 });
    expect(out.some(c => c.type === 'imp')).toBe(false);
  });

  it('seeds the slayer-task target into the wave', () => {
    const out = buildWaveConfigs(10, {
      enemies: registry,
      blockedEnemies: [],
      slayerTask: { type: 'imp', count: 20 },
      rng: () => 0, // Math.floor(0*3)+1 = 1 seeded target
    });
    const imp = out.find(c => c.type === 'imp');
    expect(imp).toBeDefined();
    expect(imp!.count).toBeGreaterThanOrEqual(1);
  });

  it('seeds the slayer-task target into LANDMARK waves too', () => {
    // Landmark wave has no imps; the task target must still be appended so the
    // task can progress (otherwise it softlocks on every landmark/×10 wave).
    const out = buildWaveConfigs(10, {
      enemies: registry,
      blockedEnemies: [],
      landmark: [{ type: 'goblin' as const, count: 8 }],
      slayerTask: { type: 'imp', count: 20 },
      rng: () => 0,
    });
    expect(out.find(c => c.type === 'goblin')?.count).toBe(8); // landmark preserved
    expect(out.find(c => c.type === 'imp')?.count).toBeGreaterThanOrEqual(1); // seed added
  });

  it('is deterministic for a fixed rng', () => {
    const opts = { enemies: registry, blockedEnemies: [], rng: () => 0.5 };
    expect(buildWaveConfigs(7, opts)).toEqual(buildWaveConfigs(7, opts));
  });
});

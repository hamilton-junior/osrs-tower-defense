import { describe, it, expect } from 'vitest';
import type { EnemyDef } from '../types';
import type { SlayerMaster } from '../data/slayer';
import { rollSlayerTask, RollSlayerTaskOptions } from './slayer';

const def = (type: string, waveUnlock: number, isBoss = false): EnemyDef =>
  ({ type, name: type, hp: 10, speed: 50, color: '#fff', reward: 5, waveUnlock, isBoss }) as EnemyDef;

const registry: EnemyDef[] = [def('goblin', 1), def('rat', 1), def('boss', 1, true)];

const master: SlayerMaster = {
  id: 'turael',
  name: 'Turael',
  levelReq: 1,
  taskPool: ['goblin', 'rat', 'boss'] as EnemyDef['type'][],
  bonusMultiplier: 1,
  pointsPerTask: 2,
};

// rng that yields a fixed queue, then 0.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++] ?? 0;
};

const baseOpts = (over: Partial<RollSlayerTaskOptions> = {}): RollSlayerTaskOptions => ({
  enemies: registry,
  wave: 2,
  lastTaskType: null,
  blockedEnemies: [],
  extendedTasks: [],
  consecutiveTasks: 0,
  slayerRewardMultiplier: 1,
  rng: seq(0, 0), // index 0, count roll 0
  ...over,
});

describe('rollSlayerTask', () => {
  it('assigns a task from the master pool', () => {
    const task = rollSlayerTask(master, baseOpts())!;
    expect(task.type).toBe('goblin');
    expect(task.count).toBe(6); // 5 + floor(0*10) + floor(2/2)
    expect(task.total).toBe(task.count);
    expect(task.reward).toBe(2); // floor((2 + 6*0.1) * 1 * 1 * 1)
  });

  it('returns null when nothing is assignable', () => {
    expect(rollSlayerTask(master, baseOpts({ blockedEnemies: ['goblin', 'rat'] }))).toBeNull();
  });

  it('never assigns bosses', () => {
    // Even forcing the last index, the boss is filtered out before selection.
    const task = rollSlayerTask(master, baseOpts({ rng: seq(0.99, 0) }))!;
    expect(task.type).not.toBe('boss');
  });

  it('does not repeat the previous task type', () => {
    const task = rollSlayerTask(master, baseOpts({ lastTaskType: 'goblin', rng: seq(0, 0) }))!;
    expect(task.type).toBe('rat');
  });

  it('excludes enemies not yet unlocked by wave', () => {
    const opts = baseOpts({ enemies: [def('goblin', 1), def('rat', 99)], rng: seq(0.99, 0) });
    const task = rollSlayerTask(master, opts)!;
    expect(task.type).toBe('goblin');
  });

  it('doubles the count for extended tasks', () => {
    const task = rollSlayerTask(master, baseOpts({ extendedTasks: ['goblin'] }))!;
    expect(task.count).toBe(12); // 6 * 2
  });

  it('scales reward with streak and reward multiplier', () => {
    const task = rollSlayerTask(master, baseOpts({ consecutiveTasks: 5, slayerRewardMultiplier: 2 }))!;
    // floor((2 + 6*0.1) * 2 * (1 + 0.5) * 1) = floor(2.6 * 2 * 1.5) = floor(7.8)
    expect(task.reward).toBe(7);
  });
});

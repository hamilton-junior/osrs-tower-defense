import { describe, it, expect } from 'vitest';
import {
  emptyRunStats, evaluate, tierProgress, earnedTitles, highestTitle,
  CA_TIERS, type RunStats,
} from './combat-achievements';
import { CA_TASKS } from '../data/combat-achievements';

/** A RunStats with the given fields overridden — every test starts from empty. */
const stats = (over: Partial<RunStats> = {}): RunStats => ({ ...emptyRunStats('classic', 0), ...over });
const none = { completed: new Set<string>() };

describe('table integrity', () => {
  it('has unique ids', () => {
    const ids = CA_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses kebab-case ids', () => {
    for (const t of CA_TASKS) expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('only uses known tiers', () => {
    for (const t of CA_TASKS) expect(CA_TIERS).toContain(t.tier);
  });
});

describe('easy tier', () => {
  it('rat-catcher needs Scurrius dead', () => {
    expect(evaluate(stats(), none)).not.toContain('rat-catcher');
    expect(evaluate(stats({ bossKillSeconds: { scurrius: 31 } }), none)).toContain('rat-catcher');
  });

  it('first-contract needs one Slayer task', () => {
    expect(evaluate(stats({ slayerTasksDone: 0 }), none)).not.toContain('first-contract');
    expect(evaluate(stats({ slayerTasksDone: 1 }), none)).toContain('first-contract');
  });

  it('answered-prayer needs a prayer active at wave end', () => {
    expect(evaluate(stats({ prayerActiveAtWaveEnd: false }), none)).not.toContain('answered-prayer');
    expect(evaluate(stats({ prayerActiveAtWaveEnd: true }), none)).toContain('answered-prayer');
  });

  it('full-house needs all six tower types at once', () => {
    expect(evaluate(stats({ hadAllSixAtOnce: false }), none)).not.toContain('full-house');
    expect(evaluate(stats({ hadAllSixAtOnce: true }), none)).toContain('full-house');
  });

  it('not-a-scratch needs one clean wave', () => {
    expect(evaluate(stats({ cleanWaveStreak: 0 }), none)).not.toContain('not-a-scratch');
    expect(evaluate(stats({ cleanWaveStreak: 1 }), none)).toContain('not-a-scratch');
  });

  it('ledger-opened needs wave 20', () => {
    expect(evaluate(stats({ maxWaveReached: 19 }), none)).not.toContain('ledger-opened');
    expect(evaluate(stats({ maxWaveReached: 20 }), none)).toContain('ledger-opened');
  });
});

describe('evaluate', () => {
  it('never re-reports a completed id', () => {
    const s = stats({ maxWaveReached: 20 });
    expect(evaluate(s, none)).toContain('ledger-opened');
    expect(evaluate(s, { completed: new Set(['ledger-opened']) })).not.toContain('ledger-opened');
  });

  it('does not mutate the account set it is given', () => {
    const completed = new Set<string>();
    evaluate(stats({ maxWaveReached: 20 }), { completed });
    expect(completed.size).toBe(0);
  });
});

describe('tier helpers', () => {
  it('counts progress per tier', () => {
    const p = tierProgress(new Set(['ledger-opened']));
    expect(p.easy.done).toBe(1);
    expect(p.easy.total).toBe(CA_TASKS.filter((t) => t.tier === 'easy').length);
    expect(p.medium.done).toBe(0);
  });

  it('grants no title until a tier is whole', () => {
    expect(earnedTitles(new Set(['ledger-opened']))).toEqual([]);
    expect(highestTitle(new Set(['ledger-opened']))).toBeNull();
    const allEasy = new Set(CA_TASKS.filter((t) => t.tier === 'easy').map((t) => t.id));
    expect(earnedTitles(allEasy)).toEqual(['easy']);
    expect(highestTitle(allEasy)).toBe('easy');
  });
});

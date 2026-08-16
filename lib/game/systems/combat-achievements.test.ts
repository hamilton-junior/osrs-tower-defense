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

describe('medium tier', () => {
  it('bodyguard needs Brutus dead with no life lost to him', () => {
    expect(evaluate(stats({ bossKillSeconds: { brutus: 40 }, livesLostDuringBoss: { brutus: 1 } }), none))
      .not.toContain('bodyguard');
    expect(evaluate(stats({ bossKillSeconds: { brutus: 40 } }), none)).toContain('bodyguard');
  });

  it('molehill needs the Giant Mole dead', () => {
    expect(evaluate(stats(), none)).not.toContain('molehill');
    expect(evaluate(stats({ bossKillSeconds: { giant_mole: 55 } }), none)).toContain('molehill');
  });

  it('sun-and-moon needs both Guardians dead with no revive', () => {
    const both = { dusk: 30, dawn: 35 };
    expect(evaluate(stats({ bossKillSeconds: both, bossFlags: { ...emptyRunStats('classic', 0).bossFlags, duskDawnClean: false } }), none))
      .not.toContain('sun-and-moon');
    expect(evaluate(stats({ bossKillSeconds: { dusk: 30 } }), none)).not.toContain('sun-and-moon');
    expect(evaluate(stats({ bossKillSeconds: both }), none)).toContain('sun-and-moon');
  });

  it('thrifty needs wave 30 with at most 8 towers built', () => {
    expect(evaluate(stats({ maxWaveReached: 30, towersBuilt: 9 }), none)).not.toContain('thrifty');
    expect(evaluate(stats({ maxWaveReached: 29, towersBuilt: 8 }), none)).not.toContain('thrifty');
    expect(evaluate(stats({ maxWaveReached: 30, towersBuilt: 8 }), none)).toContain('thrifty');
  });

  it('specialist needs 100 kills on one tower', () => {
    expect(evaluate(stats({ killsByTower: { a: 99, b: 99 } }), none)).not.toContain('specialist');
    expect(evaluate(stats({ killsByTower: { a: 100 } }), none)).toContain('specialist');
  });

  it('taskmaster needs 5 Slayer tasks', () => {
    expect(evaluate(stats({ slayerTasksDone: 4 }), none)).not.toContain('taskmaster');
    expect(evaluate(stats({ slayerTasksDone: 5 }), none)).toContain('taskmaster');
  });

  it('untouchable needs a 5-wave clean streak', () => {
    expect(evaluate(stats({ cleanWaveStreak: 4 }), none)).not.toContain('untouchable');
    expect(evaluate(stats({ cleanWaveStreak: 5 }), none)).toContain('untouchable');
  });
});

describe('hard tier', () => {
  const flags = (over: Partial<RunStats['bossFlags']>) => ({
    ...emptyRunStats('classic', 0).bossFlags, ...over,
  });

  it('fire-cape needs Jad dead and never healed', () => {
    expect(evaluate(stats({ bossKillSeconds: { jad: 120 }, bossFlags: flags({ jadHealed: true }) }), none))
      .not.toContain('fire-cape');
    expect(evaluate(stats({ bossKillSeconds: { jad: 120 } }), none)).toContain('fire-cape');
  });

  it('vent-breaker needs both Hydra vents broken', () => {
    expect(evaluate(stats({ bossFlags: flags({ hydraVentsBroken: 1 }) }), none)).not.toContain('vent-breaker');
    expect(evaluate(stats({ bossFlags: flags({ hydraVentsBroken: 2 }) }), none)).toContain('vent-breaker');
  });

  it('hellhounds-master needs Cerberus dead with no soul escaping', () => {
    expect(evaluate(stats({ bossKillSeconds: { cerberus: 70 }, bossFlags: flags({ cerberusSoulLeaked: true }) }), none))
      .not.toContain('hellhounds-master');
    expect(evaluate(stats({ bossKillSeconds: { cerberus: 70 } }), none)).toContain('hellhounds-master');
  });

  it('snake-charmer needs Zulrah under 90 seconds', () => {
    expect(evaluate(stats(), none)).not.toContain('snake-charmer');
    expect(evaluate(stats({ bossKillSeconds: { zulrah: 90 } }), none)).not.toContain('snake-charmer');
    expect(evaluate(stats({ bossKillSeconds: { zulrah: 89 } }), none)).toContain('snake-charmer');
  });

  it('dragonfire-drill needs Vorkath dead with no life lost to him', () => {
    expect(evaluate(stats({ bossKillSeconds: { vorkath: 80 }, livesLostDuringBoss: { vorkath: 1 } }), none))
      .not.toContain('dragonfire-drill');
    expect(evaluate(stats({ bossKillSeconds: { vorkath: 80 } }), none)).toContain('dragonfire-drill');
  });

  it('minimalist needs wave 50 with at most 6 towers on the field', () => {
    expect(evaluate(stats({ maxWaveReached: 50, maxTowersOnField: 7 }), none)).not.toContain('minimalist');
    expect(evaluate(stats({ maxWaveReached: 50, maxTowersOnField: 6 }), none)).toContain('minimalist');
  });

  it('purist needs wave 40 with nothing sold', () => {
    expect(evaluate(stats({ maxWaveReached: 40, towersSold: 1 }), none)).not.toContain('purist');
    expect(evaluate(stats({ maxWaveReached: 40, towersSold: 0 }), none)).toContain('purist');
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

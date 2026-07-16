import { describe, it, expect, beforeEach } from 'vitest';
import type { GameEngine } from '../core/engine';
import type { EnemyType, SlayerTask } from '../types';
import { SlayerSystem } from './slayer-system';
import {
  SLAYER_HELMET_BONUS, SLAYER_HELMET_IMBUED_BONUS,
  SLAYER_ESSENCE_YIELD, SLAYER_ESSENCE_SACK_YIELD, BIGGER_BADDER_CHANCE,
} from '../data/slayer';

/** The slice of the engine SlayerSystem actually touches. */
function stubEngine(wave = 30) {
  const awarded: number[] = [];
  const notices: string[] = [];
  const e = {
    wave,
    money: 0,
    goldEarned: 0,
    meta: { award: (n: number) => awarded.push(n) },
    notify: (msg: string) => notices.push(msg),
    playSound: () => {},
    requestEmit: () => {},
  };
  return { e: e as unknown as GameEngine, awarded, notices };
}

describe('SlayerSystem — the rewards shop', () => {
  let sys: SlayerSystem;
  let env: ReturnType<typeof stubEngine>;

  beforeEach(() => {
    env = stubEngine();
    sys = new SlayerSystem(env.e);
    sys.points = 500;
  });

  it('the imbue replaces the helm bonus rather than stacking with it', () => {
    sys.task = { type: 'bloodveld', count: 5, total: 5, reward: 10 };
    expect(sys.onTaskBonus('bloodveld')).toBe(1); // no helm yet
    sys.buyReward('helmet');
    expect(sys.onTaskBonus('bloodveld')).toBeCloseTo(1 + SLAYER_HELMET_BONUS);
    sys.buyReward('helmet_i');
    expect(sys.onTaskBonus('bloodveld')).toBeCloseTo(1 + SLAYER_HELMET_IMBUED_BONUS);
    expect(sys.onTaskBonus('goblin')).toBe(1); // still only on task
  });

  it('refuses the imbue without the helm, and keeps the points', () => {
    sys.points = 100;
    sys.buyReward('helmet_i');
    expect(sys.imbued).toBe(false);
    expect(sys.points).toBe(100);
    expect(env.notices.some((n) => n.includes('Slayer Helmet'))).toBe(true);
  });

  it('refuses a purchase there are not enough points for', () => {
    sys.points = 1;
    sys.buyReward('helmet');
    expect(sys.helmet).toBe(false);
    expect(sys.points).toBe(1);
  });

  it('refuses a one-time unlock twice, and does not charge for the second try', () => {
    sys.buyReward('bigger_badder');
    const after = sys.points;
    sys.buyReward('bigger_badder');
    expect(sys.points).toBe(after);
  });

  it('block retires the monster for the run and rolls a fresh task', () => {
    sys.task = { type: 'bloodveld', count: 5, total: 5, reward: 10 };
    sys.buyReward('block');
    expect(sys.blocked).toContain('bloodveld');
    // A new task was rolled, and it is not the blocked monster.
    expect(sys.task).not.toBeNull();
    expect(sys.task!.type).not.toBe('bloodveld');
  });

  it('never assigns a blocked monster again', () => {
    sys.blocked = ['bloodveld'];
    const rolled: (EnemyType | undefined)[] = [];
    for (let i = 0; i < 30; i++) {
      sys.task = null;
      // The cast is at the read site on purpose: `sys.task = null` narrows the field
      // to `null`, and TS cannot see that assignTask() re-fills it.
      sys.assignTask();
      rolled.push((sys.task as SlayerTask | null)?.type);
    }
    expect(rolled).not.toContain('bloodveld');
    expect(rolled.filter(Boolean).length).toBeGreaterThan(0); // it did roll *something*
  });

  it('extend doubles what is LEFT (not the original total) and the payout with it', () => {
    // Half-finished task: 4 of 10 left. Extending pays for the remainder, not the past.
    sys.task = { type: 'bloodveld', count: 4, total: 10, reward: 20 };
    sys.buyReward('extend');
    expect(sys.task!.count).toBe(8);
    expect(sys.task!.total).toBe(14); // the 4 extra kills join the bar
    expect(sys.task!.reward).toBe(40);
    expect(sys.extended).toContain('bloodveld');
  });

  it('refuses block / extend / skip with no task', () => {
    sys.task = null;
    const before = sys.points;
    sys.buyReward('block');
    sys.buyReward('extend');
    expect(sys.points).toBe(before);
    expect(sys.blocked).toHaveLength(0);
  });

  it('the essence sack converts in bulk at a better rate than the pouch', () => {
    sys.buyReward('essence');
    sys.buyReward('essence_sack');
    expect(env.awarded).toEqual([SLAYER_ESSENCE_YIELD, SLAYER_ESSENCE_SACK_YIELD]);
    // "Better rate" is the whole point of the sack — assert it, so a later tweak
    // that makes bulk *worse* than clicking the pouch fails here.
    const pouchRate = SLAYER_ESSENCE_YIELD / 5;
    const sackRate = SLAYER_ESSENCE_SACK_YIELD / 50;
    expect(sackRate).toBeGreaterThan(pouchRate);
  });
});

describe('SlayerSystem — Bigger and Badder', () => {
  const always = () => 0;                       // rolls under any chance
  const never = () => BIGGER_BADDER_CHANCE + 0.01; // rolls over it

  function armed() {
    const env = stubEngine();
    const sys = new SlayerSystem(env.e);
    sys.points = 100;
    sys.buyReward('bigger_badder');
    sys.task = { type: 'bloodveld', count: 5, total: 5, reward: 10 };
    return sys;
  }

  it('raises the task monster’s superior form', () => {
    expect(armed().rollSuperior('bloodveld', always)).toBe('superior_bloodveld');
  });

  it('does nothing without the unlock', () => {
    const env = stubEngine();
    const sys = new SlayerSystem(env.e);
    sys.task = { type: 'bloodveld', count: 5, total: 5, reward: 10 };
    expect(sys.rollSuperior('bloodveld', always)).toBeNull();
  });

  it('only fires on the task monster — a stray kill raises nothing', () => {
    expect(armed().rollSuperior('goblin', always)).toBeNull();
  });

  it('raises nothing for a monster that has no superior', () => {
    const sys = armed();
    sys.task = { type: 'goblin', count: 5, total: 5, reward: 10 };
    expect(sys.rollSuperior('goblin', always)).toBeNull();
  });

  it('respects the roll — a miss raises nothing', () => {
    expect(armed().rollSuperior('bloodveld', never)).toBeNull();
  });

  it('a superior’s own death never chains into another', () => {
    expect(armed().rollSuperior('superior_bloodveld', always)).toBeNull();
  });
});

describe('SlayerSystem — save round-trip', () => {
  it('carries the shop unlocks, the block list and the extend list through a save', () => {
    const env = stubEngine();
    const sys = new SlayerSystem(env.e);
    sys.points = 500;
    sys.task = { type: 'bloodveld', count: 4, total: 10, reward: 20 };
    sys.buyReward('helmet');
    sys.buyReward('helmet_i');
    sys.buyReward('bigger_badder');
    sys.buyReward('extend');
    const snap = structuredClone(sys.snapshot());

    const restored = new SlayerSystem(stubEngine().e);
    restored.load(snap);
    expect(restored.helmet).toBe(true);
    expect(restored.imbued).toBe(true);
    expect(restored.biggerBadder).toBe(true);
    expect(restored.extended).toContain('bloodveld');
    expect(restored.points).toBe(sys.points);
  });

  it('loads a save written before the shop grew — the new unlocks default to unbought', () => {
    const sys = new SlayerSystem(stubEngine().e);
    // An old snapshot: no imbued / biggerBadder / blocked / extended keys at all.
    const old = { task: null, points: 12, streak: 1, helmet: true, lastTaskType: null, masterId: 'turael' };
    sys.load(old as unknown as ReturnType<SlayerSystem['snapshot']>);
    expect(sys.helmet).toBe(true);
    expect(sys.imbued).toBe(false);
    expect(sys.biggerBadder).toBe(false);
    expect(sys.blocked).toEqual([]);
    expect(sys.extended).toEqual([]);
  });
});

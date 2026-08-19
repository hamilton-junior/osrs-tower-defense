import { describe, it, expect } from 'vitest';
import type { EnemyDef } from '../types';
import {
  buildWaveConfigs,
  rollWaveBosses,
  allSchedulableBossesCleared,
  unseenBosses,
  isBossWave,
  BOSS_WAVE_INTERVAL,
  EXTRA_BOSS_MAX,
  EXTRA_BOSS_MIN_WAVE,
} from './wave-generation';
import { SCHEDULABLE_BOSSES } from './boss-mechanics';
import { ENEMIES } from '../data/enemies';

/** An rng that plays back a script, then holds on the last value. */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};
/** Every boss met at least once. */
const ALL_SEEN = Object.fromEntries(SCHEDULABLE_BOSSES.map((b) => [b, 1]));

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

  it('does not mutate the caller\'s landmark configs when seeding the task', () => {
    // The landmark already contains the task target, so the seed merges into that
    // entry. The caller's objects alias a shared table (LANDMARK_WAVES) and the
    // preview calls this repeatedly, so they must be left untouched.
    const landmark = [{ type: 'imp' as const, count: 4 }];
    const before = landmark.map(c => ({ ...c }));
    buildWaveConfigs(10, {
      enemies: registry,
      blockedEnemies: [],
      landmark,
      slayerTask: { type: 'imp', count: 20 },
      rng: () => 0,
    });
    expect(landmark).toEqual(before);
  });

  // The freeze. `summoned_soul` (Cerberus's escort) pays 0 and is not flagged `isBoss`,
  // so it sat in the budget pool: always affordable, never spending. Once the leftover
  // budget fell below the cheapest paying enemy it was the only pick left, the budget
  // stopped moving, and the wave build spun forever — hanging the tab on the frame the
  // last enemy died (wave end recomputes the next wave's preview).
  it('never spends the budget on a free enemy — the wave build must always terminate', () => {
    const withFreebie = [...registry, def('summoned_soul', 0, 1)];
    // Budget 27 (wave 1), cheapest payer 5 → the budget lands on 2, which nothing but
    // the free enemy can "afford". rng 0.99 biases the pick toward the last entry.
    const out = buildWaveConfigs(1, {
      enemies: withFreebie, blockedEnemies: [], rng: () => 0.99,
    });
    expect(out.some((c) => (c.type as string) === 'summoned_soul')).toBe(false);
    expect(totalCount(out)).toBeGreaterThan(0);
  });

  it('keeps every real enemy out of the freeze: no zero-reward type is ever spawnable', () => {
    // Guards the content table itself — a future 0-reward monster must not reopen this.
    const free = Object.values(ENEMIES).filter((e) => !e.isBoss && e.reward <= 0);
    for (let wave = 1; wave <= 60; wave++) {
      const out = buildWaveConfigs(wave, {
        enemies: Object.values(ENEMIES), blockedEnemies: [], bossesSeen: {}, rng: Math.random,
      });
      for (const f of free) {
        expect(out.some((c) => c.type === f.type)).toBe(false);
      }
    }
  });

  // Adds used to be kept out by accident: every one paid 0, so the freeze guard above
  // caught them on its way past. Scurrius' Giant rats broke that — they are not escorts
  // and they do pay (killing one denies his refund), so nothing but `summonedBy` stops
  // the allocator sending kingless rats as wave-1 trash.
  it('never sends a boss add as ordinary trash, even one that pays', () => {
    const adds = Object.values(ENEMIES).filter((e) => e.summonedBy);
    expect(adds.some((e) => e.reward > 0)).toBe(true); // else this guards nothing
    for (let wave = 1; wave <= 60; wave++) {
      const out = buildWaveConfigs(wave, {
        enemies: Object.values(ENEMIES), blockedEnemies: [], bossesSeen: {}, rng: Math.random,
      });
      for (const a of adds) {
        expect(out.some((c) => c.type === a.type)).toBe(false);
      }
    }
  });

  it('is deterministic for a fixed rng', () => {
    const opts = { enemies: registry, blockedEnemies: [], rng: () => 0.5 };
    expect(buildWaveConfigs(7, opts)).toEqual(buildWaveConfigs(7, opts));
  });

  it('carries no bosses at all when bossesSeen is omitted', () => {
    const out = buildWaveConfigs(20, { enemies: registry, blockedEnemies: [], rng: () => 0 });
    expect(out.some((c) => (SCHEDULABLE_BOSSES as readonly string[]).includes(c.type))).toBe(false);
  });

  it('schedules the boss onto a x10 wave and cuts the horde to make room', () => {
    const base = { enemies: registry, blockedEnemies: [], rng: () => 0 };
    const withBoss = buildWaveConfigs(10, { ...base, bossesSeen: {} });
    const noBoss = buildWaveConfigs(10, base); // same wave, no boss scheduled

    // Wave 10 on a fresh account is due the *first* boss of the intro order — whichever
    // that is. Naming one here would just re-break every time the ladder is re-ordered.
    expect(withBoss.find((c) => (c.type as string) === SCHEDULABLE_BOSSES[0])?.count).toBe(1);
    // The rank-and-file are thinned: the boss is the act, not a surcharge on top.
    const rabble = (cs: { type: string; count: number }[]) =>
      totalCount(cs.filter((c) => !(SCHEDULABLE_BOSSES as readonly string[]).includes(c.type)));
    expect(rabble(withBoss)).toBeLessThan(rabble(noBoss));
  });
});

describe('boss schedule', () => {
  it('marks every tenth wave, and only those', () => {
    expect(isBossWave(BOSS_WAVE_INTERVAL)).toBe(true);
    expect(isBossWave(BOSS_WAVE_INTERVAL * 3)).toBe(true);
    expect(isBossWave(9)).toBe(false);
    expect(isBossWave(15)).toBe(false);
    expect(isBossWave(0)).toBe(false); // wave 0 is not a boss wave
  });

  it('lists the unmet bosses in their intro order', () => {
    expect(unseenBosses({})).toEqual([...SCHEDULABLE_BOSSES]);
    expect(unseenBosses({ [SCHEDULABLE_BOSSES[0]]: 1 })).toEqual(SCHEDULABLE_BOSSES.slice(1));
    expect(unseenBosses(ALL_SEEN)).toEqual([]);
  });

  it('never sends a boss before the first boss wave', () => {
    for (const w of [1, 5, 9]) {
      expect(rollWaveBosses(w, {}, () => 0)).toEqual([]);   // nothing met
      expect(rollWaveBosses(w, ALL_SEEN, () => 0)).toEqual([]); // and not for a veteran either
    }
  });

  it('introduces the bosses in order to an account that has met none', () => {
    const seen: Record<string, number> = {};
    for (let i = 0; i < SCHEDULABLE_BOSSES.length; i++) {
      const wave = BOSS_WAVE_INTERVAL * (i + 1);
      expect(rollWaveBosses(wave, seen, () => 0)).toEqual([SCHEDULABLE_BOSSES[i]]);
      seen[SCHEDULABLE_BOSSES[i]] = 1; // the player has now met it
    }
  });

  it('sends nothing on an off-schedule wave while a boss is still unmet', () => {
    // rng 0 would pass the extras chance — but extras are locked until all are met.
    expect(rollWaveBosses(15, { [SCHEDULABLE_BOSSES[0]]: 1 }, () => 0)).toEqual([]);
  });

  it('adds no extras to a boss wave while a boss is still unmet', () => {
    const seen = Object.fromEntries(SCHEDULABLE_BOSSES.slice(0, -1).map((b) => [b, 1]));
    const out = rollWaveBosses(20, seen, () => 0);
    expect(out).toEqual([SCHEDULABLE_BOSSES.at(-1)]); // just the last unmet one
  });

  it('draws the scheduled boss at random once every boss has been met', () => {
    // rng 0 -> pool[0]; a high roll -> the last of the pool.
    expect(rollWaveBosses(50, ALL_SEEN, seq(0, 0.99))).toEqual([SCHEDULABLE_BOSSES[0]]);
    expect(rollWaveBosses(50, ALL_SEEN, seq(0.99, 0.99))).toEqual([SCHEDULABLE_BOSSES.at(-1)]);
  });

  it('can bring extra bosses to a plain wave once every boss has been met', () => {
    // Wave 25 is due none. rng: chance hit (0), count 0.99 -> EXTRA_BOSS_MAX, then picks.
    const out = rollWaveBosses(25, ALL_SEEN, seq(0, 0.99, 0, 0));
    expect(out).toHaveLength(EXTRA_BOSS_MAX);
  });

  it('brings nothing extra when the chance roll misses', () => {
    expect(rollWaveBosses(25, ALL_SEEN, () => 0.99)).toEqual([]);
  });

  it('can whiff: the chance can hit and still roll zero extras', () => {
    // chance hit (0), then a count roll of 0 -> floor(0 * (MAX+1)) = 0 extras.
    expect(rollWaveBosses(25, ALL_SEEN, seq(0, 0))).toEqual([]);
  });

  it('never stacks bosses before EXTRA_BOSS_MIN_WAVE, even for a veteran', () => {
    // rng 0 passes every extras roll; the floor is what holds them back. The first
    // boss wave must stay a single boss, and the waves around it must stay empty.
    for (let w = BOSS_WAVE_INTERVAL; w < EXTRA_BOSS_MIN_WAVE; w++) {
      const out = rollWaveBosses(w, ALL_SEEN, () => 0);
      expect(out).toHaveLength(isBossWave(w) ? 1 : 0);
    }
    // …and the floor itself is where stacking becomes possible again.
    expect(rollWaveBosses(EXTRA_BOSS_MIN_WAVE, ALL_SEEN, seq(0, 0, 0.99, 0, 0)).length)
      .toBe(1 + EXTRA_BOSS_MAX);
  });

  it('stacks extras on top of the scheduled boss, never past the cap', () => {
    // Wave 20 is due one; the extras roll maxes out on top of it.
    const out = rollWaveBosses(20, ALL_SEEN, seq(0, 0, 0.99, 0, 0));
    expect(out.length).toBe(1 + EXTRA_BOSS_MAX);
    expect(out.every((b) => (SCHEDULABLE_BOSSES as readonly string[]).includes(b))).toBe(true);
  });
});

describe('per-run boss march', () => {
  const rng = () => 0; // deterministic

  it('marches a veteran through every boss in SCHEDULABLE_BOSSES order regardless of lifetime bossesSeen', () => {
    // Veteran: every boss lifetime-seen, so the *lifetime* schedule would go random.
    const seen: Record<string, number> = { ...ALL_SEEN };
    const killedThisRun: Record<string, number> = {};
    const got: string[] = [];
    for (let i = 0; i < SCHEDULABLE_BOSSES.length; i++) {
      const wave = (i + 1) * 10;
      const [boss] = rollWaveBosses(wave, seen, rng, killedThisRun);
      got.push(boss);
      killedThisRun[boss] = 1; // the engine records the kill before the next boss wave
    }
    expect(got).toEqual([...SCHEDULABLE_BOSSES]);
  });

  it('allSchedulableBossesCleared is true exactly when the last is met', () => {
    const killed: Record<string, number> = {};
    for (const b of SCHEDULABLE_BOSSES.slice(0, -1)) killed[b] = 1;
    expect(allSchedulableBossesCleared(killed)).toBe(false);
    killed[SCHEDULABLE_BOSSES[SCHEDULABLE_BOSSES.length - 1]] = 1;
    expect(allSchedulableBossesCleared(killed)).toBe(true);
  });

  it('falls back to lifetime bossesSeen when no per-run set is passed', () => {
    const seen: Record<string, number> = {}; // new account, nothing seen
    const [boss] = rollWaveBosses(10, seen, rng);
    expect(boss).toBe(SCHEDULABLE_BOSSES[0]); // still the gentlest first
  });
});

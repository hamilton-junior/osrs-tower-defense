/**
 * The Combat Achievements table. Content only — the types and the evaluation
 * live in `systems/combat-achievements.ts`.
 *
 * The import below is **type-only** on purpose: `systems/` imports this file's
 * value (`CA_TASKS`), so a value import back would close a runtime cycle.
 *
 * Ids are permanent — they are the persisted key. Never rename one in place;
 * retire a task by deleting it (unknown stored ids are ignored on read).
 */
import type { CaTask } from '../systems/combat-achievements';
import type { EnemyType } from '../types';

/** The ten bosses a full run must defeat, for `perfect-roster`. */
export const CA_BOSS_ROSTER: readonly EnemyType[] = [
  'scurrius', 'brutus', 'giant_mole', 'dusk', 'dawn',
  'cerberus', 'zulrah', 'vorkath', 'jad', 'hydra',
];

export const CA_TASKS: readonly CaTask[] = [
  // --- Easy: teach the systems; reachable inside the first ~20 waves ---
  {
    id: 'rat-catcher', tier: 'easy', name: 'Rat Catcher',
    desc: 'Defeat Scurrius.',
    check: (s) => s.bossKillSeconds.scurrius !== undefined,
  },
  {
    id: 'first-contract', tier: 'easy', name: 'First Contract',
    desc: 'Complete a Slayer task.',
    check: (s) => s.slayerTasksDone >= 1,
  },
  {
    id: 'answered-prayer', tier: 'easy', name: 'Answered Prayer',
    desc: 'Finish a wave with a tower prayer active.',
    check: (s) => s.prayerActiveAtWaveEnd,
  },
  {
    id: 'full-house', tier: 'easy', name: 'Full House',
    desc: 'Have all six tower types on the field at once.',
    check: (s) => s.hadAllSixAtOnce,
  },
  {
    id: 'not-a-scratch', tier: 'easy', name: 'Not a Scratch',
    desc: 'Clear a wave without losing a life.',
    check: (s) => s.cleanWaveStreak >= 1,
  },
  {
    id: 'ledger-opened', tier: 'easy', name: 'Ledger Opened',
    desc: 'Reach wave 20.',
    check: (s) => s.maxWaveReached >= 20,
  },

  // --- Medium ---
  {
    id: 'bodyguard', tier: 'medium', name: 'Bodyguard',
    desc: 'Defeat Brutus without losing a life.',
    check: (s) => s.bossKillSeconds.brutus !== undefined && (s.livesLostDuringBoss.brutus ?? 0) === 0,
  },
  {
    id: 'molehill', tier: 'medium', name: 'Molehill',
    desc: 'Defeat the Giant Mole.',
    check: (s) => s.bossKillSeconds.giant_mole !== undefined,
  },
  {
    id: 'sun-and-moon', tier: 'medium', name: 'Sun and Moon',
    desc: 'Defeat Dusk and Dawn in the correct order, with neither reviving.',
    check: (s) => s.bossKillSeconds.dusk !== undefined
      && s.bossKillSeconds.dawn !== undefined
      && s.bossFlags.duskDawnClean,
  },
  {
    id: 'thrifty', tier: 'medium', name: 'Thrifty',
    desc: 'Reach wave 30 having built no more than 8 towers.',
    check: (s) => s.maxWaveReached >= 30 && s.towersBuilt <= 8,
  },
  {
    id: 'specialist', tier: 'medium', name: 'Specialist',
    desc: 'Get 100 kills with a single tower.',
    check: (s) => Object.values(s.killsByTower).some((n) => n >= 100),
  },
  {
    id: 'taskmaster', tier: 'medium', name: 'Taskmaster',
    desc: 'Complete 5 Slayer tasks in one run.',
    check: (s) => s.slayerTasksDone >= 5,
  },
  {
    id: 'untouchable', tier: 'medium', name: 'Untouchable',
    desc: 'Clear 5 waves in a row without losing a life.',
    check: (s) => s.cleanWaveStreak >= 5,
  },

  // --- Hard ---
  {
    id: 'fire-cape', tier: 'hard', name: 'Fire Cape',
    desc: 'Defeat TzTok-Jad without a Yt-HurKot healing him.',
    check: (s) => s.bossKillSeconds.jad !== undefined && !s.bossFlags.jadHealed,
  },
  {
    id: 'vent-breaker', tier: 'hard', name: 'Vent Breaker',
    desc: "Break both of the Alchemical Hydra's vents.",
    check: (s) => s.bossFlags.hydraVentsBroken >= 2,
  },
  {
    id: 'hellhounds-master', tier: 'hard', name: "Hellhound's Master",
    desc: 'Defeat Cerberus without a Summoned Soul escaping.',
    check: (s) => s.bossKillSeconds.cerberus !== undefined && !s.bossFlags.cerberusSoulLeaked,
  },
  {
    id: 'snake-charmer', tier: 'hard', name: 'Snake Charmer',
    desc: 'Defeat Zulrah in under 90 seconds.',
    check: (s) => (s.bossKillSeconds.zulrah ?? Infinity) < 90,
  },
  {
    id: 'dragonfire-drill', tier: 'hard', name: 'Dragonfire Drill',
    desc: 'Defeat Vorkath without losing a life.',
    check: (s) => s.bossKillSeconds.vorkath !== undefined && (s.livesLostDuringBoss.vorkath ?? 0) === 0,
  },
  {
    id: 'minimalist', tier: 'hard', name: 'Minimalist',
    desc: 'Reach wave 50 with no more than 6 towers on the field.',
    check: (s) => s.maxWaveReached >= 50 && s.maxTowersOnField <= 6,
  },
  {
    id: 'purist', tier: 'hard', name: 'Purist',
    desc: 'Reach wave 40 without selling a tower.',
    check: (s) => s.maxWaveReached >= 40 && s.towersSold === 0,
  },
];

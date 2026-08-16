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
];

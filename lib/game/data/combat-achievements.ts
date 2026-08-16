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
    desc: 'Defeat both Dusk and Dawn without either one reviving.',
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
    desc: 'Defeat Cerberus having killed every Summoned Soul he raises.',
    check: (s) => s.bossKillSeconds.cerberus !== undefined && !s.bossFlags.cerberusSoulSurvived,
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

  // --- Elite ---
  {
    id: 'champion', tier: 'elite', name: 'Champion',
    desc: 'Win a run.',
    check: (s) => s.won,
  },
  {
    id: 'old-school', tier: 'elite', name: 'Old School',
    desc: 'Win a run in Classic mode.',
    mode: 'classic',
    check: (s) => s.won,
  },
  {
    id: 'gambler', tier: 'elite', name: 'Gambler',
    desc: 'Win a run in Roguelite mode.',
    mode: 'roguelite',
    check: (s) => s.won,
  },
  {
    id: 'speed-runner', tier: 'elite', name: 'Speed Runner',
    desc: 'Win a run in under 45 minutes.',
    check: (s) => s.won && s.runSeconds < 45 * 60,
  },
  {
    id: 'iron-wall', tier: 'elite', name: 'Iron Wall',
    desc: 'Win a run losing no more than 5 lives.',
    check: (s) => s.won && s.livesLostRun <= 5,
  },
  {
    id: 'one-true-style', tier: 'elite', name: 'One True Style',
    desc: 'Win a run using towers of a single combat style.',
    check: (s) => s.won && s.stylesUsed.length === 1,
  },
  {
    id: 'deep-cut', tier: 'elite', name: 'Deep Cut',
    desc: 'Reach wave 120 in Endless.',
    check: (s) => s.runPhase === 'endless' && s.maxWaveReached >= 120,
  },

  // --- Master ---
  {
    id: 'hard-mode', tier: 'master', name: 'Hard Mode',
    desc: 'Win a run on Hard difficulty or above.',
    check: (s) => s.won && s.tier >= 3,
  },
  {
    id: 'elite-company', tier: 'master', name: 'Elite Company',
    desc: 'Win a run on Elite difficulty or above.',
    check: (s) => s.won && s.tier >= 4,
  },
  {
    id: 'flawless-fight-caves', tier: 'master', name: 'Flawless Fight Caves',
    desc: 'Defeat TzTok-Jad without losing a life, on Hard difficulty or above.',
    check: (s) => s.tier >= 3
      && s.bossKillSeconds.jad !== undefined
      && (s.livesLostDuringBoss.jad ?? 0) === 0,
  },
  {
    id: 'perfect-hydra', tier: 'master', name: 'Perfect Hydra',
    desc: 'Defeat the Alchemical Hydra without it healing at a vent.',
    check: (s) => s.bossKillSeconds.hydra !== undefined && !s.bossFlags.hydraVentHealed,
  },
  {
    id: 'bare-bones', tier: 'master', name: 'Bare Bones',
    desc: 'Win a run having built no more than 10 towers.',
    check: (s) => s.won && s.towersBuilt <= 10,
  },
  {
    id: 'no-gods-no-prayers', tier: 'master', name: 'No Gods, No Prayers',
    desc: 'Win a run without activating a single prayer.',
    check: (s) => s.won && !s.prayerEverUsed,
  },
  {
    id: 'endless-endurance', tier: 'master', name: 'Endless Endurance',
    desc: 'Reach wave 200 in Endless.',
    check: (s) => s.runPhase === 'endless' && s.maxWaveReached >= 200,
  },

  // --- Grandmaster ---
  {
    id: 'grandmaster', tier: 'grandmaster', name: 'Grandmaster',
    desc: 'Win a run on Grandmaster difficulty.',
    check: (s) => s.won && s.tier >= 6,
  },
  {
    id: 'untouchable-champion', tier: 'grandmaster', name: 'Untouchable Champion',
    desc: 'Win a run without losing a single life.',
    check: (s) => s.won && s.livesLostRun === 0,
  },
  {
    id: 'perfect-roster', tier: 'grandmaster', name: 'Perfect Roster',
    desc: 'Defeat all ten bosses in one run, losing no life to any of them.',
    check: (s) => s.won && CA_BOSS_ROSTER.every(
      (b) => s.bossKillSeconds[b] !== undefined && (s.livesLostDuringBoss[b] ?? 0) === 0,
    ),
  },
  {
    id: 'speed-grandmaster', tier: 'grandmaster', name: 'Speed Grandmaster',
    desc: 'Win on Master difficulty or above in under 60 minutes.',
    check: (s) => s.won && s.tier >= 5 && s.runSeconds < 60 * 60,
  },
  {
    id: 'ascetic-grandmaster', tier: 'grandmaster', name: 'Ascetic Grandmaster',
    desc: 'Win on Elite difficulty or above without selling a tower, having built no more than 12.',
    check: (s) => s.won && s.tier >= 4 && s.towersSold === 0 && s.towersBuilt <= 12,
  },
  {
    id: 'the-whole-log', tier: 'grandmaster', name: 'The Whole Log',
    desc: 'Complete every other Combat Achievement.',
    check: (_s, a) => CA_TASKS.every((t) => t.id === 'the-whole-log' || a.completed.has(t.id)),
  },
];

import type { EnemyType } from '../types';

export interface SlayerMaster {
  id: string;
  name: string;
  /** Player level (engine uses Magic level as a combat-level proxy) required to use this master. */
  levelReq: number;
  /** Enemy types this master can assign as a task. */
  taskPool: EnemyType[];
  /** Multiplier applied to the task's point/GP reward. */
  bonusMultiplier: number;
  /** Base Slayer points awarded for completing a task from this master. */
  pointsPerTask: number;
}

export const SLAYER_MASTERS: SlayerMaster[] = [
  { id: 'turael', name: 'Turael', levelReq: 1, taskPool: ['goblin', 'rat', 'cow', 'imp', 'spider', 'skeleton', 'zombie', 'ghost'], bonusMultiplier: 1.0, pointsPerTask: 2 },
  { id: 'mazchna', name: 'Mazchna', levelReq: 20, taskPool: ['scorpion', 'hill_giant', 'lesser_demon', 'hellhound', 'fire_giant', 'bloodveld'], bonusMultiplier: 1.2, pointsPerTask: 5 },
  { id: 'duradel', name: 'Duradel', levelReq: 50, taskPool: ['abyssal_demon', 'dark_beast', 'hydra', 'gargoyle', 'nechryael', 'black_demon', 'blue_dragon', 'green_dragon'], bonusMultiplier: 1.5, pointsPerTask: 15 },
];

/** Tower-damage bonus vs the current task's monster while the Slayer Helmet is
 *  owned (the iconic on-task boost). */
export const SLAYER_HELMET_BONUS = 0.2;
/** Rune Essence granted per Essence-Pouch purchase (converts per-run Slayer
 *  points into permanent meta-progression so leftover points aren't wasted). */
export const SLAYER_ESSENCE_YIELD = 10;

/** The Slayer Rewards shop — the sink for Slayer points (a per-run currency).
 *  `helmet` is a one-time run unlock; `skip`/`essence` are repeatable. */
export interface SlayerReward {
  id: 'helmet' | 'skip' | 'essence';
  name: string;
  desc: string;
  /** Slayer-point cost. */
  cost: number;
  /** Wiki sprite filename (drawn via ASSETS.misc.wiki_base). */
  icon: string;
  /** One-time purchase per run (greys out once owned). */
  once?: boolean;
}

export const SLAYER_REWARDS: SlayerReward[] = [
  { id: 'helmet', name: 'Slayer Helmet', desc: '+20% tower damage vs your current task', cost: 20, icon: 'Slayer_helmet', once: true },
  { id: 'skip', name: 'Skip Task', desc: 'Drop this task and roll a fresh one', cost: 8, icon: 'Enchanted_gem' },
  { id: 'essence', name: 'Essence Pouch', desc: 'Convert 5 points into 10 Rune Essence', cost: 5, icon: 'Pure_essence' },
];

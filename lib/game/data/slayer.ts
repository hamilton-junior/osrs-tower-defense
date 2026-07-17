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
/** The imbued helm's on-task bonus — it *replaces* {@link SLAYER_HELMET_BONUS},
 *  it does not stack with it. */
export const SLAYER_HELMET_IMBUED_BONUS = 0.45;
/** Rune Essence granted per Essence-Pouch purchase (converts per-run Slayer
 *  points into permanent meta-progression so leftover points aren't wasted). */
export const SLAYER_ESSENCE_YIELD = 10;
/** The Essence Sack: the bulk conversion. Ten pouches' worth of points in one
 *  click, at a better rate — a player sitting on hundreds of points was clicking
 *  the pouch dozens of times to spend them. */
export const SLAYER_ESSENCE_SACK_COST = 50;
export const SLAYER_ESSENCE_SACK_YIELD = 120;

/**
 * Bigger and Badder: chance that a task monster's death raises its Superior form
 * on the spot. Only monsters that *have* a superior can spawn one (as in OSRS) —
 * see {@link SUPERIOR_OF}.
 */
export const BIGGER_BADDER_CHANCE = 0.15;

/** The Superior Slayer monster each base monster can rise as. */
export const SUPERIOR_OF: Partial<Record<EnemyType, EnemyType>> = {
  bloodveld: 'superior_bloodveld',
  abyssal_demon: 'superior_abyssal_demon',
  gargoyle: 'superior_gargoyle',
  nechryael: 'superior_nechryael',
};

/** Reverse of {@link SUPERIOR_OF}: a Superior monster back to the base it counts as. */
export const BASE_OF: Partial<Record<EnemyType, EnemyType>> = Object.fromEntries(
  Object.entries(SUPERIOR_OF).map(([base, sup]) => [sup, base as EnemyType]),
) as Partial<Record<EnemyType, EnemyType>>;

/** The monster a Slayer task credits for a kill of `type`: a Superior counts toward
 *  its base form's task, everything else counts as itself. So a `superior_bloodveld`
 *  kill ticks a `bloodveld` task. */
export function taskMonsterType(type: EnemyType): EnemyType {
  return BASE_OF[type] ?? type;
}

/** The Slayer Rewards shop — the sink for Slayer points (a per-run currency).
 *  `once` unlocks are per-run; the rest are repeatable. */
export interface SlayerReward {
  id: 'helmet' | 'helmet_i' | 'bigger_badder' | 'block' | 'extend' | 'skip' | 'essence' | 'essence_sack';
  name: string;
  desc: string;
  /** Slayer-point cost. */
  cost: number;
  /** Wiki sprite filename (drawn via ASSETS.misc.wiki_base). */
  icon: string;
  /** One-time purchase per run (greys out once owned). */
  once?: boolean;
  /** Another reward that must be owned first (the imbue needs the helm). */
  requires?: SlayerReward['id'];
}

export const SLAYER_REWARDS: SlayerReward[] = [
  { id: 'helmet', name: 'Slayer Helmet', desc: `+${SLAYER_HELMET_BONUS * 100}% tower damage vs your current task`, cost: 20, icon: 'Slayer_helmet', once: true },
  {
    id: 'helmet_i', name: 'Slayer Helmet (i)', requires: 'helmet',
    desc: `Imbue the helm: the on-task bonus becomes +${SLAYER_HELMET_IMBUED_BONUS * 100}%`,
    cost: 40, icon: 'Slayer_helmet_(i)', once: true,
  },
  {
    id: 'bigger_badder', name: 'Bigger and Badder',
    desc: 'Task monsters can rise again as their Superior form — far tougher, far richer. (Bloodvelds, Abyssal demons, Gargoyles, Nechryaels.)',
    cost: 30, icon: 'Eternal_gem', once: true,
  },
  {
    id: 'block', name: 'Block Task',
    desc: 'This monster is never assigned again this run. Rolls a fresh task.',
    cost: 15, icon: 'Slayer_ring',
  },
  {
    id: 'extend', name: 'Extend Task',
    desc: 'Double what is left of this task — and its payout. Future tasks on this monster come extended too.',
    cost: 10, icon: 'Bracelet_of_slaughter',
  },
  { id: 'skip', name: 'Skip Task', desc: 'Drop this task and roll a fresh one', cost: 8, icon: 'Enchanted_gem' },
  { id: 'essence', name: 'Essence Pouch', desc: `Convert 5 points into ${SLAYER_ESSENCE_YIELD} Rune Essence`, cost: 5, icon: 'Pure_essence' },
  {
    id: 'essence_sack', name: 'Essence Sack',
    desc: `Convert ${SLAYER_ESSENCE_SACK_COST} points into ${SLAYER_ESSENCE_SACK_YIELD} Rune Essence — a better rate, in one click`,
    cost: SLAYER_ESSENCE_SACK_COST, icon: 'Giant_pouch',
  },
];

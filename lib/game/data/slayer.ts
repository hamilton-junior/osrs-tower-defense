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

import { EnemyType } from '../types';

export interface WaveConfig {
  type: EnemyType;
  count: number;
}

export const LANDMARK_WAVES: Record<number, WaveConfig[]> = {
  1: [{ type: 'goblin', count: 8 }, { type: 'rat', count: 4 }],
  2: [{ type: 'goblin', count: 10 }, { type: 'cow', count: 5 }],
  3: [{ type: 'imp', count: 6 }, { type: 'spider', count: 4 }],
  4: [{ type: 'skeleton', count: 12 }, { type: 'scorpion', count: 6 }],
  5: [{ type: 'hill_giant', count: 4 }, { type: 'zombie', count: 10 }],
  6: [{ type: 'lesser_demon', count: 6 }, { type: 'ghost', count: 8 }],
  7: [{ type: 'hellhound', count: 8 }, { type: 'fire_giant', count: 4 }],
  8: [{ type: 'green_dragon', count: 5 }, { type: 'bloodveld', count: 10 }],
  9: [{ type: 'black_demon', count: 6 }, { type: 'gargoyle', count: 8 }],
  10: [{ type: 'jad', count: 1 }, { type: 'lesser_demon', count: 5 }],
  20: [{ type: 'vorkath', count: 1 }, { type: 'blue_dragon', count: 5 }],
  30: [{ type: 'zulrah', count: 1 }, { type: 'green_dragon', count: 10 }],
  40: [{ type: 'zulrah', count: 1 }, { type: 'nechryael', count: 10 }],
  // The Hydra's debut. `bossesSeen` makes a first sighting vanilla (no affixes),
  // so this is where the player learns to break its vents; it returns on 100 with
  // modifiers rolled.
  45: [{ type: 'hydra', count: 1 }, { type: 'hellhound', count: 12 }],
  50: [{ type: 'vorkath', count: 1 }, { type: 'abyssal_demon', count: 10 }],
  60: [{ type: 'jad', count: 1 }, { type: 'dark_beast', count: 10 }],
  100: [{ type: 'hydra', count: 1 }, { type: 'dark_beast', count: 20 }]
};

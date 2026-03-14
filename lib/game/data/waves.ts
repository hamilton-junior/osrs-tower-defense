import { EnemyType } from '../types';

export interface WaveConfig {
  type: EnemyType;
  count: number;
}

export const LANDMARK_WAVES: Record<number, WaveConfig[]> = {
  1: [{ type: 'goblin', count: 5 }, { type: 'rat', count: 5 }],
  10: [{ type: 'jad', count: 1 }, { type: 'lesser_demon', count: 5 }],
  20: [{ type: 'vorkath', count: 1 }, { type: 'blue_dragon', count: 5 }],
  30: [{ type: 'zulrah', count: 1 }, { type: 'green_dragon', count: 10 }]
};

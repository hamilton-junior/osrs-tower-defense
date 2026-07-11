import { EnemyType } from '../types';

export interface WaveConfig {
  type: EnemyType;
  count: number;
}

/**
 * The scripted opening. Waves 1-9 are hand-authored so the ramp teaches the game;
 * from wave 10 on the makeup is procedural (`systems/wave-generation`).
 *
 * Bosses are deliberately **not** in this table any more: they are scheduled, one
 * on every 10th wave, by `rollWaveBosses`. A fixed table could only ever cover the
 * waves someone remembered to write down (70, 80 and 90 had no boss, and nothing
 * past 100 did either), and it could not react to which bosses a player had
 * actually met.
 */
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
};

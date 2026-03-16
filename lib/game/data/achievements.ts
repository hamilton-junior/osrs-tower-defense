
import { Achievement } from '../types';

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_wave', name: 'Novice Defender', description: 'Complete Wave 1', completed: false },
  { id: 'rich', name: 'Merchant', description: 'Accumulate 1000 GP', completed: false },
  { id: 'slayer_master', name: 'Slayer Master', description: 'Complete 5 Slayer Tasks', completed: false },
  { id: 'boss_slayer', name: 'Boss Slayer', description: 'Defeat TzTok-Jad', completed: false },
  { id: 'vorkath_slayer', name: 'Dragon Slayer II', description: 'Defeat Vorkath', completed: false },
  { id: 'zulrah_slayer', name: 'Snake Pit', description: 'Defeat Zulrah', completed: false },
  { id: 'essence_hoarder', name: 'Essence Hoarder', description: 'Accumulate 50 Rune Essence', completed: false },
  { id: 'tower_master', name: 'Tower Master', description: 'Have 10 towers on the field', completed: false }
];

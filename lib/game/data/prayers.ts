
import { PrayerDef, PrayerType } from '../types';

export const PRAYERS: PrayerDef[] = [
  { id: 'burst_of_strength', name: 'Burst of Strength', level: 4, drain: 1.5, description: '+5% Strength' },
  { id: 'sharp_eye', name: 'Sharp Eye', level: 8, drain: 1.5, description: '+5% Ranged' },
  { id: 'mystic_will', name: 'Mystic Will', level: 9, drain: 1.5, description: '+5% Magic' },
  { id: 'hawk_eye', name: 'Hawk Eye', level: 26, drain: 3, description: '+10% Ranged' },
  { id: 'ultimate_strength', name: 'Ultimate Strength', level: 31, drain: 4, description: '+15% Strength' },
  { id: 'protect_from_magic', name: 'Protect from Magic', level: 37, drain: 4, description: 'Protection from Magic attacks' },
  { id: 'protect_from_missiles', name: 'Protect from Missiles', level: 40, drain: 4, description: 'Protection from Ranged attacks' },
  { id: 'protect_from_melee', name: 'Protect from Melee', level: 43, drain: 4, description: 'Protection from Melee attacks' },
  { id: 'eagle_eye', name: 'Eagle Eye', level: 44, drain: 5, description: '+15% Ranged' },
  { id: 'piety', name: 'Piety', level: 70, drain: 8, description: '+23% Melee Damage' },
  { id: 'rigour', name: 'Rigour', level: 74, drain: 8, description: '+23% Ranged Damage' },
  { id: 'augury', name: 'Augury', level: 77, drain: 8, description: '+25% Magic Damage' },
];

/** Tower combat style a prayer boosts (matches the styles in tower-combat). */
export type PrayerStyle = 'ranged' | 'magic' | 'melee';

/**
 * The prayers that actually buff a tower (the offensive ones `tower-combat`
 * reads), in UI order, tagged with the combat style they boost. Protection
 * prayers are intentionally excluded — towers don't take style-typed damage.
 */
export const TOWER_PRAYERS: { id: PrayerType; style: PrayerStyle }[] = [
  { id: 'sharp_eye', style: 'ranged' },
  { id: 'hawk_eye', style: 'ranged' },
  { id: 'eagle_eye', style: 'ranged' },
  { id: 'rigour', style: 'ranged' },
  { id: 'mystic_will', style: 'magic' },
  { id: 'augury', style: 'magic' },
  { id: 'burst_of_strength', style: 'melee' },
  { id: 'ultimate_strength', style: 'melee' },
  { id: 'piety', style: 'melee' },
];

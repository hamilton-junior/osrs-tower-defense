
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
 * reads), tagged with the combat style they boost. Ordered by level — which is
 * the OSRS prayer-book order — so the bar reads like the in-game interface.
 * Protection prayers are excluded — towers don't take style-typed damage.
 */
export const TOWER_PRAYERS: { id: PrayerType; style: PrayerStyle; dmg: number }[] = [
  { id: 'burst_of_strength', style: 'melee', dmg: 0.05 }, // lvl 4
  { id: 'sharp_eye', style: 'ranged', dmg: 0.05 }, // lvl 8
  { id: 'mystic_will', style: 'magic', dmg: 0.05 }, // lvl 9
  { id: 'hawk_eye', style: 'ranged', dmg: 0.10 }, // lvl 26
  { id: 'ultimate_strength', style: 'melee', dmg: 0.15 }, // lvl 31
  { id: 'eagle_eye', style: 'ranged', dmg: 0.15 }, // lvl 44
  { id: 'piety', style: 'melee', dmg: 0.23 }, // lvl 70
  { id: 'rigour', style: 'ranged', dmg: 0.23 }, // lvl 74
  { id: 'augury', style: 'magic', dmg: 0.25 }, // lvl 77
];

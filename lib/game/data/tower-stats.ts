
import { Element, MageMode, AncientType, SupportSpell } from '../types';

export const TICK = 0.6;
const tile = 25;

export const WIZARD_SPELL_TIERS = ['Strike', 'Bolt', 'Blast', 'Wave', 'Surge'];
export const ANCIENT_TIERS = ['Rush', 'Burst', 'Blitz', 'Barrage'];
export const SPELL_MAX_HITS = [8, 12, 18, 24, 30];
export const ANCIENT_HITS = [16, 20, 23, 29];

export const UTILITY_TIERS = ['Lunar Staff', "Ahrim's Staff", 'Ancient Sceptre', "Tumeken's Shadow"];

export const ARCHER_STATS = [
  { tiles: 7, cooldownTicks: 3 },
  { tiles: 8, cooldownTicks: 3 },
  { tiles: 9, cooldownTicks: 5 },
  { tiles: 10, cooldownTicks: 3 }
];

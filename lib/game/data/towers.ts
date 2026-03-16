
import { TowerType, Element, MageMode } from '../types';

export interface TowerTier {
  level: number;
  name: string;
  damage: number;
  cooldown: number;
  range: number;
  color: string;
  upgradeCost: number;
  special?: any;
  minDamage?: number;
  maxDamage?: number;
}

export interface TowerDef {
  type: TowerType;
  baseName: string;
  tiers: TowerTier[];
  fireSound?: string;
}

const TICK = 0.6;

export const TOWERS: Record<string, TowerDef> = {
  archer: {
    type: 'archer',
    baseName: 'Ranged',
    fireSound: 'archer',
    tiers: [
      { level: 1, name: 'Shortbow', damage: 3, cooldown: 3 * TICK * 1000, range: 7 * 25, color: '#9acd32', upgradeCost: 25 },
      { level: 2, name: 'Magic Shortbow', damage: 8, cooldown: 3 * TICK * 1000, range: 7 * 25, color: '#32CD32', upgradeCost: 65 },
      { level: 3, name: 'Crystal Bow', damage: 15, cooldown: 5 * TICK * 1000, range: 9 * 25, color: '#E0FFFF', upgradeCost: 150 },
      { level: 4, name: 'Bow of Faerdhinen', damage: 25, cooldown: 3 * TICK * 1000, range: 10 * 25, color: '#a020f0', upgradeCost: 500 }
    ]
  },
  wizard: {
    type: 'wizard',
    baseName: 'Magic',
    fireSound: 'wizard',
    tiers: [
      { level: 1, name: 'Air Strike', damage: 2, cooldown: 5 * TICK * 1000, range: 6 * 25, color: '#a0cfff', upgradeCost: 40 },
      { level: 2, name: 'Air Bolt', damage: 6, cooldown: 5 * TICK * 1000, range: 7 * 25, color: '#a0cfff', upgradeCost: 80 },
      { level: 3, name: 'Air Blast', damage: 14, cooldown: 5 * TICK * 1000, range: 8 * 25, color: '#a0cfff', upgradeCost: 200 },
      { level: 4, name: 'Ancient Magicks', damage: 28, cooldown: 5 * TICK * 1000, range: 8 * 25, color: '#7b68ee', upgradeCost: 600 }
    ]
  },
  cannon: {
    type: 'cannon',
    baseName: 'Cannon',
    fireSound: 'cannon_1',
    tiers: [
      { level: 1, name: 'Dwarf Multicannon', damage: 0, minDamage: 0, maxDamage: 8, cooldown: 2 * TICK * 1000, range: 9 * 25, color: '#cd5c5c', upgradeCost: 100, special: 'aoe' },
      { level: 2, name: 'Granite Cannon', damage: 0, minDamage: 5, maxDamage: 12, cooldown: 2 * TICK * 1000, range: 9 * 25, color: '#808080', upgradeCost: 200, special: 'aoe' },
      { level: 3, name: 'Heavy Ballista', damage: 35, cooldown: 6 * TICK * 1000, range: 11 * 25, color: '#d2b48c', upgradeCost: 400 },
      { level: 4, name: 'Dragon Slayer Ballista', damage: 65, cooldown: 6 * TICK * 1000, range: 12 * 25, color: '#ff4500', upgradeCost: 800 }
    ]
  },
  tzhaar: {
    type: 'tzhaar',
    baseName: 'TzHaar',
    fireSound: 'tzhaar_1',
    tiers: [
      { level: 1, name: 'TzHaar-Ket', damage: 12, cooldown: 4 * TICK * 1000, range: 2 * 25, color: '#8B0000', upgradeCost: 150 },
      { level: 2, name: 'Toktz-xil-ak', damage: 22, cooldown: 4 * TICK * 1000, range: 2 * 25, color: '#ff4500', upgradeCost: 300 },
      { level: 3, name: 'TzHaar-Ket-Om', damage: 45, cooldown: 6 * TICK * 1000, range: 2 * 25, color: '#ff0000', upgradeCost: 600 },
      { level: 4, name: "Inquisitor's Mace", damage: 85, cooldown: 4 * TICK * 1000, range: 3 * 25, color: '#ffd700', upgradeCost: 1000 }
    ]
  },
  slayer: {
    type: 'slayer',
    baseName: 'Slayer',
    fireSound: 'slayer_1',
    tiers: [
      { level: 1, name: 'Slayer Crossbow', damage: 15, cooldown: 4 * TICK * 1000, range: 7 * 25, color: '#4B0082', upgradeCost: 125 },
      { level: 2, name: 'Karils Crossbow', damage: 25, cooldown: 3 * TICK * 1000, range: 8 * 25, color: '#006400', upgradeCost: 250 },
      { level: 3, name: 'Twisted Bow', damage: 55, cooldown: 5 * TICK * 1000, range: 10 * 25, color: '#00ff00', upgradeCost: 500 },
      { level: 4, name: 'Zaryte Crossbow', damage: 95, cooldown: 4 * TICK * 1000, range: 9 * 25, color: '#0000ff', upgradeCost: 1200 }
    ]
  },
  toxic: {
    type: 'toxic',
    baseName: 'Toxic',
    fireSound: 'toxic_1',
    tiers: [
      { level: 1, name: 'Toxic Blowpipe', damage: 8, cooldown: 2 * TICK * 1000, range: 5 * 25, color: '#2a6b5a', upgradeCost: 200, special: 'slow' },
      { level: 2, name: 'Serp Blowpipe', damage: 16, cooldown: 2 * TICK * 1000, range: 5 * 25, color: '#008b8b', upgradeCost: 400, special: 'slow' },
      { level: 3, name: 'Trident of Swamp', damage: 32, cooldown: 3 * TICK * 1000, range: 6 * 25, color: '#32cd32', upgradeCost: 800 },
      { level: 4, name: 'Magma Blowpipe', damage: 55, cooldown: 2 * TICK * 1000, range: 6 * 25, color: '#ff4500', upgradeCost: 1500 }
    ]
  }
};

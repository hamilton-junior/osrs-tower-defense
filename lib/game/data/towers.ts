
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
    baseName: 'Archer',
    fireSound: 'archer',
    tiers: [
      { level: 1, name: 'Shortbow', damage: 13, cooldown: 3 * TICK * 1000, range: 7 * 25, color: '#9acd32', upgradeCost: 100 },
      { level: 2, name: 'Magic Shortbow', damage: 26, cooldown: 3 * TICK * 1000, range: 8 * 25, color: '#32CD32', upgradeCost: 250 },
      { level: 3, name: 'Crystal Bow', damage: 38, cooldown: 5 * TICK * 1000, range: 9 * 25, color: '#E0FFFF', upgradeCost: 500 },
      { level: 4, name: 'Bow of Faerdhinen', damage: 53, cooldown: 3 * TICK * 1000, range: 10 * 25, color: '#a020f0', upgradeCost: 0 }
    ]
  },
  wizard: {
    type: 'wizard',
    baseName: 'Wizard',
    fireSound: 'wizard',
    tiers: [
      { level: 1, name: 'Air Strike', damage: 8, cooldown: 5 * TICK * 1000, range: 7 * 25, color: '#a0cfff', upgradeCost: 150 },
      { level: 2, name: 'Air Bolt', damage: 15, cooldown: 5 * TICK * 1000, range: 7 * 25, color: '#a0cfff', upgradeCost: 300 },
      { level: 3, name: 'Air Blast', damage: 25, cooldown: 5 * TICK * 1000, range: 8 * 25, color: '#a0cfff', upgradeCost: 600 },
      { level: 4, name: 'Ancient Magicks', damage: 45, cooldown: 5 * TICK * 1000, range: 8 * 25, color: '#7b68ee', upgradeCost: 0 }
    ]
  },
  cannon: {
    type: 'cannon',
    baseName: 'Cannon',
    fireSound: 'cannon_1',
    tiers: [
      { level: 1, name: 'Dwarf Multicannon', damage: 0, minDamage: 0, maxDamage: 30, cooldown: 2 * TICK * 1000, range: 9 * 25, color: '#cd5c5c', upgradeCost: 300, special: 'aoe' },
      { level: 2, name: 'Granite Cannon', damage: 0, minDamage: 10, maxDamage: 45, cooldown: 2 * TICK * 1000, range: 9 * 25, color: '#808080', upgradeCost: 600, special: 'aoe' },
      { level: 3, name: 'Heavy Ballista', damage: 80, cooldown: 6 * TICK * 1000, range: 11 * 25, color: '#d2b48c', upgradeCost: 1200 },
      { level: 4, name: 'Dragon Slayer Ballista', damage: 150, cooldown: 6 * TICK * 1000, range: 12 * 25, color: '#ff4500', upgradeCost: 0 }
    ]
  },
  tzhaar: {
    type: 'tzhaar',
    baseName: 'TzHaar',
    fireSound: 'tzhaar_1',
    tiers: [
      { level: 1, name: 'TzHaar-Ket', damage: 35, cooldown: 4 * TICK * 1000, range: 2 * 25, color: '#8B0000', upgradeCost: 400 },
      { level: 2, name: 'Toktz-xil-ak', damage: 60, cooldown: 4 * TICK * 1000, range: 2 * 25, color: '#ff4500', upgradeCost: 800 },
      { level: 3, name: 'TzHaar-Ket-Om', damage: 120, cooldown: 6 * TICK * 1000, range: 2 * 25, color: '#ff0000', upgradeCost: 1500 },
      { level: 4, name: "Inquisitor's Mace", damage: 200, cooldown: 4 * TICK * 1000, range: 3 * 25, color: '#ffd700', upgradeCost: 0 }
    ]
  },
  slayer: {
    type: 'slayer',
    baseName: 'Slayer',
    fireSound: 'slayer_1',
    tiers: [
      { level: 1, name: 'Slayer Crossbow', damage: 40, cooldown: 4 * TICK * 1000, range: 7 * 25, color: '#4B0082', upgradeCost: 250 },
      { level: 2, name: 'Karils Crossbow', damage: 65, cooldown: 3 * TICK * 1000, range: 8 * 25, color: '#006400', upgradeCost: 500 },
      { level: 3, name: 'Twisted Bow', damage: 120, cooldown: 5 * TICK * 1000, range: 10 * 25, color: '#00ff00', upgradeCost: 1000 },
      { level: 4, name: 'Zaryte Crossbow', damage: 180, cooldown: 4 * TICK * 1000, range: 9 * 25, color: '#0000ff', upgradeCost: 0 }
    ]
  },
  toxic: {
    type: 'toxic',
    baseName: 'Toxic',
    fireSound: 'toxic_1',
    tiers: [
      { level: 1, name: 'Toxic Blowpipe', damage: 20, cooldown: 2 * TICK * 1000, range: 5 * 25, color: '#2a6b5a', upgradeCost: 500, special: 'slow' },
      { level: 2, name: 'Serp Blowpipe', damage: 35, cooldown: 2 * TICK * 1000, range: 5 * 25, color: '#008b8b', upgradeCost: 1000, special: 'slow' },
      { level: 3, name: 'Trident of Swamp', damage: 80, cooldown: 3 * TICK * 1000, range: 6 * 25, color: '#32cd32', upgradeCost: 2000 },
      { level: 4, name: 'Magma Blowpipe', damage: 120, cooldown: 2 * TICK * 1000, range: 6 * 25, color: '#ff4500', upgradeCost: 0 }
    ]
  }
};

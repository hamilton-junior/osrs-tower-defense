
export interface NodeConfig {
  type: 'tree' | 'ore' | 'herb';
  name: string;
  x: number;
  y: number;
  level: number;
  xp: number;
}

export const NODE_CONFIGS: NodeConfig[] = [
  // Trees
  { type: 'tree', name: 'Tree', x: 0.1, y: 0.4, level: 1, xp: 7 },
  { type: 'tree', name: 'Oak Tree', x: 0.15, y: 0.45, level: 15, xp: 15 },
  { type: 'tree', name: 'Willow Tree', x: 0.4, y: 0.1, level: 30, xp: 67 },
  { type: 'tree', name: 'Maple Tree', x: 0.45, y: 0.15, level: 45, xp: 100 },
  { type: 'tree', name: 'Yew Tree', x: 0.5, y: 0.2, level: 60, xp: 175 },
  { type: 'tree', name: 'Magic Tree', x: 0.55, y: 0.25, level: 75, xp: 250 },

  // Ores
  { type: 'ore', name: 'Tin Rock', x: 0.7, y: 0.2, level: 1, xp: 17 },
  { type: 'ore', name: 'Copper Rock', x: 0.75, y: 0.25, level: 1, xp: 17 },
  { type: 'ore', name: 'Iron Rock', x: 0.8, y: 0.3, level: 15, xp: 35 },
  { type: 'ore', name: 'Coal Rock', x: 0.3, y: 0.6, level: 30, xp: 50 },
  { type: 'ore', name: 'Mithril Rock', x: 0.35, y: 0.65, level: 55, xp: 80 },
  { type: 'ore', name: 'Adamant Rock', x: 0.4, y: 0.7, level: 70, xp: 95 },
  { type: 'ore', name: 'Runite Rock', x: 0.45, y: 0.75, level: 85, xp: 125 },

  // Herbs
  { type: 'herb', name: 'Guam Leaf', x: 0.6, y: 0.9, level: 1, xp: 11 },
  { type: 'herb', name: 'Ranarr Weed', x: 0.65, y: 0.85, level: 25, xp: 40 },
  { type: 'herb', name: 'Snapdragon', x: 0.9, y: 0.3, level: 59, xp: 98 },
  { type: 'herb', name: 'Torstol', x: 0.95, y: 0.35, level: 75, xp: 150 },
];

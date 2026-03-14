
export interface NodeConfig {
  type: 'tree' | 'ore' | 'herb';
  name: string;
  x: number;
  y: number;
  level: number;
  xp: number;
}

export const NODE_CONFIGS: NodeConfig[] = [
  { type: 'tree', name: 'Oak Tree', x: 0.1, y: 0.4, level: 1, xp: 15 },
  { type: 'tree', name: 'Willow Tree', x: 0.4, y: 0.1, level: 30, xp: 67 },
  { type: 'ore', name: 'Iron Rock', x: 0.7, y: 0.2, level: 15, xp: 35 },
  { type: 'ore', name: 'Coal Rock', x: 0.3, y: 0.6, level: 30, xp: 50 },
  { type: 'herb', name: 'Ranarr Weed', x: 0.6, y: 0.9, level: 25, xp: 40 },
  { type: 'herb', name: 'Snapdragon', x: 0.9, y: 0.3, level: 59, xp: 98 },
];

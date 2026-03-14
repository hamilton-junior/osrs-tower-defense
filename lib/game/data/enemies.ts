
export interface EnemyDef {
  type: string | any; // Keep flexible for now or use EnemyType
  name: string;
  hp: number;
  speed: number;
  color: string;
  reward: number;
  resistance?: number;
  deathSound?: string;
  weakness?: any;
  isBoss?: boolean;
  waveUnlock?: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  goblin: {
    type: 'goblin',
    name: 'Goblin',
    hp: 6,
    speed: 60,
    color: '#4a704a',
    reward: 2,
    waveUnlock: 1
  },
  rat: {
    type: 'rat',
    name: 'Giant Rat',
    hp: 6,
    speed: 80,
    color: '#8b8b8b',
    reward: 2,
    waveUnlock: 1
  },
  cow: {
    type: 'cow',
    name: 'Cow',
    hp: 8,
    speed: 40,
    color: '#ffffff',
    reward: 3,
    waveUnlock: 2
  },
  imp: {
    type: 'imp',
    name: 'Imp',
    hp: 8,
    speed: 120,
    color: '#ff0000',
    reward: 4,
    waveUnlock: 3
  },
  spider: {
    type: 'spider',
    name: 'Giant Spider',
    hp: 50,
    speed: 90,
    color: '#333333',
    reward: 5,
    waveUnlock: 2
  },
  skeleton: {
    type: 'skeleton',
    name: 'Skeleton',
    hp: 30,
    speed: 55,
    color: '#eeeeee',
    reward: 3,
    waveUnlock: 1
  },
  zombie: {
    type: 'zombie',
    name: 'Zombie',
    hp: 30,
    speed: 40,
    color: '#6b8e23',
    reward: 4,
    waveUnlock: 2
  },
  ghost: {
    type: 'ghost',
    name: 'Ghost',
    hp: 25,
    speed: 50,
    color: '#e0ffff',
    reward: 3,
    waveUnlock: 1
  },
  hellhound: {
    type: 'hellhound',
    name: 'Hellhound',
    hp: 116,
    speed: 70,
    color: '#ff4500',
    reward: 12,
    waveUnlock: 4
  },
  scorpion: {
    type: 'scorpion',
    name: 'Scorpion',
    hp: 17,
    speed: 60,
    color: '#d2b48c',
    reward: 7,
    waveUnlock: 3
  },
  fire_giant: {
    type: 'fire_giant',
    name: 'Fire Giant',
    hp: 120,
    speed: 35,
    color: '#ff0000',
    reward: 20,
    deathSound: 'demon',
    waveUnlock: 5
  },
  bloodveld: {
    type: 'bloodveld',
    name: 'Bloodveld',
    hp: 105,
    speed: 45,
    color: '#ff69b4',
    reward: 18,
    waveUnlock: 6
  },
  hill_giant: {
    type: 'hill_giant',
    name: 'Hill Giant',
    hp: 60,
    speed: 30,
    color: '#d2b48c',
    reward: 10,
    deathSound: 'demon',
    waveUnlock: 4
  },
  black_demon: {
    type: 'black_demon',
    name: 'Black Demon',
    hp: 150,
    speed: 40,
    color: '#1a1a1a',
    reward: 35,
    deathSound: 'demon',
    waveUnlock: 8
  },
  gargoyle: {
    type: 'gargoyle',
    name: 'Gargoyle',
    hp: 105,
    speed: 35,
    color: '#808080',
    reward: 32,
    waveUnlock: 9
  },
  blue_dragon: {
    type: 'blue_dragon',
    name: 'Blue Dragon',
    hp: 105,
    speed: 40,
    color: '#0000ff',
    reward: 50,
    deathSound: 'dragon',
    waveUnlock: 10
  },
  nechryael: {
    type: 'nechryael',
    name: 'Nechryael',
    hp: 105,
    speed: 45,
    color: '#4b0082',
    reward: 40,
    waveUnlock: 11
  },
  abyssal_demon: {
    type: 'abyssal_demon',
    name: 'Abyssal Demon',
    hp: 96,
    speed: 65,
    color: '#4b0082',
    reward: 56,
    deathSound: 'abyssal_demon',
    waveUnlock: 12
  },
  lesser_demon: {
    type: 'lesser_demon',
    name: 'Lesser Demon',
    hp: 70,
    speed: 50,
    color: '#8b0000',
    reward: 16,
    deathSound: 'demon',
    weakness: 'fire',
    waveUnlock: 5
  },
  dark_beast: {
    type: 'dark_beast',
    name: 'Dark Beast',
    hp: 220,
    speed: 55,
    color: '#000000',
    reward: 90,
    waveUnlock: 15
  },
  green_dragon: {
    type: 'green_dragon',
    name: 'Green Dragon',
    hp: 100,
    speed: 45,
    color: '#228b22',
    reward: 30,
    deathSound: 'dragon',
    waveUnlock: 7
  },
  jad: {
    type: 'jad',
    name: 'TzTok-Jad',
    hp: 250,
    speed: 20,
    color: '#ff4500',
    reward: 400,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.5
  },
  vorkath: {
    type: 'vorkath',
    name: 'Vorkath',
    hp: 750,
    speed: 15,
    color: '#4682b4',
    reward: 700,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.6
  },
  zulrah: {
    type: 'zulrah',
    name: 'Zulrah',
    hp: 500,
    speed: 25,
    color: '#32cd32',
    reward: 800,
    deathSound: 'boss',
    isBoss: true,
    resistance: 0.4
  },
  barrow_wight: {
    type: 'barrow_wight',
    name: 'Barrow Wight',
    hp: 100,
    speed: 35,
    color: '#8b0000',
    reward: 24,
    deathSound: 'demon',
    waveUnlock: 8
  },
  chaos_druid: {
    type: 'chaos_druid',
    name: 'Chaos Druid',
    hp: 40,
    speed: 55,
    color: '#2e8b57',
    reward: 9,
    deathSound: 'human',
    waveUnlock: 3
  },
  skeletal_mage: {
    type: 'skeletal_mage',
    name: 'Skeletal Mage',
    hp: 30,
    speed: 50,
    color: '#add8e6',
    reward: 15,
    deathSound: 'zombie',
    waveUnlock: 5
  },
  hydra: {
    type: 'hydra',
    name: 'Hydra',
    hp: 1100,
    speed: 30,
    color: '#006400',
    reward: 100,
    deathSound: 'dragon',
    waveUnlock: 15
  }
};

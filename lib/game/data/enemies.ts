
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
    hp: 15,
    speed: 60,
    color: '#4a704a',
    reward: 10,
    waveUnlock: 1
  },
  rat: {
    type: 'rat',
    name: 'Giant Rat',
    hp: 20,
    speed: 80,
    color: '#8b8b8b',
    reward: 12,
    waveUnlock: 1
  },
  cow: {
    type: 'cow',
    name: 'Cow',
    hp: 40,
    speed: 40,
    color: '#ffffff',
    reward: 15,
    waveUnlock: 2
  },
  imp: {
    type: 'imp',
    name: 'Imp',
    hp: 30,
    speed: 120,
    color: '#ff0000',
    reward: 20,
    waveUnlock: 3
  },
  spider: {
    type: 'spider',
    name: 'Giant Spider',
    hp: 50,
    speed: 90,
    color: '#333333',
    reward: 25,
    waveUnlock: 2
  },
  skeleton: {
    type: 'skeleton',
    name: 'Skeleton',
    hp: 35,
    speed: 55,
    color: '#eeeeee',
    reward: 15,
    waveUnlock: 1
  },
  zombie: {
    type: 'zombie',
    name: 'Zombie',
    hp: 60,
    speed: 40,
    color: '#6b8e23',
    reward: 20,
    waveUnlock: 2
  },
  ghost: {
    type: 'ghost',
    name: 'Ghost',
    hp: 45,
    speed: 50,
    color: '#e0ffff',
    reward: 18,
    waveUnlock: 1
  },
  hellhound: {
    type: 'hellhound',
    name: 'Hellhound',
    hp: 180,
    speed: 70,
    color: '#ff4500',
    reward: 60,
    waveUnlock: 4
  },
  scorpion: {
    type: 'scorpion',
    name: 'Scorpion',
    hp: 80,
    speed: 60,
    color: '#d2b48c',
    reward: 35,
    waveUnlock: 3
  },
  fire_giant: {
    type: 'giant',
    name: 'Fire Giant',
    hp: 300,
    speed: 35,
    color: '#ff0000',
    reward: 100,
    waveUnlock: 5
  },
  bloodveld: {
    type: 'bloodveld',
    name: 'Bloodveld',
    hp: 250,
    speed: 45,
    color: '#ff69b4',
    reward: 85,
    waveUnlock: 6
  },
  hill_giant: {
    type: 'giant',
    name: 'Hill Giant',
    hp: 150,
    speed: 30,
    color: '#d2b48c',
    reward: 50,
    waveUnlock: 4
  },
  black_demon: {
    type: 'demon',
    name: 'Black Demon',
    hp: 600,
    speed: 40,
    color: '#1a1a1a',
    reward: 180,
    waveUnlock: 8
  },
  gargoyle: {
    type: 'gargoyle',
    name: 'Gargoyle',
    hp: 550,
    speed: 35,
    color: '#808080',
    reward: 160,
    waveUnlock: 9
  },
  blue_dragon: {
    type: 'dragon',
    name: 'Blue Dragon',
    hp: 800,
    speed: 40,
    color: '#0000ff',
    reward: 250,
    waveUnlock: 10
  },
  nechryael: {
    type: 'nechryael',
    name: 'Nechryael',
    hp: 700,
    speed: 45,
    color: '#4b0082',
    reward: 200,
    waveUnlock: 11
  },
  abyssal_demon: {
    type: 'demon',
    name: 'Abyssal Demon',
    hp: 850,
    speed: 65,
    color: '#4b0082',
    reward: 280,
    waveUnlock: 12
  },
  lesser_demon: {
    type: 'demon',
    name: 'Lesser Demon',
    hp: 250,
    speed: 50,
    color: '#8b0000',
    reward: 80,
    weakness: 'fire',
    waveUnlock: 5
  },
  dark_beast: {
    type: 'dark_beast',
    name: 'Dark Beast',
    hp: 1200,
    speed: 55,
    color: '#000000',
    reward: 450,
    waveUnlock: 15
  },
  green_dragon: {
    type: 'dragon',
    name: 'Green Dragon',
    hp: 500,
    speed: 45,
    color: '#228b22',
    reward: 150,
    waveUnlock: 7
  },
  jad: {
    type: 'boss',
    name: 'TzTok-Jad',
    hp: 5000,
    speed: 20,
    color: '#ff4500',
    reward: 2000,
    isBoss: true,
    resistance: 0.5
  },
  vorkath: {
    type: 'boss',
    name: 'Vorkath',
    hp: 8000,
    speed: 15,
    color: '#4682b4',
    reward: 3500,
    isBoss: true,
    resistance: 0.6
  },
  zulrah: {
    type: 'boss',
    name: 'Zulrah',
    hp: 6000,
    speed: 25,
    color: '#32cd32',
    reward: 4000,
    isBoss: true,
    resistance: 0.4
  }
};

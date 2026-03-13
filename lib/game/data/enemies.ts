
import { EnemyDef } from '../types';

export const ENEMIES: Record<string, EnemyDef> = {
  goblin: {
    type: 'goblin',
    name: 'Goblin',
    hp: 15,
    speed: 60,
    color: '#4a704a',
    reward: 10
  },
  rat: {
    type: 'rat',
    name: 'Giant Rat',
    hp: 20,
    speed: 80,
    color: '#8b8b8b',
    reward: 12
  },
  cow: {
    type: 'cow',
    name: 'Cow',
    hp: 40,
    speed: 40,
    color: '#ffffff',
    reward: 15
  },
  imp: {
    type: 'imp',
    name: 'Imp',
    hp: 30,
    speed: 120,
    color: '#ff0000',
    reward: 20
  },
  spider: {
    type: 'spider',
    name: 'Giant Spider',
    hp: 50,
    speed: 90,
    color: '#333333',
    reward: 25
  },
  hill_giant: {
    type: 'hill_giant',
    name: 'Hill Giant',
    hp: 150,
    speed: 30,
    color: '#d2b48c',
    reward: 50
  },
  lesser_demon: {
    type: 'lesser_demon',
    name: 'Lesser Demon',
    hp: 250,
    speed: 50,
    color: '#8b0000',
    reward: 80,
    weakness: 'fire'
  },
  green_dragon: {
    type: 'green_dragon',
    name: 'Green Dragon',
    hp: 500,
    speed: 45,
    color: '#228b22',
    reward: 150
  },
  blue_dragon: {
    type: 'blue_dragon',
    name: 'Blue Dragon',
    hp: 800,
    speed: 40,
    color: '#0000ff',
    reward: 250
  },
  jad: {
    type: 'jad',
    name: 'TzTok-Jad',
    hp: 5000,
    speed: 20,
    color: '#ff4500',
    reward: 2000,
    isBoss: true,
    resistance: 0.5
  },
  vorkath: {
    type: 'vorkath',
    name: 'Vorkath',
    hp: 8000,
    speed: 15,
    color: '#4682b4',
    reward: 3500,
    isBoss: true,
    resistance: 0.6
  },
  zulrah: {
    type: 'zulrah',
    name: 'Zulrah',
    hp: 6000,
    speed: 25,
    color: '#32cd32',
    reward: 4000,
    isBoss: true,
    resistance: 0.4
  }
};

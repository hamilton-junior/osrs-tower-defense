
import { Quest } from '../types';

export const QUESTS: Quest[] = [
  {
    id: 'cooks_assistant',
    name: "Cook's Assistant",
    description: 'Kill 20 Goblins for the cook.',
    objective: { type: 'kill', target: 20, current: 0, enemyType: 'goblin' },
    reward: { 
      money: 100, 
      essence: 5,
      item: { id: 'amulet_of_power', name: 'Amulet of Power', description: '+5 DMG, +10% XP gain', type: 'accessory', bonus: { damage: 5, xpBonus: 10 } }
    },
    completed: false,
    claimed: false
  },
  {
    id: 'dragon_slayer',
    name: 'Dragon Slayer',
    description: 'Defeat 5 Green Dragons.',
    objective: { type: 'kill', target: 5, current: 0, enemyType: 'green_dragon' },
    reward: { 
      money: 500, 
      essence: 20,
      item: { id: 'anti_dragon_shield', name: 'Anti-dragon Shield', description: 'Range +20, +15% XP gain', type: 'shield', bonus: { range: 20, xpBonus: 15 } }
    },
    completed: false,
    claimed: false
  },
  {
    id: 'wave_master',
    name: 'Wave Master',
    description: 'Reach Wave 10.',
    objective: { type: 'wave', target: 10, current: 0 },
    reward: { 
      money: 300, 
      essence: 10,
      item: { id: 'combat_bracelet', name: 'Combat Bracelet', description: 'Damage +8', type: 'accessory', bonus: { damage: 8 } }
    },
    completed: false,
    claimed: false
  },
  {
    id: 'demon_slayer',
    name: 'Demon Slayer',
    description: 'Kill 50 Lesser Demons.',
    objective: { type: 'kill', target: 50, current: 0, enemyType: 'lesser_demon' },
    reward: { 
      money: 400, 
      essence: 15,
      item: { id: 'silverlight', name: 'Silverlight', description: 'Damage +15 against demons', type: 'weapon', bonus: { damage: 15 } }
    },
    completed: false,
    claimed: false
  },
  {
    id: 'dragon_master',
    name: 'Dragon Master',
    description: 'Kill 10 Blue Dragons.',
    objective: { type: 'kill', target: 10, current: 0, enemyType: 'blue_dragon' },
    reward: { 
      money: 1000, 
      essence: 50,
      item: { id: 'dragon_scimitar', name: 'Dragon Scimitar', description: 'Massive damage +25', type: 'weapon', bonus: { damage: 25 } }
    },
    completed: false,
    claimed: false
  }
];

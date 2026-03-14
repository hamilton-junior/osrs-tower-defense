
import { Recipe } from '../types';

export const POTION_RECIPES: Recipe[] = [
  {
    id: 'strength_potion',
    name: 'Strength Potion',
    ingredients: [{ itemId: 'clean_tarromin', amount: 1 }, { itemId: 'limpwurt_root', amount: 1 }],
    resultItemId: 'strength_potion_3',
    level: 12,
    xp: 50,
    skill: 'herblore',
    icon: 'Strength_potion(3)'
  },
  {
    id: 'prayer_potion',
    name: 'Prayer Potion',
    ingredients: [{ itemId: 'clean_ranarr', amount: 1 }, { itemId: 'snape_grass', amount: 1 }],
    resultItemId: 'prayer_potion_3',
    level: 38,
    xp: 87.5,
    skill: 'herblore',
    icon: 'Prayer_potion(3)'
  },
  {
    id: 'super_strength',
    name: 'Super Strength',
    ingredients: [{ itemId: 'clean_kwuarm', amount: 1 }, { itemId: 'limpwurt_root', amount: 1 }],
    resultItemId: 'super_strength_3',
    level: 55,
    xp: 125,
    skill: 'herblore',
    icon: 'Super_strength(3)'
  },
  {
    id: 'ranging_potion',
    name: 'Ranging Potion',
    ingredients: [{ itemId: 'clean_dwarf_weed', amount: 1 }, { itemId: 'wine_of_zamorak', amount: 1 }],
    resultItemId: 'ranging_potion_3',
    level: 72,
    xp: 162.5,
    skill: 'herblore',
    icon: 'Ranging_potion(3)'
  },
  {
    id: 'magic_potion',
    name: 'Magic Potion',
    ingredients: [{ itemId: 'clean_lantadyme', amount: 1 }, { itemId: 'potato_cactus', amount: 1 }],
    resultItemId: 'magic_potion_3',
    level: 76,
    xp: 172.5,
    skill: 'herblore',
    icon: 'Magic_potion(3)'
  }
];

export const SMITHING_RECIPES: Recipe[] = [
  {
    id: 'bronze_bar',
    name: 'Bronze Bar',
    ingredients: [{ itemId: 'copper_ore', amount: 1 }, { itemId: 'tin_ore', amount: 1 }],
    resultItemId: 'bronze_bar',
    level: 1,
    xp: 6.25,
    skill: 'crafting'
  },
  {
    id: 'iron_bar',
    name: 'Iron Bar',
    ingredients: [{ itemId: 'iron_ore', amount: 1 }],
    resultItemId: 'iron_bar',
    level: 15,
    xp: 12.5,
    skill: 'crafting'
  },
  {
    id: 'steel_bar',
    name: 'Steel Bar',
    ingredients: [{ itemId: 'iron_ore', amount: 1 }, { itemId: 'coal', amount: 1 }],
    resultItemId: 'steel_bar',
    level: 30,
    xp: 25,
    skill: 'crafting'
  },
  {
    id: 'mithril_bar',
    name: 'Mithril Bar',
    ingredients: [{ itemId: 'mithril_ore', amount: 1 }, { itemId: 'coal', amount: 2 }],
    resultItemId: 'mithril_bar',
    level: 50,
    xp: 50,
    skill: 'crafting'
  },
  {
    id: 'adamantite_bar',
    name: 'Adamantite Bar',
    ingredients: [{ itemId: 'adamantite_ore', amount: 1 }, { itemId: 'coal', amount: 4 }],
    resultItemId: 'adamantite_bar',
    level: 70,
    xp: 100,
    skill: 'crafting'
  },
  {
    id: 'rune_bar',
    name: 'Rune Bar',
    ingredients: [{ itemId: 'rune_ore', amount: 1 }, { itemId: 'coal', amount: 6 }],
    resultItemId: 'rune_bar',
    level: 90,
    xp: 200,
    skill: 'crafting'
  }
];

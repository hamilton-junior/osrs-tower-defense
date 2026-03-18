
export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  cost: number;
  wiki: string;
  type: 'potion' | 'essence' | 'scroll' | 'ore' | 'herb' | 'logs' | 'bones' | 'seed' | 'other';
}

export const GE_CONSUMABLES: ShopItem[] = [
  //Potions
  { id: 'ranging', name: 'Ranging Potion', desc: 'Archer Damage & Range +15%', cost: 100, wiki: 'Ranging_potion(4)', type: 'potion' },
  { id: 'magic', name: 'Magic Potion', desc: 'Wizard Damage +20%', cost: 150, wiki: 'Magic_potion(4)', type: 'potion' },
  { id: 'super_combat', name: 'Super Combat Potion', desc: 'TzHaar Damage +15%', cost: 200, wiki: 'Super_combat_potion(4)', type: 'potion' },
  { id: 'prayer_potion', name: 'Prayer Potion', desc: 'Restore 10 Prayer Points', cost: 50, wiki: 'Prayer_potion(4)', type: 'potion' },
  { id: 'super_restore', name: 'Super Restore', desc: 'Restore 20 Prayer Points', cost: 100, wiki: 'Super_restore(4)', type: 'potion' },
  { id: 'overload', name: 'Overload Potion', desc: 'All Towers +15% Stats', cost: 500, wiki: 'Overload_(4)', type: 'potion' },

  //Ores
  { id: 'bronze_ore', name: 'Bronze Ore', desc: 'Used in smithing.', cost: 10, wiki: 'Bronze_ore', type: 'ore' },
  { id: 'iron_ore', name: 'Iron Ore', desc: 'Used in smithing.', cost: 20, wiki: 'Iron_ore', type: 'ore' },
  { id: 'coal', name: 'Coal', desc: 'Fuel for smelting.', cost: 50, wiki: 'Coal', type: 'ore' },
  { id: 'mithril_ore', name: 'Mithril Ore', desc: 'Used in smithing.', cost: 50, wiki: 'Mithril_ore', type: 'ore' },
  { id: 'adamantite_ore', name: 'Adamantite Ore', desc: 'Used in smithing.', cost: 100, wiki: 'Adamantite_ore', type: 'ore' },
  { id: 'rune_ore', name: 'Rune Ore', desc: 'Used in smithing.', cost: 250, wiki: 'Rune_ore', type: 'ore' },
 
  //Herbs & Ingredients
  { id: 'grimy_guam', name: 'Grimy Guam', desc: 'Needs cleaning.', cost: 10, wiki: 'Grimy_guam', type: 'herb' },
  { id: 'clean_guam', name: 'Clean Guam', desc: 'Ready for potions.', cost: 15, wiki: 'Clean_guam', type: 'herb' },
  { id: 'grimy_ranarr', name: 'Grimy Ranarr', desc: 'Valuable herb.', cost: 50, wiki: 'Grimy_ranarr', type: 'herb' },
  { id: 'clean_ranarr', name: 'Clean Ranarr', desc: 'Used in prayer potions.', cost: 70, wiki: 'Clean_ranarr', type: 'herb' },
  { id: 'vial_of_water', name: 'Vial of water', desc: 'Used to make potions.', cost: 5, wiki: 'Vial_of_water', type: 'herb' },
  { id: 'eye_of_newt', name: 'Eye of newt', desc: 'Used to make attack potions.', cost: 10, wiki: 'Eye_of_newt', type: 'herb' },
  { id: 'limpwurt_root', name: 'Limpwurt root', desc: 'Used to make strength potions.', cost: 50, wiki: 'Limpwurt_root', type: 'herb' },
  { id: 'red_spiders_eggs', name: "Red spider's eggs", desc: 'Used to make restore potions.', cost: 30, wiki: 'Red_spiders_eggs', type: 'herb' },
  { id: 'birds_nest', name: 'Bird nest', desc: 'Used to make saradomin brews.', cost: 100, wiki: 'Bird_nest', type: 'herb' },
  { id: 'snape_grass', name: 'Snape Grass', desc: 'Used in prayer potions.', cost: 100, wiki: 'Snape_grass', type: 'herb' },
  
  //Seeds
  { id: 'guam_seed', name: 'Guam Seed', desc: 'Can be planted in a herb patch.', cost: 20, wiki: 'Guam_seed', type: 'seed' },
  { id: 'harralander_seed', name: 'Harralander Seed', desc: 'Can be planted in a herb patch.', cost: 40, wiki: 'Harralander_seed', type: 'seed' },
  { id: 'toadflax_seed', name: 'Toadflax Seed', desc: 'Can be planted in a herb patch.', cost: 80, wiki: 'Toadflax_seed', type: 'seed' },
  { id: 'ranarr_seed', name: 'Ranarr Seed', desc: 'Can be planted in a herb patch.', cost: 100, wiki: 'Ranarr_seed', type: 'seed' },
  { id: 'snapdragon_seed', name: 'Snapdragon Seed', desc: 'Can be planted in a herb patch.', cost: 150, wiki: 'Snapdragon_seed', type: 'seed' },
  { id: 'torstol_seed', name: 'Torstol Seed', desc: 'Can be planted in a herb patch.', cost: 250, wiki: 'Torstol_seed', type: 'seed' },
  { id: 'potato_seed', name: 'Potato Seed', desc: 'Can be planted in an allotment patch.', cost: 5, wiki: 'Potato_seed', type: 'seed' },
  { id: 'onion_seed', name: 'Onion Seed', desc: 'Can be planted in an allotment patch.', cost: 8, wiki: 'Onion_seed', type: 'seed' },
  { id: 'cabbage_seed', name: 'Cabbage Seed', desc: 'Can be planted in an allotment patch.', cost: 12, wiki: 'Cabbage_seed', type: 'seed' },
  { id: 'sweetcorn_seed', name: 'Sweetcorn Seed', desc: 'Can be planted in an allotment patch.', cost: 20, wiki: 'Sweetcorn_seed', type: 'seed' },
  { id: 'watermelon_seed', name: 'Watermelon Seed', desc: 'Can be planted in an allotment patch.', cost: 40, wiki: 'Watermelon_seed', type: 'seed' },
  { id: 'snape_grass_seed', name: 'Snape Grass Seed', desc: 'Can be planted in an allotment patch.', cost: 80, wiki: 'Snape_grass_seed', type: 'seed' },

  //Bones
  { id: 'bones', name: 'Bones', desc: 'Basic prayer fodder.', cost: 5, wiki: 'Bones', type: 'bones' },
  { id: 'big_bones', name: 'Big Bones', desc: 'Better prayer XP.', cost: 20, wiki: 'Big_bones', type: 'bones' },
  { id: 'dragon_bones', name: 'Dragon Bones', desc: 'High-tier prayer XP.', cost: 100, wiki: 'Dragon_bones', type: 'bones' },

  //Logs
  { id: 'logs', name: 'Logs', desc: 'Basic wood.', cost: 5, wiki: 'Logs', type: 'logs' },
  { id: 'oak_logs', name: 'Oak Logs', desc: 'Sturdier wood.', cost: 15, wiki: 'Oak_logs', type: 'logs' },
  { id: 'willow_logs', name: 'Willow Logs', desc: 'Used for bowmaking.', cost: 30, wiki: 'Willow_logs', type: 'logs' },
  { id: 'yew_logs', name: 'Yew Logs', desc: 'Used for better bowmaking.', cost: 50, wiki: 'Yew_logs', type: 'logs' },
  { id: 'magic_logs', name: 'Magic Logs', desc: 'Used for magic bowmaking.', cost: 100, wiki: 'Magic_logs', type: 'logs' },
];

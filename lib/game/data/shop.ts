
export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  cost: number;
  wiki: string;
  type: 'potion' | 'essence' | 'scroll' | 'ore' | 'herb' | 'logs' | 'bones' | 'other';
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
 
 //Herbs
  { id: 'grimy_guam', name: 'Grimy Guam', desc: 'Needs cleaning.', cost: 10, wiki: 'Grimy_guam', type: 'herb' },
  { id: 'clean_guam', name: 'Clean Guam', desc: 'Ready for potions.', cost: 15, wiki: 'Clean_guam', type: 'herb' },
  { id: 'grimy_ranarr', name: 'Grimy Ranarr', desc: 'Valuable herb.', cost: 50, wiki: 'Grimy_ranarr', type: 'herb' },
  { id: 'clean_ranarr', name: 'Clean Ranarr', desc: 'Used in prayer potions.', cost: 70, wiki: 'Clean_ranarr', type: 'herb' },

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

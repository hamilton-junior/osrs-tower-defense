
import { Item } from '../types';

export const ITEMS: Record<string, Item> = {
  // Melee Weapons
  bronze_scimitar: { id: 'bronze_scimitar', name: 'Bronze Scimitar', description: 'A basic blade.', bonus: { damage: 5 }, type: 'weapon', sellPrice: 20 },
  iron_scimitar: { id: 'iron_scimitar', name: 'Iron Scimitar', description: 'Better than bronze.', bonus: { damage: 10 }, type: 'weapon', sellPrice: 50 },
  steel_scimitar: { id: 'steel_scimitar', name: 'Steel Scimitar', description: 'Standard issue.', bonus: { damage: 15 }, type: 'weapon', sellPrice: 150 },
  mithril_scimitar: { id: 'mithril_scimitar', name: 'Mithril Scimitar', description: 'Lightweight and sharp.', bonus: { damage: 25 }, type: 'weapon', sellPrice: 400 },
  adamant_scimitar: { id: 'adamant_scimitar', name: 'Adamant Scimitar', description: 'Very strong.', bonus: { damage: 40 }, type: 'weapon', sellPrice: 1000 },
  rune_scimitar: { id: 'rune_scimitar', name: 'Rune Scimitar', description: 'The power of runite.', bonus: { damage: 60 }, type: 'weapon', sellPrice: 2500 },
  dragon_scimitar: { id: 'dragon_scimitar', name: 'Dragon Scimitar', description: 'Ancient power.', bonus: { damage: 90 }, type: 'weapon', sellPrice: 5000 },
  
  // Rare Drops
  abyssal_whip: { id: 'abyssal_whip', name: 'Abyssal Whip', description: 'A living lash.', bonus: { damage: 150, cooldown: 10 }, type: 'weapon', sellPrice: 7500},
  scythe_of_vitur: { id: 'scythe_of_vitur', name: 'Scythe of Vitur', description: 'Reaps the soul.', bonus: { damage: 250, range: 20 }, type: 'weapon', sellPrice: 25000 },
  twisted_bow: { id: 'twisted_bow', name: 'Twisted Bow', description: 'Power based on enemy magic.', bonus: { damage: 120, range: 40 }, type: 'weapon', sellPrice: 25000 },

  // Accessories
  amulet_of_power: { id: 'amulet_of_power', name: 'Amulet of Power', description: 'Increases raw damage and XP.', bonus: { damage: 5, xpBonus: 10 }, type: 'accessory', sellPrice: 500 },
  combat_bracelet: { id: 'combat_bracelet', name: 'Combat Bracelet', description: 'A sturdy bracelet.', bonus: { damage: 8 }, type: 'accessory', sellPrice: 800 },
  
  // Shields
  anti_dragon_shield: { id: 'anti_dragon_shield', name: 'Anti-dragon Shield', description: 'Protects from fire breath.', bonus: { range: 20, xpBonus: 15 }, type: 'shield', sellPrice: 1200 },
  
  // Materials
  logs: { id: 'logs', name: 'Logs', description: 'Basic wood.', bonus: {}, type: 'material', sellPrice: 5 },
  oak_logs: { id: 'oak_logs', name: 'Oak Logs', description: 'Sturdier wood.', bonus: {}, type: 'material', sellPrice: 15 },
  willow_logs: { id: 'willow_logs', name: 'Willow Logs', description: 'Used for bowmaking.', bonus: {}, type: 'material', sellPrice: 30 },
  yew_logs: { id: 'yew_logs', name: 'Yew Logs', description: 'Used for better bowmaking.', bonus: {}, type: 'material', sellPrice: 50 },
  magic_logs: { id: 'magic_logs', name: 'Magic Logs', description: 'Used for magic bowmaking.', bonus: {}, type: 'material', sellPrice: 100 },
  
  // Ores
  tin_ore: { id: 'tin_ore', name: 'Tin Ore', description: 'Used in smithing.', bonus: {}, type: 'material', sellPrice: 10 },
  copper_ore: { id: 'copper_ore', name: 'Copper Ore', description: 'Used in smithing.', bonus: {}, type: 'material', sellPrice: 10 },
  iron_ore: { id: 'iron_ore', name: 'Iron Ore', description: 'Used in smithing.', bonus: {}, type: 'material', sellPrice: 20 },
  coal: { id: 'coal', name: 'Coal', description: 'Fuel for smelting.', bonus: {}, type: 'material', sellPrice: 50 },
  mithril_ore: { id: 'mithril_ore', name: 'Mithril Ore', description: 'Used in smithing.', bonus: {}, type: 'material', sellPrice: 50 },
  adamantite_ore: { id: 'adamantite_ore', name: 'Adamantite Ore', description: 'Used in smithing.', bonus: {}, type: 'material', sellPrice: 100 },
  rune_ore: { id: 'rune_ore', name: 'Rune Ore', description: 'Used in smithing.', bonus: {}, type: 'material', sellPrice: 250 },
  
  // Herbs
  grimy_guam: { id: 'grimy_guam', name: 'Grimy Guam', description: 'Needs cleaning.', bonus: {}, type: 'herb', sellPrice: 10 },
  clean_guam: { id: 'clean_guam', name: 'Clean Guam', description: 'Ready for potions.', bonus: {}, type: 'herb', sellPrice: 15 },
  grimy_ranarr: { id: 'grimy_ranarr', name: 'Grimy Ranarr', description: 'Valuable herb.', bonus: {}, type: 'herb', sellPrice: 50 },
  clean_ranarr: { id: 'clean_ranarr', name: 'Clean Ranarr', description: 'Used in prayer potions.', bonus: {}, type: 'herb', sellPrice: 70 },
  
  // Bones
  bones: { id: 'bones', name: 'Bones', description: 'Basic prayer fodder.', bonus: {}, type: 'material', sellPrice: 5 },
  big_bones: { id: 'big_bones', name: 'Big Bones', description: 'Better prayer XP.', bonus: {}, type: 'material', sellPrice: 20 },
  dragon_bones: { id: 'dragon_bones', name: 'Dragon Bones', description: 'High-tier prayer XP.', bonus: {}, type: 'material', sellPrice: 100 },
};

export const ITEM_PROGRESSIONS: Record<string, string> = {
  'Bronze Scimitar': 'Iron Scimitar',
  'Iron Scimitar': 'Steel Scimitar',
  'Steel Scimitar': 'Mithril Scimitar',
  'Mithril Scimitar': 'Adamant Scimitar',
  'Adamant Scimitar': 'Rune Scimitar',
  'Rune Scimitar': 'Dragon Scimitar'
};

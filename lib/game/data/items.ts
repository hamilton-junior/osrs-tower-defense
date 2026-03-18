
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
  clean_harralander: { id: 'clean_harralander', name: 'Clean Harralander', description: 'Used for energy potions.', bonus: {}, type: 'herb', sellPrice: 30 },
  clean_toadflax: { id: 'clean_toadflax', name: 'Clean Toadflax', description: 'Used for saradomin brews.', bonus: {}, type: 'herb', sellPrice: 60 },
  grimy_ranarr: { id: 'grimy_ranarr', name: 'Grimy Ranarr', description: 'Valuable herb.', bonus: {}, type: 'herb', sellPrice: 50 },
  clean_ranarr: { id: 'clean_ranarr', name: 'Clean Ranarr', description: 'Used in prayer potions.', bonus: {}, type: 'herb', sellPrice: 70 },
  clean_snapdragon: { id: 'clean_snapdragon', name: 'Clean Snapdragon', description: 'Used for super restores.', bonus: {}, type: 'herb', sellPrice: 120 },
  clean_torstol: { id: 'clean_torstol', name: 'Clean Torstol', description: 'Used for super combat potions.', bonus: {}, type: 'herb', sellPrice: 200 },
  
  // Bones
  bones: { id: 'bones', name: 'Bones', description: 'Basic prayer fodder.', bonus: {}, type: 'material', sellPrice: 5 },
  big_bones: { id: 'big_bones', name: 'Big Bones', description: 'Better prayer XP.', bonus: {}, type: 'material', sellPrice: 20 },
  dragon_bones: { id: 'dragon_bones', name: 'Dragon Bones', description: 'High-tier prayer XP.', bonus: {}, type: 'material', sellPrice: 100 },

  // Farming Supplies
  compost: { id: 'compost', name: 'Compost', description: 'Reduces disease chance and increases yield.', bonus: {}, type: 'material', sellPrice: 20 },
  supercompost: { id: 'supercompost', name: 'Supercompost', description: 'Greatly reduces disease chance and increases yield.', bonus: {}, type: 'material', sellPrice: 100 },
  ultracompost: { id: 'ultracompost', name: 'Ultracompost', description: 'Almost eliminates disease chance and maximizes yield.', bonus: {}, type: 'material', sellPrice: 500 },
  plant_cure: { id: 'plant_cure', name: 'Plant Cure', description: 'Cures diseased patches.', bonus: {}, type: 'material', sellPrice: 50 },

  // Seeds
  guam_seed: { id: 'guam_seed', name: 'Guam Seed', description: 'Can be planted in a herb patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 30, harvestItem: 'clean_guam', sellPrice: 20 },
  harralander_seed: { id: 'harralander_seed', name: 'Harralander Seed', description: 'Can be planted in a herb patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 40, harvestItem: 'clean_harralander', sellPrice: 40 },
  toadflax_seed: { id: 'toadflax_seed', name: 'Toadflax Seed', description: 'Can be planted in a herb patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 50, harvestItem: 'clean_toadflax', sellPrice: 80 },
  ranarr_seed: { id: 'ranarr_seed', name: 'Ranarr Seed', description: 'Can be planted in a herb patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 60, harvestItem: 'clean_ranarr', sellPrice: 100 },
  snapdragon_seed: { id: 'snapdragon_seed', name: 'Snapdragon Seed', description: 'Can be planted in a herb patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 70, harvestItem: 'clean_snapdragon', sellPrice: 150 },
  torstol_seed: { id: 'torstol_seed', name: 'Torstol Seed', description: 'Can be planted in a herb patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 80, harvestItem: 'clean_torstol', sellPrice: 250 },
  potato_seed: { id: 'potato_seed', name: 'Potato Seed', description: 'Can be planted in an allotment patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 20, harvestItem: 'potato', sellPrice: 5 },
  onion_seed: { id: 'onion_seed', name: 'Onion Seed', description: 'Can be planted in an allotment patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 25, harvestItem: 'onion', sellPrice: 8 },
  cabbage_seed: { id: 'cabbage_seed', name: 'Cabbage Seed', description: 'Can be planted in an allotment patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 30, harvestItem: 'cabbage', sellPrice: 12 },
  sweetcorn_seed: { id: 'sweetcorn_seed', name: 'Sweetcorn Seed', description: 'Can be planted in an allotment patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 40, harvestItem: 'sweetcorn', sellPrice: 20 },
  watermelon_seed: { id: 'watermelon_seed', name: 'Watermelon Seed', description: 'Can be planted in an allotment patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 50, harvestItem: 'watermelon', sellPrice: 40 },
  snape_grass_seed: { id: 'snape_grass_seed', name: 'Snape Grass Seed', description: 'Can be planted in an allotment patch.', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 60, harvestItem: 'snape_grass', sellPrice: 80 },

  // Herblore Supplies
  vial_of_water: { id: 'vial_of_water', name: 'Vial of water', description: 'Used to make potions.', bonus: {}, type: 'material', sellPrice: 5 },
  eye_of_newt: { id: 'eye_of_newt', name: 'Eye of newt', description: 'Used to make attack potions.', bonus: {}, type: 'material', sellPrice: 10 },
  limpwurt_root: { id: 'limpwurt_root', name: 'Limpwurt root', description: 'Used to make strength potions.', bonus: {}, type: 'material', sellPrice: 50 },
  birds_nest: { id: 'birds_nest', name: 'Bird nest', description: 'Used to make saradomin brews.', bonus: {}, type: 'material', sellPrice: 200 },
  red_spiders_eggs: { id: 'red_spiders_eggs', name: "Red spider's eggs", description: 'Used to make restore potions.', bonus: {}, type: 'material', sellPrice: 30 },
  white_berries: { id: 'white_berries', name: 'White berries', description: 'Used to make super defence potions.', bonus: {}, type: 'material', sellPrice: 80 },

  // Potions
  attack_potion: { id: 'attack_potion', name: 'Attack potion(3)', description: 'Boosts attack.', bonus: {}, type: 'potion', sellPrice: 50 },
  strength_potion: { id: 'strength_potion', name: 'Strength potion(3)', description: 'Boosts strength.', bonus: {}, type: 'potion', sellPrice: 100 },
  prayer_potion: { id: 'prayer_potion', name: 'Prayer potion(3)', description: 'Restores prayer points.', bonus: {}, type: 'potion', sellPrice: 200 },
  super_restore: { id: 'super_restore', name: 'Super restore(3)', description: 'Restores all stats and prayer.', bonus: {}, type: 'potion', sellPrice: 500 },
  saradomin_brew: { id: 'saradomin_brew', name: 'Saradomin brew(3)', description: 'Heals and boosts defence, lowers other stats.', bonus: {}, type: 'potion', sellPrice: 1000 },
  super_combat_potion: { id: 'super_combat_potion', name: 'Super combat potion(3)', description: 'Boosts attack, strength, and defence.', bonus: {}, type: 'potion', sellPrice: 2000 },

  // Crops
  potato: { id: 'potato', name: 'Potato', description: 'A basic vegetable.', bonus: {}, type: 'material', sellPrice: 10 },
  onion: { id: 'onion', name: 'Onion', description: 'Makes you cry.', bonus: {}, type: 'material', sellPrice: 15 },
  cabbage: { id: 'cabbage', name: 'Cabbage', description: 'Yuck.', bonus: {}, type: 'material', sellPrice: 20 },
  sweetcorn: { id: 'sweetcorn', name: 'Sweetcorn', description: 'Sweet and crunchy.', bonus: {}, type: 'material', sellPrice: 35 },
  watermelon: { id: 'watermelon', name: 'Watermelon', description: 'A large, juicy fruit.', bonus: {}, type: 'material', sellPrice: 60 },
  snape_grass: { id: 'snape_grass', name: 'Snape Grass', description: 'Used in prayer potions.', bonus: {}, type: 'material', sellPrice: 100 },
  // Runes
  air_rune: { id: 'air_rune', name: 'Air rune', description: 'Used for magic spells.', bonus: {}, type: 'material', sellPrice: 5 },
  water_rune: { id: 'water_rune', name: 'Water rune', description: 'Used for magic spells.', bonus: {}, type: 'material', sellPrice: 5 },
  earth_rune: { id: 'earth_rune', name: 'Earth rune', description: 'Used for magic spells.', bonus: {}, type: 'material', sellPrice: 5 },
  fire_rune: { id: 'fire_rune', name: 'Fire rune', description: 'Used for magic spells.', bonus: {}, type: 'material', sellPrice: 5 },
  nature_rune: { id: 'nature_rune', name: 'Nature rune', description: 'Used for alchemy spells.', bonus: {}, type: 'material', sellPrice: 200 },
  law_rune: { id: 'law_rune', name: 'Law rune', description: 'Used for teleport spells.', bonus: {}, type: 'material', sellPrice: 200 },
  blood_rune: { id: 'blood_rune', name: 'Blood rune', description: 'Used for ancient magicks.', bonus: {}, type: 'material', sellPrice: 400 },
  death_rune: { id: 'death_rune', name: 'Death rune', description: 'Used for combat spells.', bonus: {}, type: 'material', sellPrice: 300 },
  soul_rune: { id: 'soul_rune', name: 'Soul rune', description: 'Used for advanced magic.', bonus: {}, type: 'material', sellPrice: 300 },

  // Construction Supplies
  plank: { id: 'plank', name: 'Plank', description: 'Used for construction.', bonus: {}, type: 'material', sellPrice: 100 },
  oak_plank: { id: 'oak_plank', name: 'Oak plank', description: 'Used for construction.', bonus: {}, type: 'material', sellPrice: 250 },
  teak_plank: { id: 'teak_plank', name: 'Teak plank', description: 'Used for construction.', bonus: {}, type: 'material', sellPrice: 500 },
  mahogany_plank: { id: 'mahogany_plank', name: 'Mahogany plank', description: 'Used for construction.', bonus: {}, type: 'material', sellPrice: 1500 },
  steel_nails: { id: 'steel_nails', name: 'Steel nails', description: 'Used for construction.', bonus: {}, type: 'material', sellPrice: 10 },
};

export const ITEM_PROGRESSIONS: Record<string, string> = {
  'Bronze Scimitar': 'Iron Scimitar',
  'Iron Scimitar': 'Steel Scimitar',
  'Steel Scimitar': 'Mithril Scimitar',
  'Mithril Scimitar': 'Adamant Scimitar',
  'Adamant Scimitar': 'Rune Scimitar',
  'Rune Scimitar': 'Dragon Scimitar'
};

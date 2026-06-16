import type { Item, EnemyType } from '../types';

/**
 * A monster loot drop. Stored on a loot's `data` and later treated loosely as
 * an {@link Item} when picked up. Drops intentionally omit some Item fields
 * (e.g. `description`) to match the original inline tables exactly.
 */
export type LootDrop = Partial<Item> & Pick<Item, 'id' | 'name' | 'type' | 'bonus'>;

/**
 * Weapon drops, ordered weakest → strongest. The drop roll is capped by wave
 * (`maxTier = min(len-1, floor(wave/3))`), so deeper waves unlock better gear.
 */
export const WEAPON_DROP_TIERS: LootDrop[] = [
  { id: 'bronze_scimitar', name: 'Bronze Scimitar', bonus: { damage: 5 }, type: 'weapon' },
  { id: 'iron_scimitar', name: 'Iron Scimitar', bonus: { damage: 10 }, type: 'weapon' },
  { id: 'steel_scimitar', name: 'Steel Scimitar', bonus: { damage: 15 }, type: 'weapon' },
  { id: 'mithril_scimitar', name: 'Mithril Scimitar', bonus: { damage: 25 }, type: 'weapon' },
  { id: 'adamant_scimitar', name: 'Adamant Scimitar', bonus: { damage: 40 }, type: 'weapon' },
  { id: 'rune_scimitar', name: 'Rune Scimitar', bonus: { damage: 60 }, type: 'weapon' },
  { id: 'dragon_scimitar', name: 'Dragon Scimitar', bonus: { damage: 90 }, type: 'weapon' },
  { id: 'abyssal_whip', name: 'Abyssal Whip', bonus: { damage: 150 }, type: 'weapon' },
  { id: 'scythe_of_vitur', name: 'Scythe of Vitur', bonus: { damage: 250 }, type: 'weapon' },
];

export const RUNE_DROPS: LootDrop[] = [
  { id: 'air_rune', name: 'Air rune', bonus: {}, type: 'material', sellPrice: 5 },
  { id: 'water_rune', name: 'Water rune', bonus: {}, type: 'material', sellPrice: 5 },
  { id: 'earth_rune', name: 'Earth rune', bonus: {}, type: 'material', sellPrice: 5 },
  { id: 'fire_rune', name: 'Fire rune', bonus: {}, type: 'material', sellPrice: 5 },
  { id: 'nature_rune', name: 'Nature rune', bonus: {}, type: 'material', sellPrice: 200 },
  { id: 'law_rune', name: 'Law rune', bonus: {}, type: 'material', sellPrice: 200 },
  { id: 'blood_rune', name: 'Blood rune', bonus: {}, type: 'material', sellPrice: 400 },
  { id: 'death_rune', name: 'Death rune', bonus: {}, type: 'material', sellPrice: 300 },
  { id: 'soul_rune', name: 'Soul rune', bonus: {}, type: 'material', sellPrice: 300 },
];

export const SEED_DROPS: LootDrop[] = [
  { id: 'potato_seed', name: 'Potato Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 20, harvestItem: 'potato', sellPrice: 5 },
  { id: 'onion_seed', name: 'Onion Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 25, harvestItem: 'onion', sellPrice: 8 },
  { id: 'cabbage_seed', name: 'Cabbage Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 30, harvestItem: 'cabbage', sellPrice: 12 },
  { id: 'sweetcorn_seed', name: 'Sweetcorn Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 40, harvestItem: 'sweetcorn', sellPrice: 20 },
  { id: 'watermelon_seed', name: 'Watermelon Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 50, harvestItem: 'watermelon', sellPrice: 40 },
  { id: 'snape_grass_seed', name: 'Snape Grass Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'allotment', growthTime: 60, harvestItem: 'snape_grass', sellPrice: 80 },
  { id: 'guam_seed', name: 'Guam Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 30, harvestItem: 'clean_guam', sellPrice: 20 },
  { id: 'harralander_seed', name: 'Harralander Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 40, harvestItem: 'clean_harralander', sellPrice: 40 },
  { id: 'toadflax_seed', name: 'Toadflax Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 50, harvestItem: 'clean_toadflax', sellPrice: 80 },
  { id: 'ranarr_seed', name: 'Ranarr Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 60, harvestItem: 'clean_ranarr', sellPrice: 100 },
  { id: 'snapdragon_seed', name: 'Snapdragon Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 70, harvestItem: 'clean_snapdragon', sellPrice: 150 },
  { id: 'torstol_seed', name: 'Torstol Seed', bonus: { xpBonus: 0 }, type: 'seed', seedType: 'herb', growthTime: 80, harvestItem: 'clean_torstol', sellPrice: 250 },
];

export const FARMING_SUPPLY_DROPS: LootDrop[] = [
  { id: 'compost', name: 'Compost', bonus: {}, type: 'material', sellPrice: 20 },
  { id: 'supercompost', name: 'Supercompost', bonus: {}, type: 'material', sellPrice: 100 },
  { id: 'ultracompost', name: 'Ultracompost', bonus: {}, type: 'material', sellPrice: 500 },
  { id: 'plant_cure', name: 'Plant Cure', bonus: {}, type: 'material', sellPrice: 50 },
];

export const CONSTRUCTION_SUPPLY_DROPS: LootDrop[] = [
  { id: 'plank', name: 'Plank', bonus: {}, type: 'material', sellPrice: 100 },
  { id: 'oak_plank', name: 'Oak plank', bonus: {}, type: 'material', sellPrice: 250 },
  { id: 'teak_plank', name: 'Teak plank', bonus: {}, type: 'material', sellPrice: 500 },
  { id: 'mahogany_plank', name: 'Mahogany plank', bonus: {}, type: 'material', sellPrice: 1500 },
  { id: 'steel_nails', name: 'Steel nails', bonus: {}, type: 'material', sellPrice: 10 },
];

export interface PetDrop {
  name: string;
  type: string;
  bonus: string;
}

/** Boss/monster-specific pet drops, keyed by the enemy type that drops them. */
export const PET_DROP_TABLE: Partial<Record<EnemyType, PetDrop>> = {
  vorkath: { name: 'Vorki', type: 'vorki', bonus: 'Dragon Slayer: +15% DMG vs Dragons' },
  zulrah: { name: 'Snakeling', type: 'snakeling', bonus: 'Serpent Scale: +10% GP drops' },
  jad: { name: 'TzRek-Jad', type: 'rift_guardian', bonus: "Jad's Might: +20% fire damage" },
  green_dragon: { name: 'Prince Black Dragon', type: 'prince_black_dragon', bonus: 'Dragon Blood: +8% DMG vs Dragons' },
  blue_dragon: { name: 'Prince Black Dragon', type: 'prince_black_dragon', bonus: 'Dragon Blood: +8% DMG vs Dragons' },
  hydra: { name: 'Ikkle Hydra', type: 'heron', bonus: "Hydra's Eye: +10% range" },
};

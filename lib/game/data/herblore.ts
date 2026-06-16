/**
 * Herblore brewing recipes used by `GameEngine.makePotion`. A potion is made
 * from a cleaned `herb` + a `secondary` ingredient (plus a vial of water), and
 * produces the item with id `id` once the player meets the Herblore `level`.
 */
export interface HerbloreRecipe {
  id: string;
  name: string;
  herb: string;
  secondary: string;
  level: number;
  xp: number;
}

export const HERBLORE_RECIPES: HerbloreRecipe[] = [
  { id: 'attack_potion', name: 'Attack potion(3)', herb: 'clean_guam', secondary: 'eye_of_newt', level: 1, xp: 25 },
  { id: 'strength_potion', name: 'Strength potion(3)', herb: 'clean_torstol', secondary: 'limpwurt_root', level: 12, xp: 50 },
  { id: 'prayer_potion', name: 'Prayer potion(3)', herb: 'clean_ranarr', secondary: 'snape_grass', level: 38, xp: 87.5 },
  { id: 'super_restore', name: 'Super restore(3)', herb: 'clean_snapdragon', secondary: 'red_spiders_eggs', level: 63, xp: 142.5 },
  { id: 'saradomin_brew', name: 'Saradomin brew(3)', herb: 'clean_toadflax', secondary: 'birds_nest', level: 81, xp: 180 },
  { id: 'super_combat_potion', name: 'Super combat potion(3)', herb: 'clean_torstol', secondary: 'clean_torstol', level: 90, xp: 150 },
];

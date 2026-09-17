import { itemIcon } from '../assets';
import { FISH, type EssenceYield, type FishId } from './fishing';

/**
 * Everything the inventory can eat: the fish Fishing pulls out of the water, and the
 * kebab the Drunken Dwarf presses into your hands.
 *
 * Kept apart from the fish table because the fish table is also the catch roll, and
 * a kebab must never come up on a line. Eating, selling, the hover card and the save
 * filter all read this one instead.
 */
export type FoodId = FishId | 'kebab';

export interface FoodDef {
  id: FoodId;
  name: string;
  /** Lives restored when it is eaten, never past `maxLives`. Zero on a catch that
   *  is cracked instead of eaten. */
  lives: number;
  /** What it sells for, and what eating it at full lives pays instead. */
  gold: number;
  /** Set on the one catch that is cracked open rather than eaten, and what the
   *  crack pays. The inventory offers Crack in place of Eat and Sell. */
  essence?: EssenceYield;
  icon: string;
}

/** Is this cracked open rather than eaten? One line, so the inventory, the engine
 *  and the hover card all ask the same question. */
export const isCracked = (def: FoodDef): boolean => def.essence !== undefined;

/** Heals like a trout, because a dwarf's kebab is a meal and not a snack. */
export const KEBAB: FoodDef = { id: 'kebab', name: 'Kebab', lives: 2, gold: 20, icon: itemIcon('kebab') };

export const FOOD: readonly FoodDef[] = [...FISH, KEBAB];

export const FOOD_BY_ID: Record<FoodId, FoodDef> =
  Object.fromEntries(FOOD.map(f => [f.id, f])) as Record<FoodId, FoodDef>;

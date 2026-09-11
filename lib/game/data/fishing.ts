import { itemIcon, npcModel } from '../assets';

/**
 * **Fishing** — the run's fourth skill, and the only one that hands back a life.
 *
 * A cast is three seconds on a bar between waves. It always pays XP; it usually,
 * not always, lands a fish. The fish is eaten out of the inventory for lives, up
 * to `maxLives` — a supply the run tops up itself rather than a way to outgrow
 * the health bar.
 *
 * The ladder is the real OSRS one. Every fish here exists in the game, at the
 * Fishing level the game gates it behind:
 *
 * | Fish       | Fishing | Lives | What it is in OSRS          |
 * |------------|---------|-------|------------------------------|
 * | Shrimps    | 1       | +1    | The first thing anyone nets |
 * | Trout      | 20      | +1    | Fly fishing, Lumbridge      |
 * | Lobster    | 40      | +2    | Karamja cage                |
 * | Shark      | 76      | +3    | Harpoon, the classic top    |
 * | Manta ray  | 81      | +5    | Fishing Trawler             |
 *
 * (Anglerfish sits at 82 and heals more than a manta ray in OSRS, but it is a
 * one-rung-higher version of the same reward, so the ladder stops at five rungs
 * rather than paying twice for the same climb.)
 *
 * The weights halve up the ladder, so the fish you are most likely to pull is the
 * one you unlocked first — levelling widens the table rather than replacing it.
 */

export type FishId = 'shrimps' | 'trout' | 'lobster' | 'shark' | 'manta_ray';

export interface FishDef {
  id: FishId;
  name: string;
  /** The real OSRS Fishing level the catch is gated behind. */
  level: number;
  /** Lives restored when it is eaten, never past `maxLives`. */
  lives: number;
  /** What it sells for when eaten at full health — a fish is never wasted. */
  gold: number;
  /** Relative roll weight among the fish unlocked at the current level. */
  weight: number;
  icon: string;
}

export const FISH: readonly FishDef[] = [
  { id: 'shrimps', name: 'Shrimps', level: 1, lives: 1, gold: 8, weight: 100, icon: itemIcon('shrimps') },
  { id: 'trout', name: 'Trout', level: 20, lives: 1, gold: 18, weight: 60, icon: itemIcon('trout') },
  { id: 'lobster', name: 'Lobster', level: 40, lives: 2, gold: 45, weight: 40, icon: itemIcon('lobster') },
  { id: 'shark', name: 'Shark', level: 76, lives: 3, gold: 120, weight: 20, icon: itemIcon('shark') },
  { id: 'manta_ray', name: 'Manta ray', level: 81, lives: 5, gold: 220, weight: 10, icon: itemIcon('manta_ray') },
];

export const FISH_BY_ID: Record<FishId, FishDef> =
  Object.fromEntries(FISH.map(f => [f.id, f])) as Record<FishId, FishDef>;

/** How long one cast takes, in wall-clock seconds. */
export const CAST_SECONDS = 3;
/** XP for the cast itself — paid whether or not a fish comes up. */
export const CAST_XP = 175;
/** The share of casts that land a fish at level 1… */
export const CATCH_CHANCE_BASE = 0.55;
/** …and how much each level adds to it. */
export const CATCH_CHANCE_PER_LEVEL = 0.003;
/** The ceiling, so a maxed run still sometimes comes up empty. */
export const CATCH_CHANCE_MAX = 0.85;
/** Casts a spot has in it before the fish move on. */
export const SPOT_CASTS = 3;
/** Waves a spent spot rests before the fish come back. This is the strongest
 *  lever in the file: it sets how many casts a whole run is worth. */
export const SPOT_REST_WAVES = 4;
/** Fishing is a per-run skill, but the ladder it climbs is OSRS's. */
export const FISHING_MAX_LEVEL = 99;

/** The bubbling fishing spot itself — NPC 1525, rendered out of the cache. */
export const FISHING_SPOT_ICON = npcModel('fishing_spot');

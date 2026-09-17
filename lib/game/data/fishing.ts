import { itemIcon, npcModel } from '../assets';
import type { BiomeId } from './biomes';
import type { LiquidKind } from '../systems/terrain-generation';

/**
 * **Fishing** — the run's fourth skill, and the only one that hands back a life.
 *
 * A cast is a bar between waves — three seconds of it at Fishing 1, half that at
 * 99. It always pays XP; it usually, not always, lands a fish. The fish is eaten out of the inventory for lives, up
 * to `maxLives` — a supply the run tops up itself rather than a way to outgrow
 * the health bar.
 *
 * The ladder is the real OSRS one. Every fish here exists in the game, at the
 * Fishing level the game gates it behind:
 *
 * | Fish       | Fishing | Lives | What it is in OSRS          |
 * |------------|---------|-------|------------------------------|
 * | Shrimps    | 1       | +1    | The first thing anyone nets |
 * | Trout      | 20      | +2    | Fly fishing, Lumbridge      |
 * | Lobster    | 40      | +3    | Karamja cage                |
 * | Shark      | 76      | +4    | Harpoon, the classic top    |
 * | Manta ray  | 81      | +5    | Fishing Trawler             |
 *
 * (Anglerfish sits at 82 and heals more than a manta ray in OSRS, but it is a
 * one-rung-higher version of the same reward, so the ladder stops at five rungs
 * rather than paying twice for the same climb.)
 *
 * Every rung heals one life more than the rung below it, so each Fishing unlock is
 * worth the same step up.
 *
 * The weights halve up the ladder, so the fish you are most likely to pull is the
 * one you unlocked first — levelling widens the table rather than replacing it.
 *
 * **Lava is its own water.** A pool the map rolled as lava deals a second, shorter
 * ladder, and the two never mix — the ladder above is what a water pool holds and
 * nothing in it comes out of lava:
 *
 * | Fish          | Fishing | Where          | What it pays              |
 * |---------------|---------|----------------|---------------------------|
 * | Lava eel      | 53      | any lava pool  | +3 lives                  |
 * | Infernal eel  | 80      | TzHaar only    | 14-20 essence, cracked    |
 *
 * Both are OSRS's: the lava eel is the Wilderness lava-maze catch, and the infernal
 * eel is Mor Ul Rek's, which is not food there either — it is cracked open for what
 * is inside it.
 */

export type FishId =
  | 'shrimps' | 'trout' | 'lobster' | 'shark' | 'manta_ray'
  | 'lava_eel' | 'infernal_eel';

/** What a cracked catch pays, as the range the crack rolls inside. */
export interface EssenceYield {
  min: number;
  max: number;
}

export interface FishDef {
  id: FishId;
  name: string;
  /** The real OSRS Fishing level the catch is gated behind. */
  level: number;
  /** Lives restored when it is eaten, never past `maxLives`. Zero for a catch that
   *  is not food — the infernal eel is cracked, not eaten. */
  lives: number;
  /** What it sells for when eaten at full health — a fish is never wasted. */
  gold: number;
  /** Relative roll weight among the fish unlocked at the current level. */
  weight: number;
  /** Which surface it comes out of. A pool deals only its own liquid's fish. */
  liquid: LiquidKind;
  /** Set on a catch only one region holds. The infernal eel is Mor Ul Rek's, so it
   *  is TzHaar's here and nowhere else. */
  biome?: BiomeId;
  /** Set on a catch that is cracked open rather than eaten, and what that pays. */
  essence?: EssenceYield;
  icon: string;
}

export const FISH: readonly FishDef[] = [
  { id: 'shrimps', name: 'Shrimps', level: 1, lives: 1, gold: 8, weight: 100, liquid: 'water', icon: itemIcon('shrimps') },
  { id: 'trout', name: 'Trout', level: 20, lives: 2, gold: 18, weight: 60, liquid: 'water', icon: itemIcon('trout') },
  { id: 'lobster', name: 'Lobster', level: 40, lives: 3, gold: 45, weight: 40, liquid: 'water', icon: itemIcon('lobster') },
  { id: 'shark', name: 'Shark', level: 76, lives: 4, gold: 120, weight: 20, liquid: 'water', icon: itemIcon('shark') },
  { id: 'manta_ray', name: 'Manta ray', level: 81, lives: 5, gold: 220, weight: 10, liquid: 'water', icon: itemIcon('manta_ray') },
  // Lava's own two. The eel heals like a lobster because it sits between the lobster
  // and the shark on OSRS's own ladder, and it is the only thing most lava pools ever
  // deal — a lava map fishes for lives more slowly than a water one, not for less.
  { id: 'lava_eel', name: 'Lava eel', level: 53, lives: 3, gold: 60, weight: 100, liquid: 'lava', icon: itemIcon('lava_eel') },
  // The bonus at the top of the TzHaar map: rare, late, and paid in essence rather
  // than lives or coins, so a run that lands one carries it out of the run.
  {
    id: 'infernal_eel', name: 'Infernal eel', level: 80, lives: 0, gold: 0, weight: 12,
    liquid: 'lava', biome: 'tzhaar', essence: { min: 14, max: 20 }, icon: itemIcon('infernal_eel'),
  },
];

export const FISH_BY_ID: Record<FishId, FishDef> =
  Object.fromEntries(FISH.map(f => [f.id, f])) as Record<FishId, FishDef>;

/** How long one cast takes at Fishing 1, in wall-clock seconds. */
export const CAST_SECONDS = 3;
/** …and at 99. Half the bar, so a maxed fisher lands two casts in the time a
 *  beginner lands one. The climb between the two is straight — see `castSeconds`
 *  in systems/fishing. */
export const CAST_SECONDS_AT_MAX = 1.5;
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

/**
 * The spot itself, in the two sprites OSRS already has for it. Both are baked as
 * eight frames of the spot's own stand animation (seq 7634) rather than a still,
 * because a fishing spot in OSRS is water breaking, and a frozen ripple reads as a
 * decal painted on the sea.
 *
 * A pool with fish left in it is the Tempoross Cove spot (NPC 10565), the brighter,
 * busier water the game uses where the fishing is on. A spent one is the ordinary
 * spot (NPC 1525). The mesh is the same one twice, down to the colours — what the
 * cache changes is the alpha it carries the bubbles at, 150 of 255 for the Tempoross
 * spot against 200 for the plain one. Over water that gap is the whole difference:
 * the plain spot lets the blue read straight through its rings, so it comes out as
 * the dark ripples an ordinary fishing spot leaves on the surface, while the
 * Tempoross one is the white foam of a pool worth casting at.
 */
export const FISHING_SPOT_ICON = npcModel('fishing_spot');
export const FISHING_SPOT_ACTIVE_ICON = npcModel('fishing_spot_active');
/**
 * Lava's spot, off the same eight frames of seq 7634. The cache draws it with its
 * own model (2331, the bubbling lava spot NPC 4928 stands on) rather than tinting
 * the water one, so what breaks the surface over lava is lava. One sheet, not two:
 * the cache holds a single lava spot, so a spent pool is that sprite drawn quieter
 * rather than a second bake that would come out pixel-identical.
 */
export const FISHING_SPOT_LAVA_ICON = npcModel('fishing_spot_lava');

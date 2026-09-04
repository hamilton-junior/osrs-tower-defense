import { ASSETS, itemIcon } from '../assets';

/**
 * **Farming patches** — the allotments the terrain deals with the road.
 *
 * They are the game's one slow mechanic. Everything else on the board pays out in
 * the wave you buy it in; a seed pays out several waves later, and only if you
 * remember to come back for it. There is nothing to click during a fight and
 * nothing to aim — you sow between waves, the patch grows on its own, and the herb
 * is a buff that rides one whole wave.
 *
 * The ladder is the real OSRS herb ladder, in the real order the game gates it:
 *
 * | Herb        | Farming | What it is in OSRS |
 * |-------------|---------|--------------------|
 * | Guam        | 9       | Guam leaf          |
 * | Marrentill  | 14      | Marrentill         |
 * | Ranarr      | 32      | Ranarr weed        |
 * | Snapdragon  | 62      | Snapdragon         |
 * | Torstol     | 85      | Torstol            |
 *
 * Two deliberate departures from OSRS. Seeds are priced in coppers (10–30 gp)
 * because gold is not what a seed costs you — the patch is, for as long as it is
 * busy. And where OSRS ripens every herb in the same 80 minutes, these ripen at
 * different rates, so the ladder is a real choice: a Guam is back in three waves,
 * a Torstol keeps the patch for six.
 */

export type SeedId = 'guam' | 'marrentill' | 'ranarr' | 'snapdragon' | 'torstol';

/**
 * What a harvested herb does for the wave it is spent on.
 *
 * - `damage` / `range` are board-wide tower multipliers, folded in beside a wave
 *   event's (see `GameEngine.eventTowerMods`).
 * - `prayer` slows the drain, so a prayer stays up longer on the same points.
 * - `life` hands a life back when the wave is cleared — the only one that pays
 *   out *after* the fight rather than during it.
 * - `gold` pays more for everything the wave earns.
 */
export type HerbEffect = 'damage' | 'prayer' | 'life' | 'range' | 'gold';

export interface SeedDef {
  id: SeedId;
  /** What goes in the ground. */
  seedName: string;
  /** What comes out of it. */
  herbName: string;
  /** The real OSRS Farming level the seed is gated behind. Shown, not enforced —
   *  there is no Farming skill here, it is the ladder's own ordering. */
  level: number;
  /** Coppers to sow. Deliberately tiny: the patch is the price, not the gold. */
  cost: number;
  /** Waves from sowing to ready. */
  waves: number;
  effect: HerbEffect;
  /** The size of the effect: a fraction for `damage`/`range`/`prayer`/`gold`,
   *  a count of lives for `life`. */
  amount: number;
  /** Local bakes — every asset in this game comes out of the OSRS cache. */
  seedIcon: string;
  herbIcon: string;
  /** One short plain sentence: what the herb does. No numbers — those are the
   *  stat rows beside it. */
  tip: string;
  /** The herb's signature, the way a trap or a tower has one: a name for the thing
   *  it is good at, and an OSRS icon for that thing. */
  signature: { label: string; icon: string };
}

export const SEEDS: SeedDef[] = [
  {
    id: 'guam',
    seedName: 'Guam seed',
    herbName: 'Guam leaf',
    level: 9,
    cost: 10,
    waves: 3,
    effect: 'damage',
    amount: 0.15,
    seedIcon: itemIcon('guam_seed'),
    herbIcon: itemIcon('guam_leaf'),
    tip: 'Every tower hits harder for one wave.',
    signature: { label: 'Sharpened', icon: ASSETS.misc.attack_icon },
  },
  {
    id: 'marrentill',
    seedName: 'Marrentill seed',
    herbName: 'Marrentill',
    level: 14,
    cost: 15,
    waves: 3,
    effect: 'prayer',
    amount: 0.2,
    seedIcon: itemIcon('marrentill_seed'),
    herbIcon: itemIcon('marrentill'),
    tip: 'Your prayers drain slower for one wave.',
    signature: { label: 'Devotion', icon: ASSETS.misc.prayer_icon },
  },
  {
    id: 'ranarr',
    seedName: 'Ranarr seed',
    herbName: 'Ranarr weed',
    level: 32,
    cost: 20,
    waves: 4,
    effect: 'life',
    amount: 1,
    seedIcon: itemIcon('ranarr_seed'),
    herbIcon: itemIcon('ranarr_weed'),
    tip: 'You get a life back when the wave is cleared.',
    signature: { label: 'Mending', icon: ASSETS.misc.orb_hitpoints },
  },
  {
    id: 'snapdragon',
    seedName: 'Snapdragon seed',
    herbName: 'Snapdragon',
    level: 62,
    cost: 25,
    waves: 5,
    effect: 'range',
    amount: 0.2,
    seedIcon: itemIcon('snapdragon_seed'),
    herbIcon: itemIcon('snapdragon'),
    tip: 'Every tower reaches further for one wave.',
    signature: { label: 'Far Sight', icon: ASSETS.misc.ranged_icon },
  },
  {
    id: 'torstol',
    seedName: 'Torstol seed',
    herbName: 'Torstol',
    level: 85,
    cost: 30,
    waves: 6,
    effect: 'gold',
    amount: 0.3,
    seedIcon: itemIcon('torstol_seed'),
    herbIcon: itemIcon('torstol'),
    tip: 'Everything pays more for one wave.',
    signature: { label: 'Rich Soil', icon: ASSETS.misc.coins_icon },
  },
];

export const SEED_BY_ID: Record<SeedId, SeedDef> = Object.fromEntries(
  SEEDS.map(s => [s.id, s]),
) as Record<SeedId, SeedDef>;

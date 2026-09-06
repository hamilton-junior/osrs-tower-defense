import { ASSETS, itemIcon } from '../assets';
import type { CombatStyle } from '../types';

/**
 * **Farming patches** — the allotments the terrain deals with the road.
 *
 * They are the game's one slow mechanic. Everything else on the board pays out in
 * the wave you buy it in; a seed pays out several waves later, and only if you
 * remember to come back for it. There is nothing to click during a fight and
 * nothing to aim — you sow between waves, the patch grows on its own, and the herb
 * is a buff that rides one whole wave.
 *
 * The ladder is the whole OSRS herb ladder, in the real order the game gates it:
 * Guam 9, Marrentill 14, Tarromin 19, Harralander 26, Ranarr 32, Toadflax 38,
 * Irit 44, Avantoe 50, Kwuarm 56, Snapdragon 62, Cadantine 67, Lantadyme 73,
 * Dwarf weed 79, Torstol 85. Fourteen herbs, no invented rungs.
 *
 * Three deliberate departures from OSRS. Seeds are priced in coppers (10–100 gp)
 * because gold is not what a seed costs you — the patch is, for as long as it is
 * busy. Where OSRS ripens every herb in the same 80 minutes, these ripen at
 * different rates, so the ladder is a real choice: a Guam is back in three waves, a
 * Torstol keeps the patch for six. And the level is shown rather than enforced, so
 * every herb is sowable from wave 1 and the ladder reads as ambition, not a gate.
 *
 * **Style-targeting.** A herb that names a `style` only buffs towers fighting that
 * way, the way a Ranging potion skips a staff in OSRS. That is what buys the high
 * rungs their size: a Dwarf weed hands the archers 45% where a Guam hands the whole
 * board 15%. A herb with no `style` reaches every boostable tower, and no herb ever
 * reaches the Dwarf Cannon (fixed damage, same as OSRS).
 */

export type SeedId =
  | 'guam' | 'marrentill' | 'tarromin' | 'harralander' | 'ranarr' | 'toadflax' | 'irit'
  | 'avantoe' | 'kwuarm' | 'snapdragon' | 'cadantine' | 'lantadyme' | 'dwarf' | 'torstol';

/**
 * What a harvested herb does for the wave it is spent on.
 *
 * - `damage` / `range` / `fireRate` are tower multipliers, folded in beside a wave
 *   event's (see `GameEngine.consumableTowerMods`). These are the three a `style`
 *   can narrow.
 * - `prayer` slows the drain, so a prayer stays up longer on the same points.
 * - `life` hands a life back when the wave is cleared — the only one that pays
 *   out *after* the fight rather than during it.
 * - `gold` pays more for everything the wave earns.
 */
export type HerbEffect = 'damage' | 'range' | 'fireRate' | 'prayer' | 'life' | 'gold';

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
  /** The combat style the buff belongs to, for `damage`/`range`/`fireRate`. Leave
   *  it out and every boostable tower takes it. */
  style?: CombatStyle;
  /** The size of the effect: a fraction for everything except `life`, which is a
   *  count of lives. */
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
    id: 'tarromin',
    seedName: 'Tarromin seed',
    herbName: 'Tarromin',
    level: 19,
    cost: 20,
    waves: 3,
    effect: 'fireRate',
    style: 'melee',
    amount: 0.2,
    seedIcon: itemIcon('tarromin_seed'),
    herbIcon: itemIcon('tarromin'),
    tip: 'Your melee towers swing faster for one wave.',
    signature: { label: 'Quickened', icon: ASSETS.misc.orb_run_on },
  },
  {
    id: 'harralander',
    seedName: 'Harralander seed',
    herbName: 'Harralander',
    level: 26,
    cost: 25,
    waves: 3,
    effect: 'fireRate',
    amount: 0.1,
    seedIcon: itemIcon('harralander_seed'),
    herbIcon: itemIcon('harralander'),
    tip: 'Every tower attacks faster for one wave.',
    signature: { label: 'Second Wind', icon: ASSETS.misc.orb_run },
  },
  {
    id: 'ranarr',
    seedName: 'Ranarr seed',
    herbName: 'Ranarr weed',
    level: 32,
    cost: 30,
    waves: 4,
    effect: 'life',
    amount: 1,
    seedIcon: itemIcon('ranarr_seed'),
    herbIcon: itemIcon('ranarr_weed'),
    tip: 'You get a life back when you clear the wave.',
    signature: { label: 'Mending', icon: ASSETS.misc.orb_hitpoints },
  },
  {
    id: 'toadflax',
    seedName: 'Toadflax seed',
    herbName: 'Toadflax',
    level: 38,
    cost: 35,
    waves: 4,
    effect: 'gold',
    amount: 0.15,
    seedIcon: itemIcon('toadflax_seed'),
    herbIcon: itemIcon('toadflax'),
    tip: 'Kills pay a little more for one wave.',
    signature: { label: 'Tithe', icon: ASSETS.misc.coins_icon },
  },
  {
    id: 'irit',
    seedName: 'Irit seed',
    herbName: 'Irit leaf',
    level: 44,
    cost: 40,
    waves: 4,
    effect: 'range',
    style: 'ranged',
    amount: 0.3,
    seedIcon: itemIcon('irit_seed'),
    herbIcon: itemIcon('irit_leaf'),
    tip: 'Your ranged towers reach further for one wave.',
    signature: { label: 'Marksman', icon: ASSETS.misc.ranged_icon },
  },
  {
    id: 'avantoe',
    seedName: 'Avantoe seed',
    herbName: 'Avantoe',
    level: 50,
    cost: 45,
    waves: 4,
    effect: 'fireRate',
    style: 'magic',
    amount: 0.25,
    seedIcon: itemIcon('avantoe_seed'),
    herbIcon: itemIcon('avantoe'),
    tip: 'Your wizards cast faster for one wave.',
    signature: { label: 'Attuned', icon: ASSETS.misc.magic_icon },
  },
  {
    id: 'kwuarm',
    seedName: 'Kwuarm seed',
    herbName: 'Kwuarm',
    level: 56,
    cost: 50,
    waves: 5,
    effect: 'damage',
    style: 'melee',
    amount: 0.4,
    seedIcon: itemIcon('kwuarm_seed'),
    herbIcon: itemIcon('kwuarm'),
    tip: 'Your melee towers hit far harder for one wave.',
    signature: { label: 'Brute Force', icon: ASSETS.misc.strength_icon },
  },
  {
    id: 'snapdragon',
    seedName: 'Snapdragon seed',
    herbName: 'Snapdragon',
    level: 62,
    cost: 55,
    waves: 5,
    effect: 'range',
    amount: 0.2,
    seedIcon: itemIcon('snapdragon_seed'),
    herbIcon: itemIcon('snapdragon'),
    tip: 'Every tower reaches further for one wave.',
    signature: { label: 'Far Sight', icon: ASSETS.misc.reticle },
  },
  {
    id: 'cadantine',
    seedName: 'Cadantine seed',
    herbName: 'Cadantine',
    level: 67,
    cost: 60,
    waves: 5,
    effect: 'damage',
    amount: 0.2,
    seedIcon: itemIcon('cadantine_seed'),
    herbIcon: itemIcon('cadantine'),
    tip: 'Every tower hits harder for one wave.',
    signature: { label: 'Fortified', icon: ASSETS.misc.defence_icon },
  },
  {
    id: 'lantadyme',
    seedName: 'Lantadyme seed',
    herbName: 'Lantadyme',
    level: 73,
    cost: 70,
    waves: 6,
    effect: 'damage',
    style: 'magic',
    amount: 0.45,
    seedIcon: itemIcon('lantadyme_seed'),
    herbIcon: itemIcon('lantadyme'),
    tip: 'Your wizards hit far harder for one wave.',
    signature: { label: 'Spellbind', icon: ASSETS.misc.magic_icon },
  },
  {
    id: 'dwarf',
    seedName: 'Dwarf weed seed',
    herbName: 'Dwarf weed',
    level: 79,
    cost: 80,
    waves: 6,
    effect: 'damage',
    style: 'ranged',
    amount: 0.45,
    seedIcon: itemIcon('dwarf_weed_seed'),
    herbIcon: itemIcon('dwarf_weed'),
    tip: 'Your ranged towers hit far harder for one wave.',
    signature: { label: 'Deadeye', icon: ASSETS.misc.ranged_icon },
  },
  {
    id: 'torstol',
    seedName: 'Torstol seed',
    herbName: 'Torstol',
    level: 85,
    cost: 100,
    waves: 6,
    effect: 'gold',
    amount: 0.3,
    seedIcon: itemIcon('torstol_seed'),
    herbIcon: itemIcon('torstol'),
    tip: 'Kills pay much more for one wave.',
    signature: { label: 'Rich Soil', icon: ASSETS.misc.coins_icon },
  },
];

export const SEED_BY_ID: Record<SeedId, SeedDef> = Object.fromEntries(
  SEEDS.map(s => [s.id, s]),
) as Record<SeedId, SeedDef>;

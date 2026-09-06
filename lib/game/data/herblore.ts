import { ASSETS, itemIcon } from '../assets';
import type { SeedId } from './farming';
import type { StyleBoost } from '../systems/style-mods';

/**
 * **Herblore** — what a herb becomes when you don't drink it raw.
 *
 * Farming already hands back a herb that buffs one wave. Herblore is the other
 * thing to do with it: spend the herb and a bought secondary at the bench, and get
 * a *potion* — stronger than the raw herb, lasting several waves, and sitting in
 * the pouch until you choose the wave to drink it on. That trade is the whole
 * skill. A herb used raw pays out now; a herb brewed pays out later, bigger, and
 * only if you had the level for it.
 *
 * The ladder is the real OSRS one — the real herb→secondary pairings, the real
 * Herblore levels and the real XP per potion, from an Attack potion at 3 to a
 * Prayer regeneration potion at 84. Twenty potions.
 *
 * One recipe is ours. OSRS sells the Overload in Nightmare Zone rather than
 * brewing it, so the item is real and the bench's road to it is not: it sits above
 * the Super combat it is built from, lifts all three styles at once, and charges a
 * life at the end of every wave it stays up. The only potion on the ladder that
 * keeps taking after the drink.
 *
 * **A potion is style-targeted, the way OSRS targets them.** A Ranging potion does
 * nothing for a staff and a Super strength does nothing for a bow, so `boost.style`
 * names who it is for; a potion with no style on its boost reaches every boostable
 * tower. None of them reach the Dwarf Cannon, which has fixed damage here for the
 * same reason it does in OSRS.
 *
 * Two mappings the game has to make, because it has no accuracy roll and no
 * hitpoints bar on a tower:
 *
 * - OSRS's **Attack** boosts accuracy. Here it becomes attack *speed*, so an Attack
 *   potion and a Strength potion stay two different things worth brewing.
 * - OSRS's **Antipoison** is immunity. Nothing here poisons the player, so the
 *   Antidote line is pointed at the nearest thing there is: Brutus's charge, Nex's
 *   silence and a volatile pack's blast, the three ways a tower goes quiet.
 *
 * **The brew bargain.** A Saradomin brew hands a life back on the spot and leaves a
 * permanent stack of weakness on the board, and only a Super restore washes those
 * out — three of them at a time, at OSRS's own 3-brews-to-1-restore dosage. A
 * Sanfew serum clears the lot. That loop is the reason the healing potion isn't
 * free, and the reason the restore line is worth a snapdragon.
 */

export type PotionId =
  | 'attack' | 'antidote' | 'strength' | 'energy' | 'combat'
  | 'super_attack' | 'superantipoison' | 'super_energy' | 'super_strength'
  | 'restore' | 'sanfew' | 'ranging' | 'magic' | 'zamorak'
  | 'bastion' | 'battlemage' | 'brew' | 'prayer_regen' | 'super_combat'
  | 'overload';

export interface PotionDef {
  id: PotionId;
  name: string;
  /** The herb it consumes — one, out of the pouch. A Sanfew serum has none: it is
   *  brewed out of another potion. */
  herb?: SeedId;
  /** A potion off the shelf it consumes, for the two recipes OSRS builds on top of
   *  a finished potion. Spent along with the herb, when there is one. */
  potionInput?: PotionId;
  /** The other half of the recipe, bought with gold rather than grown. */
  secondary?: { name: string; icon: string };
  /** Coppers the recipe costs. Cheap against a plot: the herb is what a potion
   *  costs, the coins are a formality. */
  cost: number;
  /** Herblore level to brew it. OSRS's own. */
  level: number;
  /** XP for one. OSRS's own, so the ladder's shape is real even though the level
   *  curve underneath it is not (see `systems/herblore`). OSRS does not hand out
   *  XP in step with the levels, so this column climbs unevenly on purpose. */
  xp: number;
  /** Waves one dose runs for. Zero for a potion that does its whole job on the way
   *  down and never joins the running list. */
  waves: number;
  /** The tower boost while it is up. */
  boost?: StyleBoost;
  /** Fraction the prayer drain is cut by. */
  prayerDrain?: number;
  /** Lives handed back on every wave cleared while it is up. */
  livesOnClear?: number;
  /** Nothing may knock a tower offline while it is up. */
  steady?: boolean;
  /** Lives the dose hands over the moment it goes down. */
  lives?: number;
  /** Permanent weakness stacks the dose leaves on the board. */
  brewStacks?: number;
  /** Brew stacks the dose washes out, or `'all'` for the lot. */
  clearsBrew?: number | 'all';
  /** Lives drinking it costs. Only the Zamorak brew asks for any — that is its
   *  real OSRS bargain, and the reason the strongest potion isn't the obvious one. */
  lifeCost?: number;
  /** Lives the dose takes at the end of every wave it is up for. The Overload's
   *  half of its own bargain, and the ladder's only running cost. */
  livesPerWave?: number;
  icon: string;
  /** One short plain sentence: what the potion does. No numbers — those are the
   *  stat rows beside it. */
  tip: string;
  /** The potion's signature, the way a herb or a trap has one. */
  signature: { label: string; icon: string };
}

export const POTIONS: PotionDef[] = [
  {
    id: 'attack',
    name: 'Attack potion',
    herb: 'guam',
    secondary: { name: 'Eye of newt', icon: itemIcon('eye_of_newt') },
    cost: 25,
    level: 3,
    xp: 25,
    waves: 3,
    boost: { style: 'melee', fireRate: 0.15 },
    icon: itemIcon('attack_potion'),
    tip: 'Your melee towers swing faster.',
    signature: { label: 'Fury', icon: ASSETS.misc.attack_icon },
  },
  {
    id: 'antidote',
    name: 'Antidote',
    herb: 'marrentill',
    secondary: { name: 'Unicorn horn dust', icon: itemIcon('unicorn_horn_dust') },
    cost: 50,
    level: 5,
    xp: 37.5,
    waves: 4,
    steady: true,
    icon: itemIcon('antipoison'),
    tip: 'Nothing knocks your towers offline.',
    signature: { label: 'Steadfast', icon: ASSETS.misc.defence_icon },
  },
  {
    id: 'strength',
    name: 'Strength potion',
    herb: 'tarromin',
    secondary: { name: 'Limpwurt root', icon: itemIcon('limpwurt_root') },
    cost: 75,
    level: 12,
    xp: 50,
    waves: 3,
    boost: { style: 'melee', damage: 0.25 },
    icon: itemIcon('strength_potion'),
    tip: 'Your melee towers hit harder.',
    signature: { label: 'Might', icon: ASSETS.misc.strength_icon },
  },
  {
    id: 'energy',
    name: 'Energy potion',
    herb: 'harralander',
    secondary: { name: 'Chocolate dust', icon: itemIcon('chocolate_dust') },
    cost: 100,
    level: 26,
    xp: 67.5,
    waves: 3,
    boost: { fireRate: 0.12 },
    icon: itemIcon('energy_potion'),
    tip: 'Every tower attacks faster.',
    signature: { label: 'Vigour', icon: ASSETS.misc.orb_run },
  },
  {
    id: 'combat',
    name: 'Combat potion',
    herb: 'harralander',
    secondary: { name: 'Goat horn dust', icon: itemIcon('goat_horn_dust') },
    cost: 150,
    level: 36,
    xp: 84,
    waves: 4,
    boost: { style: 'melee', damage: 0.3, fireRate: 0.15 },
    icon: itemIcon('combat_potion'),
    tip: 'Your melee towers hit harder and swing faster.',
    signature: { label: 'Warpath', icon: ASSETS.misc.attack_icon },
  },
  {
    id: 'super_attack',
    name: 'Super attack',
    herb: 'irit',
    secondary: { name: 'Eye of newt', icon: itemIcon('eye_of_newt') },
    cost: 250,
    level: 45,
    xp: 100,
    waves: 4,
    boost: { style: 'melee', fireRate: 0.3 },
    icon: itemIcon('super_attack'),
    tip: 'Your melee towers swing much faster.',
    signature: { label: 'Precision', icon: ASSETS.misc.attack_icon },
  },
  {
    id: 'superantipoison',
    name: 'Superantipoison',
    herb: 'irit',
    secondary: { name: 'Unicorn horn dust', icon: itemIcon('unicorn_horn_dust') },
    cost: 275,
    level: 48,
    xp: 106.3,
    waves: 6,
    steady: true,
    icon: itemIcon('superantipoison'),
    tip: 'Nothing knocks your towers offline, and it holds far longer.',
    signature: { label: 'Unshaken', icon: ASSETS.misc.defence_icon },
  },
  {
    id: 'super_energy',
    name: 'Super energy',
    herb: 'avantoe',
    secondary: { name: 'Mort myre fungus', icon: itemIcon('mort_myre_fungus') },
    cost: 300,
    level: 52,
    xp: 117.5,
    waves: 4,
    boost: { fireRate: 0.22 },
    icon: itemIcon('super_energy'),
    tip: 'Every tower attacks much faster.',
    signature: { label: 'Relentless', icon: ASSETS.misc.orb_run_on },
  },
  {
    id: 'super_strength',
    name: 'Super strength',
    herb: 'kwuarm',
    secondary: { name: 'Limpwurt root', icon: itemIcon('limpwurt_root') },
    cost: 350,
    level: 55,
    xp: 125,
    waves: 4,
    boost: { style: 'melee', damage: 0.45 },
    icon: itemIcon('super_strength'),
    tip: 'Your melee towers hit much harder.',
    signature: { label: 'Overpower', icon: ASSETS.misc.strength_icon },
  },
  {
    id: 'restore',
    name: 'Super restore',
    herb: 'snapdragon',
    secondary: { name: "Red spiders' eggs", icon: itemIcon('red_spiders_eggs') },
    cost: 400,
    level: 63,
    xp: 142.5,
    waves: 0,
    clearsBrew: 3,
    icon: itemIcon('super_restore'),
    tip: 'Sobers your towers up after a few Saradomin brews.',
    signature: { label: 'Cleansing', icon: ASSETS.misc.orb_hitpoints },
  },
  {
    id: 'sanfew',
    name: 'Sanfew serum',
    potionInput: 'restore',
    secondary: { name: 'Snake weed', icon: itemIcon('snake_weed') },
    cost: 500,
    level: 65,
    xp: 160,
    waves: 5,
    steady: true,
    livesOnClear: 1,
    clearsBrew: 'all',
    icon: itemIcon('sanfew_serum'),
    tip: 'Clears every brew, holds your towers steady, and pays a life each wave.',
    signature: { label: 'Sanctuary', icon: ASSETS.misc.prayer_icon },
  },
  {
    id: 'ranging',
    name: 'Ranging potion',
    herb: 'dwarf',
    secondary: { name: 'Wine of Zamorak', icon: itemIcon('wine_of_zamorak') },
    cost: 550,
    level: 72,
    xp: 162.5,
    waves: 4,
    boost: { style: 'ranged', damage: 0.4 },
    icon: itemIcon('ranging_potion'),
    tip: 'Your ranged towers hit harder.',
    signature: { label: 'Steady Aim', icon: ASSETS.misc.ranged_icon },
  },
  {
    id: 'magic',
    name: 'Magic potion',
    herb: 'lantadyme',
    secondary: { name: 'Potato cactus', icon: itemIcon('potato_cactus') },
    cost: 600,
    level: 76,
    xp: 172.5,
    waves: 4,
    boost: { style: 'magic', damage: 0.4 },
    icon: itemIcon('magic_potion'),
    tip: 'Your wizards hit harder.',
    signature: { label: 'Arcane', icon: ASSETS.misc.magic_icon },
  },
  {
    id: 'zamorak',
    name: 'Zamorak brew',
    herb: 'torstol',
    secondary: { name: 'Jangerberries', icon: itemIcon('jangerberries') },
    cost: 650,
    level: 78,
    xp: 175,
    waves: 5,
    boost: { style: 'melee', damage: 0.6 },
    lifeCost: 1,
    icon: itemIcon('zamorak_brew'),
    tip: 'Your melee towers hit hardest, and the dose costs you a life.',
    signature: { label: 'Berserk', icon: ASSETS.misc.strength_icon },
  },
  {
    id: 'bastion',
    name: 'Bastion potion',
    herb: 'cadantine',
    secondary: { name: 'Wine of Zamorak', icon: itemIcon('wine_of_zamorak') },
    cost: 700,
    level: 80,
    xp: 155,
    waves: 5,
    boost: { style: 'ranged', damage: 0.45, range: 0.2 },
    icon: itemIcon('bastion_potion'),
    tip: 'Your ranged towers hit harder and reach further.',
    signature: { label: 'Vantage', icon: ASSETS.misc.ranged_icon },
  },
  {
    id: 'battlemage',
    name: 'Battlemage potion',
    herb: 'cadantine',
    secondary: { name: 'Potato cactus', icon: itemIcon('potato_cactus') },
    cost: 700,
    level: 80,
    xp: 155,
    waves: 5,
    boost: { style: 'magic', damage: 0.45, range: 0.2 },
    icon: itemIcon('battlemage_potion'),
    tip: 'Your wizards hit harder and reach further.',
    signature: { label: 'Warmage', icon: ASSETS.misc.magic_icon },
  },
  {
    id: 'brew',
    name: 'Saradomin brew',
    herb: 'toadflax',
    secondary: { name: 'Crushed nest', icon: itemIcon('crushed_nest') },
    cost: 750,
    level: 81,
    xp: 180,
    waves: 0,
    lives: 1,
    brewStacks: 1,
    icon: itemIcon('saradomin_brew'),
    tip: 'Hands you a life now, and leaves every tower weaker for the rest of the run.',
    signature: { label: 'Bulwark', icon: ASSETS.misc.orb_hitpoints },
  },
  {
    id: 'prayer_regen',
    name: 'Prayer regeneration potion',
    potionInput: 'restore',
    secondary: { name: 'Aldarium', icon: itemIcon('aldarium') },
    cost: 800,
    level: 84,
    xp: 190,
    waves: 5,
    prayerDrain: 0.4,
    icon: itemIcon('prayer_regeneration_potion'),
    tip: 'Your prayers drain slower.',
    signature: { label: 'Zeal', icon: ASSETS.misc.prayer_icon },
  },
  {
    id: 'super_combat',
    name: 'Super combat potion',
    herb: 'torstol',
    potionInput: 'super_strength',
    cost: 1000,
    level: 90,
    xp: 150,
    waves: 6,
    boost: { style: 'melee', damage: 0.55, fireRate: 0.25 },
    icon: itemIcon('super_combat_potion'),
    tip: 'Your melee towers hit harder and swing faster, for longer than anything else.',
    signature: { label: 'Champion', icon: ASSETS.misc.multicombat_icon },
  },
  {
    id: 'overload',
    name: 'Overload',
    herb: 'torstol',
    potionInput: 'super_combat',
    cost: 1500,
    level: 96,
    xp: 200,
    waves: 4,
    boost: { damage: 0.35, range: 0.15, fireRate: 0.2 },
    livesPerWave: 1,
    icon: itemIcon('overload_4'),
    tip: 'Every tower hits harder, reaches further and swings faster, and each wave costs you a life.',
    signature: { label: 'Overcharge', icon: ASSETS.misc.multicombat_icon },
  },
];

export const POTION_BY_ID: Record<PotionId, PotionDef> = Object.fromEntries(
  POTIONS.map(p => [p.id, p]),
) as Record<PotionId, PotionDef>;

/** How much a Saradomin brew's stack takes off every boostable tower's damage.
 *  Multiplicative, so stacks pile up towards nothing rather than through it. */
export const BREW_DAMAGE_PENALTY = 0.08;

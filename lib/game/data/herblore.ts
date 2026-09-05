import { ASSETS, itemIcon } from '../assets';
import type { SeedId } from './farming';

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
 * The ladder is the real OSRS one — the real herb→potion pairings, the real
 * secondaries, the real Herblore levels and the real XP per potion:
 *
 * | Potion        | Herb       | Secondary          | Level | XP    |
 * |---------------|------------|--------------------|-------|-------|
 * | Attack potion | Guam       | Eye of newt        | 3     | 25    |
 * | Antipoison    | Marrentill | Unicorn horn dust  | 5     | 37.5  |
 * | Prayer potion | Ranarr     | Snape grass        | 38    | 87.5  |
 * | Super restore | Snapdragon | Red spiders' eggs  | 63    | 142.5 |
 * | Zamorak brew  | Torstol    | Jangerberries      | 78    | 175   |
 *
 * **A potion's effect follows the potion, not the herb it came from.** Brewing
 * transforms: a Ranarr raw makes the wave's prayer cheaper because it is a Ranarr,
 * but a Prayer potion is what OSRS drinks to keep praying, so it does that harder
 * and for longer. Two of them are the potion's own OSRS identity carried across
 * whole: a Zamorak brew hits like nothing else and takes hitpoints to drink, and
 * an Antipoison is immunity — here, to the things that knock a tower off the board.
 *
 * The one flavour stretch is that Antipoison: nothing in this game poisons the
 * player, so its immunity is pointed at the nearest thing there is — Brutus's
 * charge, Nex's silence and a volatile pack's blast, the three ways a tower goes
 * quiet. A potion that guards against nothing would not be worth a marrentill.
 */

export type PotionId = 'attack' | 'antipoison' | 'prayer' | 'restore' | 'zamorak';

/**
 * What a potion does while it is up.
 *
 * `damage`, `prayer` and `life` are the same three funnels a herb already feeds
 * (see `systems/farming`), so a potion stacks with the herb riding the same wave
 * rather than needing a pipeline of its own. `steady` is Herblore's own: nothing
 * may knock a tower offline.
 */
export type PotionEffect = 'damage' | 'prayer' | 'life' | 'steady';

export interface PotionDef {
  id: PotionId;
  name: string;
  /** The herb it consumes — one, out of the pouch. */
  herb: SeedId;
  /** The other half of the recipe, bought with gold rather than grown. Cheap
   *  against a plot: the herb is what a potion costs, the coins are a formality. */
  secondary: { name: string; icon: string; cost: number };
  /** Herblore level to brew it. OSRS's own. */
  level: number;
  /** XP for one. OSRS's own, so the ladder's shape is real even though the level
   *  curve underneath it is not (see `systems/herblore`). */
  xp: number;
  /** Waves one dose lasts. */
  waves: number;
  effect: PotionEffect;
  /** Fraction for `damage`/`prayer`, a count of lives for `life`, unused for
   *  `steady`. */
  amount: number;
  /** Lives drinking it costs. Only the Zamorak brew asks for any — that is its
   *  real OSRS bargain, and the reason the strongest potion isn't the obvious one. */
  lifeCost?: number;
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
    secondary: { name: 'Eye of newt', icon: itemIcon('eye_of_newt'), cost: 25 },
    level: 3,
    xp: 25,
    waves: 3,
    effect: 'damage',
    amount: 0.3,
    icon: itemIcon('attack_potion'),
    tip: 'Every tower hits harder for a few waves.',
    signature: { label: 'Fury', icon: ASSETS.misc.attack_icon },
  },
  {
    id: 'antipoison',
    name: 'Antipoison',
    herb: 'marrentill',
    secondary: { name: 'Unicorn horn dust', icon: itemIcon('unicorn_horn_dust'), cost: 50 },
    level: 5,
    xp: 37.5,
    waves: 4,
    effect: 'steady',
    amount: 0,
    icon: itemIcon('antipoison'),
    tip: 'Nothing can knock your towers offline.',
    signature: { label: 'Steadfast', icon: ASSETS.misc.defence_icon },
  },
  {
    id: 'prayer',
    name: 'Prayer potion',
    herb: 'ranarr',
    secondary: { name: 'Snape grass', icon: itemIcon('snape_grass'), cost: 150 },
    level: 38,
    xp: 87.5,
    waves: 4,
    effect: 'prayer',
    amount: 0.4,
    icon: itemIcon('prayer_potion'),
    tip: 'Your prayers drain far slower.',
    signature: { label: 'Zeal', icon: ASSETS.misc.prayer_icon },
  },
  {
    id: 'restore',
    name: 'Super restore',
    herb: 'snapdragon',
    secondary: { name: "Red spiders' eggs", icon: itemIcon('red_spiders_eggs'), cost: 300 },
    level: 63,
    xp: 142.5,
    waves: 3,
    effect: 'life',
    amount: 1,
    icon: itemIcon('super_restore'),
    tip: 'You get a life back every wave you clear.',
    signature: { label: 'Renewal', icon: ASSETS.misc.orb_hitpoints },
  },
  {
    id: 'zamorak',
    name: 'Zamorak brew',
    herb: 'torstol',
    secondary: { name: 'Jangerberries', icon: itemIcon('jangerberries'), cost: 500 },
    level: 78,
    xp: 175,
    waves: 5,
    effect: 'damage',
    amount: 0.5,
    lifeCost: 1,
    icon: itemIcon('zamorak_brew'),
    tip: 'Your towers hit hardest of all, and drinking it costs a life.',
    signature: { label: 'Berserk', icon: ASSETS.misc.strength_icon },
  },
];

export const POTION_BY_ID: Record<PotionId, PotionDef> = Object.fromEntries(
  POTIONS.map(p => [p.id, p]),
) as Record<PotionId, PotionDef>;

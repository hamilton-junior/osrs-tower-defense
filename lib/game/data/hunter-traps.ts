import { ASSETS, itemIcon } from '../assets';

/**
 * **Hunter traps** — the second half of "the road is a mechanic".
 *
 * Shaping the road decides *where* things walk; a trap decides *what happens* on the
 * tile they walk over. They are deliberately not towers: they are laid on the road
 * rather than beside it, they never block passage, they hold a fixed number of
 * charges and then they are gone, and the only thing that limits how many you can
 * have out is a skill — Hunter — that this run levels by catching things.
 *
 * The ladder is the real OSRS one. Every trap here is an item that exists in the
 * game, at the level the game gates it behind, paying the XP the game pays for the
 * catch:
 *
 * | Trap            | Hunter | Catch XP | What it is in OSRS   |
 * |-----------------|--------|----------|----------------------|
 * | Bird snare      | 1      | 34       | Crimson swift        |
 * | Box trap        | 27     | 115      | Ferret               |
 * | Chinchompa      | 53     | 198      | Grey chinchompa      |
 * | Red chinchompa  | 63     | 265      | Carnivorous chinchompa |
 * | Magic box       | 71     | 450      | Imp                  |
 *
 * (Rabbit snare is also level 27, so it is left out rather than sharing a rung with
 * the box trap; black chinchompa sits at 73 but pays *less* than the red, which
 * would read as a downgrade.)
 */

export type HunterTrapId = 'bird_snare' | 'box_trap' | 'chinchompa' | 'red_chinchompa' | 'magic_box';

/**
 * What a trap does when something steps on it.
 *
 * - `snare` holds it still — the trap version of a stun, and the only one that gives
 *   the towers around it the extra seconds they were built for.
 * - `catch` takes a wounded enemy off the board outright and pays extra gold for it,
 *   the way a caught creature is worth more than a dead one.
 * - `blast` is a chinchompa: it explodes, and everything standing near it takes the
 *   hit.
 */
export type HunterTrapKind = 'snare' | 'catch' | 'blast';

export interface HunterTrapDef {
  id: HunterTrapId;
  name: string;
  kind: HunterTrapKind;
  /** The real OSRS Hunter level the item is gated behind. */
  level: number;
  /** The real OSRS XP for the catch this trap is used for. */
  xp: number;
  /** Base price between waves, before the wave surcharge in `trapCost`. */
  cost: number;
  /** How many times it fires before it is used up and leaves its slot. */
  charges: number;
  /** `blast` only: how far the explosion reaches, in logic px. */
  radius: number;
  /** `snare` only: how long it holds, in seconds, before tenacity is applied. */
  hold: number;
  /** `catch` only: the share of max HP an enemy must be under to be taken. */
  catchAt: number;
  /** Local bake — every asset in this game comes out of the OSRS cache. */
  sprite: string;
  /** One short plain sentence: what this does. No numbers — those are the stat
   *  rows underneath it. */
  tip: string;
  /** The trap's signature, the way every tower has one: a name for the thing it
   *  is good at, and an OSRS icon for that thing — not for the trap, which has
   *  its own sprite in the title beside it. */
  signature: { label: string; icon: string };
}

export const HUNTER_TRAPS: HunterTrapDef[] = [
  {
    id: 'bird_snare',
    name: 'Bird snare',
    kind: 'snare',
    level: 1,
    xp: 34,
    cost: 60,
    charges: 3,
    radius: 0,
    hold: 2.4,
    catchAt: 0,
    sprite: itemIcon('bird_snare'),
    tip: 'Holds whatever walks into it.',
    signature: { label: 'Snare', icon: ASSETS.debuffs.stun },
  },
  {
    id: 'box_trap',
    name: 'Box trap',
    kind: 'catch',
    level: 27,
    xp: 115,
    cost: 150,
    charges: 1,
    radius: 0,
    hold: 0,
    catchAt: 0.3,
    sprite: itemIcon('box_trap'),
    tip: 'Takes a wounded enemy and pays for it.',
    signature: { label: 'Payday', icon: ASSETS.misc.coins_icon },
  },
  {
    id: 'chinchompa',
    name: 'Chinchompa',
    kind: 'blast',
    level: 53,
    xp: 198,
    cost: 240,
    charges: 1,
    radius: 72,
    hold: 0,
    catchAt: 0,
    sprite: itemIcon('chinchompa'),
    tip: 'Goes off under the pack that treads on it.',
    signature: { label: 'Chin Blast', icon: ASSETS.misc.multicombat_icon },
  },
  {
    id: 'red_chinchompa',
    name: 'Red chinchompa',
    kind: 'blast',
    level: 63,
    xp: 265,
    cost: 380,
    charges: 1,
    radius: 108,
    hold: 0,
    catchAt: 0,
    sprite: itemIcon('red_chinchompa'),
    tip: 'The same bang, wider and harder.',
    signature: { label: 'Bigger Blast', icon: ASSETS.misc.multicombat_icon },
  },
  {
    id: 'magic_box',
    name: 'Magic box',
    kind: 'catch',
    level: 71,
    xp: 450,
    cost: 520,
    charges: 3,
    radius: 0,
    hold: 0,
    catchAt: 0.45,
    sprite: itemIcon('magic_box'),
    tip: 'Takes a wounded enemy, three times over.',
    signature: { label: 'Triple Catch', icon: ASSETS.misc.magic_icon },
  },
];

export const HUNTER_TRAP_BY_ID: Record<HunterTrapId, HunterTrapDef> = Object.fromEntries(
  HUNTER_TRAPS.map(t => [t.id, t]),
) as Record<HunterTrapId, HunterTrapDef>;

import type { EnemyType } from '../types';

/**
 * Boss pets — the account's long chase, and the only reward in the game that buys
 * nothing at all.
 *
 * Every pet here is a real OSRS pet, dropped by the real boss that drops it in
 * game (see `PetDef.from`). Nothing is invented: a boss with no pet of its own
 * borrows the pet of the place it fights in, and that is said out loud in its
 * comment rather than hidden behind a made-up name.
 *
 * A pet is **cosmetic**. It follows the road's end, it fills a line in the
 * Collection Log, and it touches no stat, no economy and no wave. That is the
 * point: the ladder already pays in power, so the rarest thing in the game pays
 * in nothing but the fact that you have it.
 *
 * The run's own skills drop pets too, and OSRS decides which: Fishing has the
 * Heron, Farming the Tangleroot, and Hunter two — Herbi and the Baby Chinchompa.
 * Herblore has no pet in game, so it has none here either; inventing a fifth one
 * would break the rule the rest of this table keeps.
 */

export type PetId =
  | 'tzrek_jad'
  | 'vorki'
  | 'snakeling'
  | 'ikkle_hydra'
  | 'smol_heredit'
  | 'scurry'
  | 'prince_black_dragon'
  | 'baby_mole'
  | 'noon'
  | 'hellpuppy'
  | 'dark_core'
  | 'graardor_jr'
  | 'nexling'
  | 'heron'
  | 'tangleroot'
  | 'herbi'
  | 'baby_chinchompa';

/**
 * The skilling action a pet rolls off, for the four that no boss drops.
 *
 * Hunter splits in two because OSRS gives it two pets and the board gives it two
 * kinds of trap: the chinchompa's own pet comes off the chinchompa trap, and
 * Herbi — the herbiboar's pet, a hunt with no boss behind it — comes off the box
 * and net traps that stand in for that hunt here.
 */
export type PetSource = 'fishing' | 'farming' | 'hunter_trap' | 'hunter_chin';

/** How the log says a skilling pet's rate out loud. */
export const PET_SOURCE_LABEL: Record<PetSource, string> = {
  fishing: 'per cast',
  farming: 'per harvest',
  hunter_trap: 'per trap catch',
  hunter_chin: 'per chinchompa',
};

export interface PetDef {
  id: PetId;
  /** The pet's own name in OSRS. */
  name: string;
  /** The bosses that can drop it. Noon has two: Dusk and Dawn are one fight.
   *  Empty for a skilling pet, which has a `source` instead. */
  from: readonly EnemyType[];
  /** The skilling action that rolls for it, for a pet no boss drops. */
  source?: PetSource;
  /** Drop chance is 1 in this, per boss kill, at Normal. Ranked by the pet's real
   *  OSRS rarity but compressed hard — a run meets each boss once, so a real
   *  1/3000 would be a pet nobody ever sees.
   *
   *  A skilling pet counts the same way but per action, so its number is a
   *  thousand-fold larger: a long run casts a few hundred times and harvests a
   *  few dozen, and these are sized so one of the four over a run is lucky. */
  rate: number;
  /** One short sentence, shown under the name in the log. */
  blurb: string;
}

export const PETS: readonly PetDef[] = [
  { id: 'baby_mole', name: 'Baby Mole', from: ['giant_mole'], rate: 60,
    blurb: 'Digs where it stands and comes back up filthy.' },
  { id: 'scurry', name: 'Scurry', from: ['scurrius'], rate: 60,
    blurb: 'A rat the size of a cat, and twice as pleased about it.' },
  { id: 'prince_black_dragon', name: 'Prince Black Dragon', from: ['kbd'], rate: 70,
    blurb: 'Royal, tiny, and still learning to breathe fire.' },
  { id: 'tzrek_jad', name: 'TzRek-Jad', from: ['jad'], rate: 80,
    blurb: 'A pocket-sized TzTok-Jad with the same terrible temper.' },
  // Brutus fights in Varlamore's arena, and the arena's pet is the champion's
  // own: Smol Heredit, from Sol Heredit at the Fortis Colosseum. Brutus has no
  // pet of his own in OSRS, so he drops the one the ground he charges on does.
  { id: 'smol_heredit', name: 'Smol Heredit', from: ['brutus'], rate: 80,
    blurb: 'The Colosseum champion, shrunk to the size of his own trophy.' },
  { id: 'vorki', name: 'Vorki', from: ['vorkath'], rate: 90,
    blurb: 'Sleeps like his father did, only for much shorter.' },
  { id: 'snakeling', name: 'Snakeling', from: ['zulrah'], rate: 90,
    blurb: 'Changes colour when it thinks you are not looking.' },
  { id: 'ikkle_hydra', name: 'Ikkle Hydra', from: ['hydra'], rate: 90,
    blurb: 'Three heads, one attention span.' },
  { id: 'hellpuppy', name: 'Hellpuppy', from: ['cerberus'], rate: 90,
    blurb: 'Barks in three directions at once.' },
  // One fight, one pet: Dusk and Dawn are the Grotesque Guardians, and the pair
  // drops Noon — the third guardian — whichever of them falls last.
  { id: 'noon', name: 'Noon', from: ['dusk', 'dawn'], rate: 100,
    blurb: 'The guardian who slept through the whole fight.' },
  { id: 'graardor_jr', name: 'General Graardor Jr.', from: ['graardor'], rate: 110,
    blurb: 'Gives orders to nobody in particular.' },
  // The Corporeal Beast's pet is the dark core he throws — the same name as the
  // minion on the board, and in OSRS the same creature.
  { id: 'dark_core', name: 'Dark core', from: ['corporeal_beast'], rate: 110,
    blurb: 'A hole in the air that follows you around.' },
  { id: 'nexling', name: 'Nexling', from: ['nex'], rate: 120,
    blurb: 'Here already, and rather smug about it.' },
  // The four skilling pets. They roll per action rather than per boss, so they
  // are the one part of the chase a player who never kills a boss can still run.
  { id: 'tangleroot', name: 'Tangleroot', from: [], source: 'farming', rate: 1000,
    blurb: 'A sapling that pulled itself out of the patch.' },
  { id: 'herbi', name: 'Herbi', from: [], source: 'hunter_trap', rate: 1500,
    blurb: 'Finds herbs by smell and eats half of them.' },
  { id: 'baby_chinchompa', name: 'Baby Chinchompa', from: [], source: 'hunter_chin', rate: 1500,
    blurb: 'Puffs up when startled, which is always.' },
  { id: 'heron', name: 'Heron', from: [], source: 'fishing', rate: 3000,
    blurb: 'Watches the water for hours and catches nothing.' },
] as const;

export const PET_BY_ID: Record<PetId, PetDef> =
  Object.fromEntries(PETS.map((p) => [p.id, p])) as Record<PetId, PetDef>;

/** Which pet a boss can drop, if any. Built from `from`, so the table above is
 *  the one place a pet's sources are written. */
export const PET_BY_BOSS: Partial<Record<EnemyType, PetId>> = PETS.reduce((acc, p) => {
  for (const boss of p.from) acc[boss] = p.id;
  return acc;
}, {} as Partial<Record<EnemyType, PetId>>);

/** Which pet a skilling action can drop, if any. Built from `source`, for the
 *  same reason `PET_BY_BOSS` is built from `from`. */
export const PET_BY_SOURCE: Partial<Record<PetSource, PetId>> = PETS.reduce((acc, p) => {
  if (p.source) acc[p.source] = p.id;
  return acc;
}, {} as Partial<Record<PetSource, PetId>>);

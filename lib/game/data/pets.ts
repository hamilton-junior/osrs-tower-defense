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
  | 'nexling';

export interface PetDef {
  id: PetId;
  /** The pet's own name in OSRS. */
  name: string;
  /** The bosses that can drop it. Noon has two: Dusk and Dawn are one fight. */
  from: readonly EnemyType[];
  /** Drop chance is 1 in this, per boss kill, at Normal. Ranked by the pet's real
   *  OSRS rarity but compressed hard — a run meets each boss once, so a real
   *  1/3000 would be a pet nobody ever sees. */
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
] as const;

export const PET_BY_ID: Record<PetId, PetDef> =
  Object.fromEntries(PETS.map((p) => [p.id, p])) as Record<PetId, PetDef>;

/** Which pet a boss can drop, if any. Built from `from`, so the table above is
 *  the one place a pet's sources are written. */
export const PET_BY_BOSS: Partial<Record<EnemyType, PetId>> = PETS.reduce((acc, p) => {
  for (const boss of p.from) acc[boss] = p.id;
  return acc;
}, {} as Partial<Record<EnemyType, PetId>>);

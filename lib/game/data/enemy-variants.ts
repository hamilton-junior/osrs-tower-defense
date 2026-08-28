import { ENEMIES } from './enemies';
import type { EnemyType } from '../types';

/**
 * **The looks a monster can wear.**
 *
 * A monster is one `EnemyType` with one stat block, but the cache often gives it
 * several bodies: the Barrows wight is six brothers, a Summoned Soul is three
 * elemental spirits, Brutus grows horns for the length of a charge. Each of those
 * is a **baked clip slug** (`public/assets/enemies/<slug>/`) rather than a monster
 * of its own — same health, same speed, same line in the Collection Log.
 *
 * The table is the one place that knows a slug's *name*. Before it, the Barrows
 * brothers were a hardcoded list inside the debug panel, so the game could spawn
 * Verac while no screen could tell you it was Verac. Now the Bestiary and the
 * Collection Log read the same rows, and {@link ../systems/model-variants} draws
 * the spawner's shuffle bag from them too.
 *
 * **A look is not a monster.** Two lookalikes that differ in *stats* — a big frog
 * and a giant frog — stay separate `EnemyType`s; grouping them here would throw
 * away the difference a player can feel. Only same-stat skins belong in this file.
 */
export interface EnemyLookDef {
  /** Baked clip slug. Must exist in `data/enemy-anims`, or nothing can draw it. */
  slug: string;
  /** Its own name — Ahrim, Verac, Dharok — never an index. */
  name: string;
  /** The monster whose stat block this look borrows. */
  of: EnemyType;
  /** What the info block calls it: the family it belongs to, or the role it plays. */
  kind: string;
  /** True when the *spawner* may roll this look at random for its type. Cosmetic
   *  brothers are rolled; a boss add or a scripted rage form is chosen by the
   *  fight, so it is reachable in the Bestiary but never drawn from the bag. */
  rolled?: boolean;
}

/** Every named look, including each monster's own default one — the default is
 *  one of the brothers, not a base the others replace. */
export const ENEMY_LOOKS: readonly EnemyLookDef[] = [
  // The Barrows. `barrow_wight` is Dharok's bake, which is why he has no slug of
  // his own; the other five are extra bakes of the same wight.
  { slug: 'barrow_wight', name: 'Dharok the Wretched', of: 'barrow_wight', kind: 'Barrow Wight', rolled: true },
  { slug: 'ahrim', name: 'Ahrim the Blighted', of: 'barrow_wight', kind: 'Barrow Wight', rolled: true },
  { slug: 'guthan', name: 'Guthan the Infested', of: 'barrow_wight', kind: 'Barrow Wight', rolled: true },
  { slug: 'karil', name: 'Karil the Tainted', of: 'barrow_wight', kind: 'Barrow Wight', rolled: true },
  { slug: 'torag', name: 'Torag the Corrupted', of: 'barrow_wight', kind: 'Barrow Wight', rolled: true },
  { slug: 'verac', name: 'Verac the Defiled', of: 'barrow_wight', kind: 'Barrow Wight', rolled: true },
  // Cerberus's souls: one type, three bodies, and which one appears is the
  // fight's decision (each soul carries a combat style), never a shuffle.
  { slug: 'soul_melee', name: 'Summoned Soul (Melee)', of: 'summoned_soul', kind: 'Boss add' },
  { slug: 'soul_ranged', name: 'Summoned Soul (Ranged)', of: 'summoned_soul', kind: 'Boss add' },
  { slug: 'soul_magic', name: 'Summoned Soul (Magic)', of: 'summoned_soul', kind: 'Boss add' },
  // Brutus himself, before and during a charge — not an add: there is only ever
  // one bull on the field.
  { slug: 'brutus', name: 'Brutus', of: 'brutus', kind: 'Boss' },
  { slug: 'brutus_demonic', name: 'Demonic Brutus', of: 'brutus', kind: 'Brutus, enraged' },
];

/** Look by slug — how a screen turns a baked clip folder back into a name. */
export const LOOK_BY_SLUG: Record<string, EnemyLookDef> = Object.fromEntries(
  ENEMY_LOOKS.map((l) => [l.slug, l]),
);

/** Looks grouped under the monster that wears them. A type absent here has
 *  exactly one look — its own slug — and needs no viewer. */
export const LOOKS_BY_TYPE: Partial<Record<EnemyType, readonly EnemyLookDef[]>> =
  ENEMY_LOOKS.reduce<Partial<Record<EnemyType, EnemyLookDef[]>>>((acc, l) => {
    (acc[l.of] ??= []).push(l);
    return acc;
  }, {});

/** The slug a monster is drawn with when nothing picks a look for it. */
export function defaultLookSlug(type: string): string {
  return ENEMIES[type as EnemyType]?.animSlug ?? type;
}

/** The name to print for a baked slug: the look's own name if it has one,
 *  otherwise the monster's. */
export function lookName(slug: string): string {
  return LOOK_BY_SLUG[slug]?.name ?? ENEMIES[slug as EnemyType]?.name ?? slug;
}

/** The monster a baked slug belongs to. */
export function lookType(slug: string): EnemyType {
  return LOOK_BY_SLUG[slug]?.of ?? (slug as EnemyType);
}

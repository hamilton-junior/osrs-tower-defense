import { ENEMY_ANIMS } from '../data/enemy-anims';
import type { EnemyType } from '../types';

/**
 * **Cosmetic model variants** — one enemy type, several baked appearances.
 *
 * A Barrow Wight is a Barrows brother, and there are six of them. Sending the
 * same Dharok model six times in a row reads as one monster copy-pasted; letting
 * the row be Dharok, Verac, Karil, Torag… reads as a raiding party, for the price
 * of art we already have. Nothing else changes: the variant only overrides
 * `Enemy.animType`, which the renderer uses to pick the clip, so stats, drops,
 * kill counts and the Collection Log all still see one `barrow_wight`.
 *
 * Each entry lists **baked clip slugs** (`public/assets/enemies/<slug>/`), and the
 * type's own slug belongs in the list — it is one of the looks, not a default the
 * others replace. A slug with no bake behind it is dropped at load, so an entry
 * can be written before its art exists without ever spawning an invisible enemy.
 */
const VARIANT_SLUGS: Partial<Record<EnemyType, readonly string[]>> = {
  barrow_wight: ['barrow_wight', 'ahrim', 'guthan', 'karil', 'torag', 'verac'],
};

/** The table with unbaked slugs removed. A type left with one look (or none) is
 *  dropped entirely, so `pickVariant` can early-out on the common case. */
export const MODEL_VARIANTS: Partial<Record<EnemyType, readonly string[]>> = Object.fromEntries(
  Object.entries(VARIANT_SLUGS)
    .map(([type, slugs]) => [type, slugs.filter((s) => s in ENEMY_ANIMS)] as const)
    .filter(([, slugs]) => slugs.length > 1),
);

/**
 * Per-wave draw state: type → the looks not yet used this wave. It is a bag, not
 * a dice roll — every brother appears once before any of them appears twice, so a
 * wave of six wights is six different brothers rather than Dharok four times by
 * chance. Refills once emptied, so a wave longer than the roster keeps going.
 */
export type VariantBag = Partial<Record<string, string[]>>;

/** Start of a wave: forget what was drawn, so the next wave leads with a fresh
 *  shuffle instead of the tail of the last one. */
export function resetVariantBag(bag: VariantBag) {
  for (const k of Object.keys(bag)) delete bag[k];
}

/**
 * Draw the next look for `type`, or `undefined` when the type has no variants
 * (the overwhelming majority — the caller then leaves `animType` alone and the
 * enemy renders as itself). Mutates `bag`.
 */
export function pickVariant(
  type: EnemyType,
  bag: VariantBag,
  rng: () => number = Math.random,
  table: Partial<Record<string, readonly string[]>> = MODEL_VARIANTS,
): string | undefined {
  const all = table[type];
  if (!all) return undefined;
  let left = bag[type];
  if (!left || left.length === 0) left = bag[type] = [...all];
  const i = Math.min(left.length - 1, Math.floor(rng() * left.length));
  return left.splice(i, 1)[0];
}

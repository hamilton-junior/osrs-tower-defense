import { PET_BY_BOSS, PET_BY_ID, PETS, type PetId } from '../data/pets';
import type { EnemyType } from '../types';

/**
 * The boss-pet chase: how a kill rolls for a pet, and what the account is allowed
 * to hold.
 *
 * Pure and tested, because it is the one system whose numbers a player will count
 * over hundreds of kills. Everything stateful (the tally, the popup, the sprite on
 * the board) lives in the engine and the renderer; nothing here reads or writes
 * anything.
 *
 * A pet is cosmetic, so none of this feeds a stat. The only difficulty term is the
 * one that makes a harder tier worth farming: {@link PET_LUCK_PER_TIER}.
 */

/** Each New Game+ tier adds this much to the pet chance (tier 0 = no change).
 *  A pet is the reward for choosing the hard board, so Grandmaster rolls at
 *  1 + 6 × 0.12 = 1.72× the Normal rate. */
export const PET_LUCK_PER_TIER = 0.12;

/** The chance one boss kill drops the pet, as a probability in [0, 1].
 *  `rate` is the pet's "1 in N" at Normal; `tier` is the run's difficulty tier. */
export function petDropChance(rate: number, tier: number): number {
  if (!(rate > 0)) return 0;
  const luck = 1 + PET_LUCK_PER_TIER * Math.max(0, tier);
  return Math.min(1, luck / rate);
}

/**
 * Roll one boss kill for its pet. Returns the pet id on a hit, null otherwise
 * (including for every enemy that has no pet behind it).
 *
 * Already owning the pet does **not** stop the roll — a duplicate is a real OSRS
 * drop and the tally counts it. What changes on a duplicate is the announcement,
 * and that is the engine's call, not this function's.
 */
export function rollPetDrop(boss: EnemyType, tier: number, rng: () => number = Math.random): PetId | null {
  const id = PET_BY_BOSS[boss];
  if (!id) return null;
  return rng() < petDropChance(PET_BY_ID[id].rate, tier) ? id : null;
}

/** How many distinct pets the account holds, and out of how many. */
export function petProgress(counts: Record<string, number>): { owned: number; total: number } {
  return { owned: PETS.filter((p) => (counts[p.id] ?? 0) > 0).length, total: PETS.length };
}

/** The stored active pet, or null when it names a pet the account does not hold —
 *  an imported save, or a pet id retired by a patch, must not leave a ghost
 *  following the road. */
export function validActivePet(counts: Record<string, number>, id: unknown): PetId | null {
  if (typeof id !== 'string') return null;
  const pet = PET_BY_ID[id as PetId];
  return pet && (counts[pet.id] ?? 0) > 0 ? pet.id : null;
}

/** Coerce a stored `{ id: count }` blob into a pet tally: known ids with positive
 *  whole counts, everything else dropped. Same trust model as the rest of the
 *  account — one bad entry costs its own line, never the log. */
export function sanitizePets(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (!PET_BY_ID[id as PetId]) continue;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) out[id] = Math.floor(n);
  }
  return out;
}

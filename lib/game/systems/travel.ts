import { BIOME_LIST, type BiomeId } from '../data/biomes';
import { makeRng } from './map-generation';

/**
 * **Travelling between regions** — the run is a journey, not a single field.
 *
 * A boss is the end of a leg. Put one down and the road forks: the player picks which
 * region to march into next. Only the *place* changes: the palette it is drawn in and
 * the monsters native to it (see `systems/enemy-regions`). The road itself, the terrain
 * scattered beside it, the towers standing on it and the bends the player paid to shape
 * are all untouched — a leg change must never invalidate a board the player has been
 * building for ten waves.
 *
 * Hanging the fork on the boss rather than a wave count is what makes it a reward: the
 * journey moves when the run *earns* it, and the boss is already the beat where the run
 * stops to hand something out (the roguelite relic goes out on the same clear).
 *
 * The choice itself is pure and seeded off the run's map seed, so the same run offers
 * the same two roads at the same turns.
 */

/** How many regions a turn offers. Two is a choice; three is a menu — and the point
 *  is that leaving something behind costs. */
export const TRAVEL_CHOICES = 2;

/**
 * The regions offered at the turn opening after `turn`.
 *
 * `turn` is any number that identifies this fork within the run — the engine passes the
 * wave the road forked on, which no second fork can share.
 *
 * Never offers where the run already stands — travelling has to *travel* — and, when
 * the roster allows it, never the region the player just left either, so a two-region
 * ping-pong is not the safest route. Deterministic in `seed` + `turn`: the same run
 * always reaches the same fork.
 */
export function travelOffer(
  seed: number,
  turn: number,
  current: BiomeId,
  previous?: BiomeId | null,
): BiomeId[] {
  const all = BIOME_LIST.map((b) => b.id);
  // Excluding the previous region is a *preference*: with few enough regions it can
  // starve the offer, and having somewhere to go always wins over having somewhere new.
  let pool = all.filter((id) => id !== current && id !== previous);
  if (pool.length < TRAVEL_CHOICES) pool = all.filter((id) => id !== current);

  const rng = makeRng(((seed >>> 0) ^ Math.imul(Math.floor(turn) + 1, 0x9e3779b9)) >>> 0);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(TRAVEL_CHOICES, pool.length));
}

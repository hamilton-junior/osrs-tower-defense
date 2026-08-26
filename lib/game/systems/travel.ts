import { BIOME_LIST, type BiomeId } from '../data/biomes';
import { makeRng } from './map-generation';

/**
 * **Travelling between regions** — the run is a journey, not a single field.
 *
 * Every {@link TRAVEL_INTERVAL} waves the road reaches a turn, and the player picks
 * which region to march into next. Only the *place* changes: the palette it is drawn
 * in and the monsters native to it (see `systems/enemy-regions`). The road itself,
 * the terrain scattered beside it, the towers standing on it and the bends the player
 * paid to shape are all untouched — a leg change must never invalidate a board the
 * player has been building for ten waves.
 *
 * Everything here is pure and seeded off the run's map seed, so the same run offers
 * the same two roads at the same turns — a save resumed mid-journey is handed back
 * exactly the choice it was showing.
 */

/** Waves per leg: how far the run marches before the road reaches its next turn. */
export const TRAVEL_INTERVAL = 5;

/** How many regions a turn offers. Two is a choice; three is a menu — and the point
 *  is that leaving something behind costs. */
export const TRAVEL_CHOICES = 2;

/** Whether `wave` — the wave about to be *fought* — opens a new leg. Wave 1 never
 *  does: the run starts in the region its map seed rolled, unasked. */
export function isTravelWave(wave: number): boolean {
  return wave > 1 && Number.isFinite(wave) && (Math.floor(wave) - 1) % TRAVEL_INTERVAL === 0;
}

/** Which leg `wave` belongs to. Leg 0 is the opening region, leg 1 the first place
 *  the player *chose*, and so on. */
export function legOfWave(wave: number): number {
  const w = Math.max(1, Math.floor(Number.isFinite(wave) ? wave : 1));
  return Math.floor((w - 1) / TRAVEL_INTERVAL);
}

/** Waves still to fight in this leg, counting the one about to start (1..INTERVAL) —
 *  what the HUD counts down to the next turn in the road. */
export function wavesUntilTravel(wave: number): number {
  const w = Math.max(1, Math.floor(Number.isFinite(wave) ? wave : 1));
  return TRAVEL_INTERVAL - ((w - 1) % TRAVEL_INTERVAL);
}

/**
 * The regions offered at the turn opening `leg`.
 *
 * Never offers where the run already stands — travelling has to *travel* — and, when
 * the roster allows it, never the region the player just left either, so a two-region
 * ping-pong is not the safest route. Deterministic in `seed` + `leg`: the same run
 * always reaches the same fork.
 */
export function travelOffer(
  seed: number,
  leg: number,
  current: BiomeId,
  previous?: BiomeId | null,
): BiomeId[] {
  const all = BIOME_LIST.map((b) => b.id);
  // Excluding the previous region is a *preference*: with few enough regions it can
  // starve the offer, and having somewhere to go always wins over having somewhere new.
  let pool = all.filter((id) => id !== current && id !== previous);
  if (pool.length < TRAVEL_CHOICES) pool = all.filter((id) => id !== current);

  const rng = makeRng(((seed >>> 0) ^ Math.imul(leg + 1, 0x9e3779b9)) >>> 0);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(TRAVEL_CHOICES, pool.length));
}

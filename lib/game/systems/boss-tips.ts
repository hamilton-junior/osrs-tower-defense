import type { BossId } from './boss-mechanics';

/**
 * One line per boss: *how you are meant to kill it*.
 *
 * A boss mechanic that the player cannot name is indistinguishable from an unfair
 * one — the Hydra healing behind its vent reads as "my towers stopped working", not
 * as "burst this". These strings are the answer, shown on the enemy panel and in the
 * Collection Log, and they must describe the mechanic that is actually implemented in
 * {@link import('./boss-mechanics')}: change a boss's behaviour, change its line here.
 *
 * Written as an instruction, not as lore — what the player should *do*, in one breath.
 * In-game strings are English regardless of the conversation's language.
 */
export const BOSS_TIPS: Record<BossId, string> = {
  brutus:
    'Hurt him enough and he growls, turns demonic and charges off the road before trotting back to the spot he left. He never skips ground, but any tower he ploughs through is knocked offline for five seconds — so keep your line a little wider than his charge instead of stacking one tight box he can flatten in a single run.',
  giant_mole:
    'Burrows and resurfaces further down the road, skipping whatever you fortified. Spread your damage along the path instead of stacking one killzone — and note it never digs on the final approach.',
  jad:
    'Below half health he calls three Yt-HurKot healers, and while they live he heals back a share of the damage you just dealt. Kill the healers first; damage on Jad is wasted until they are down.',
  vorkath:
    'Periodically raises an ice shield: immune to everything while it holds. Do not feed it — hold your burst for the window between shields.',
  zulrah:
    'Rotates through three forms, each weak to one combat style and heavily resistant to the other two. You need all three styles covering the same stretch of road, not one perfect tower.',
  dusk:
    'Arrives paired with Dawn. While both stand they share their stone and each takes half damage, and the survivor drags its twin back up — so kill them close together, not one at a time.',
  dawn:
    'Arrives paired with Dusk. While both stand they share their stone and each takes half damage, and the survivor drags its twin back up — so kill them close together, not one at a time.',
  cerberus:
    'Summons Summoned Souls, each locking one combat style out against him. Which soul you must kill first depends on the board you built — check what your damage is made of.',
  hydra:
    'Opens a chemical vent at each health threshold: it hardens and regenerates until you burst through the vent. Sustained chip damage loses this fight; saved burst wins it.',
};

/** The "how to kill" line for an enemy type, or undefined if it isn't a boss with one. */
export function bossTip(type: string): string | undefined {
  return BOSS_TIPS[type as BossId];
}

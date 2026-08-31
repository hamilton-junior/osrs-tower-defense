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
    'Hurt him enough and he growls, turns demonic and charges off the road straight at your nearest tower before trotting back to the spot he left. He never skips ground, but whatever he ploughs through is knocked offline for five seconds — so give the towers hugging the road some space, or he picks one off every time you make him angry.',
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
  scurrius:
    'Every heavy hit splits a Giant rat off him, carrying health out of his own bar — so burst alone just turns one big target into several small ones. The rats scatter across the board and then run back to him, handing the health straight back, so kill them before they arrive. Bring something that hits more than one thing at a time.',
  graardor:
    'His three sergeants march in front of him, and while any of them is still ahead he barely takes damage. Your towers already aim at whatever is furthest along the road, so leave them on First and the guards die first — a board set to Strongest shoots the armoured General all fight. He also slams the ground and shatters your prayers for a few seconds; there is no answer, only the wait.',
  corporeal_beast:
    'Spits a Dark energy core at your strongest tower. While it holds on, that tower stops shooting the wave and heals him instead, and he takes half damage — kill the core and both come back. A board built around one star tower feeds him; towers that cover each other free it in seconds.',
  kbd:
    'Sets a stretch of road on fire, and picks whichever stretch the most of your towers are covering — everything that reaches the flames hits for half while they burn. A killbox around one bend loses its whole board to one breath; a long, thin line down the road loses two towers.',
};

/** The "how to kill" line for an enemy type, or undefined if it isn't a boss with one. */
export function bossTip(type: string): string | undefined {
  return BOSS_TIPS[type as BossId];
}

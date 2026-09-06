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
    'His rage charges him off the road, knocking any tower he ploughs through offline. Give the towers hugging the road some space.',
  giant_mole:
    'She burrows and comes up further down the road, skipping whatever you fortified. Spread your damage along the path.',
  jad:
    'Below half health he calls three healers and heals off your damage. Kill the healers first.',
  vorkath:
    'His ice shield makes him immune while it holds. Save your burst for the gap between shields.',
  zulrah:
    'He rotates through three forms, each weak to a different combat style. Cover one stretch of road with all three.',
  dusk:
    'The pair share their stone while both stand: half damage each, and the survivor revives the other. Kill them close together.',
  dawn:
    'The pair share their stone while both stand: half damage each, and the survivor revives the other. Kill them close together.',
  cerberus:
    'Each Summoned Soul locks one combat style out against him. Kill the soul your board cannot fight without.',
  hydra:
    'At each health threshold it vents and hardens, healing behind the shield. Chip damage will not break it in time, so save your burst.',
  scurrius:
    'Heavy hits split rats off him, and every rat that runs back hands his health over. Kill the rats before they reach him.',
  nex:
    'An acolyte hides her from your towers and silences every tower casting its own Ancient. Kill the acolyte to open the next phase.',
  graardor:
    'His sergeants shield him while they are ahead of him, so leave your towers on First. The slam that follows frees everything nearby from slows and stuns for a few seconds.',
  corporeal_beast:
    'He spits Dark energy cores at the towers hurting him most; a held tower feeds him instead of shooting, and he takes half damage. Kill the cores fast, because nothing slows them.',
  kbd:
    'He burns whichever stretch of road your towers cover most, halving everything that reaches the flames. Do not stack the whole board on one bend.',
};

/** The "how to kill" line for an enemy type, or undefined if it isn't a boss with one. */
export function bossTip(type: string): string | undefined {
  return BOSS_TIPS[type as BossId];
}

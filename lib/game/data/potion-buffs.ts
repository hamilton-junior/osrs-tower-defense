import type { ActivePotion, CombatStyle } from '../types';

/**
 * One timed potion buff.
 *
 * A buff targets a combat **style**, not a tower — so a Ranging potion boosts
 * every `ranged` weapon. `style` undefined means it boosts every style (that is
 * Overload). The bonus fractions are what `calculateTowerStats` applies, so
 * retuning a buff is a data-only change.
 *
 * Not to be confused with the Herblore potions in `data/herblore.ts`: those the
 * player brews and drinks, and they last a number of waves. These are handed
 * over whole by a Distraction & Diversion and run on a clock in seconds.
 */
export interface PotionBuff {
  id: ActivePotion['type'];
  name: string;
  desc: string;
  /** Wiki image filename (no extension) used for the icon. */
  wiki: string;
  /** Combat style this buff boosts; undefined = every style. */
  style?: CombatStyle;
  /** Damage bonus fraction (0.15 = +15%). */
  dmg?: number;
  /** Range bonus fraction. */
  range?: number;
  /** Attack-speed bonus fraction. */
  speed?: number;
}

/**
 * Every buff that can be running. Only Overload is handed out today (the plant
 * and nest diversions pay it, because a style-less buff is worth something
 * whatever the player happens to have built) — the styled three are what the
 * next reward to want a narrower gift would reach for.
 */
export const POTION_BUFFS: PotionBuff[] = [
  { id: 'ranging', name: 'Ranging Potion', desc: 'Ranged towers +15% damage & +10% range', wiki: 'Ranging_potion(4)', style: 'ranged', dmg: 0.15, range: 0.10 },
  { id: 'magic', name: 'Magic Potion', desc: 'Magic towers +20% damage', wiki: 'Magic_potion(4)', style: 'magic', dmg: 0.20 },
  { id: 'super_combat', name: 'Super Combat', desc: 'Melee towers +15% damage', wiki: 'Super_combat_potion(4)', style: 'melee', dmg: 0.15 },
  { id: 'overload', name: 'Overload', desc: 'All towers +15% damage, +10% range & speed', wiki: 'Overload_(4)', dmg: 0.15, range: 0.10, speed: 0.10 },
];

/** Seconds of simulated time a buff lasts. */
export const POTION_BUFF_DURATION = 45;

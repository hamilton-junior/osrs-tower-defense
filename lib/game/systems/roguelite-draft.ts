import { ASSETS } from '../assets';

/**
 * Roguelite draft: the per-wave choice that defines the mode. After clearing a
 * wave in roguelite mode the engine rolls a small hand of {@link DraftCard}s and
 * the player keeps one, applying its {@link DraftEffect} to the run. This module
 * is pure (RNG injected) so the pool and the weighted roll are unit-testable; the
 * engine owns applying the chosen effect.
 */

export type DraftRarity = 'common' | 'rare' | 'epic';

/** What keeping a card does. Instant effects grant a one-off resource; the
 *  `*Mult` effects fold into the engine's run-scoped {@link RunModifiers} and
 *  buff every tower for the rest of the run. Add a kind here, handle it in the
 *  engine's `applyDraftEffect`, and add a card to {@link DRAFT_POOL}. */
export type DraftEffect =
  | { kind: 'gold'; amount: number }
  | { kind: 'essence'; amount: number }
  | { kind: 'life'; amount: number }
  | { kind: 'maxLife'; amount: number }
  | { kind: 'damage'; mult: number }
  | { kind: 'range'; mult: number }
  | { kind: 'fireRate'; mult: number };

export interface DraftCard {
  id: string;
  name: string;
  /** One-line, OSRS-flavoured description of the reward. */
  desc: string;
  rarity: DraftRarity;
  /** Icon URL (from {@link ASSETS}) shown on the card. */
  icon: string;
  effect: DraftEffect;
}

/** Selection weight per rarity — commons are the backbone, epics rare treats. */
export const RARITY_WEIGHT: Record<DraftRarity, number> = {
  common: 100,
  rare: 36,
  epic: 11,
};

/** The starting draft pool. Deliberately small and legible; the roguelite grows
 *  by adding cards (and, later, tower/prayer/debuff kinds) here. */
export const DRAFT_POOL: readonly DraftCard[] = [
  // — commons —
  {
    id: 'coin_pouch',
    name: 'Coin Pouch',
    desc: '+250 gold to spend now',
    rarity: 'common',
    icon: ASSETS.misc.coins_icon,
    effect: { kind: 'gold', amount: 250 },
  },
  {
    id: 'essence_cache',
    name: 'Essence Cache',
    desc: '+15 Rune Essence (kept after the run)',
    rarity: 'common',
    icon: ASSETS.misc.rune_essence_icon,
    effect: { kind: 'essence', amount: 15 },
  },
  {
    id: 'bandages',
    name: 'Bandages',
    desc: 'Repair the gate for +2 lives',
    rarity: 'common',
    icon: ASSETS.misc.hp_icon,
    effect: { kind: 'life', amount: 2 },
  },
  // — rares —
  {
    id: 'sharpened_blades',
    name: 'Sharpened Blades',
    desc: '+15% damage for every tower, this run',
    rarity: 'rare',
    icon: ASSETS.misc.strength_icon,
    effect: { kind: 'damage', mult: 1.15 },
  },
  {
    id: 'eagle_eyes',
    name: 'Eagle Eyes',
    desc: '+12% range for every tower, this run',
    rarity: 'rare',
    icon: ASSETS.misc.ranged_icon,
    effect: { kind: 'range', mult: 1.12 },
  },
  {
    id: 'battle_cadence',
    name: 'Battle Cadence',
    desc: '+12% attack speed for every tower, this run',
    rarity: 'rare',
    icon: ASSETS.misc.attack_icon,
    effect: { kind: 'fireRate', mult: 1.12 },
  },
  {
    id: 'fortify_gate',
    name: 'Fortify Gate',
    desc: '+1 max life (and heal 1)',
    rarity: 'rare',
    icon: ASSETS.misc.hp_icon,
    effect: { kind: 'maxLife', amount: 1 },
  },
  // — epics —
  {
    id: 'berserk',
    name: 'Berserk',
    desc: '+30% damage for every tower, this run',
    rarity: 'epic',
    icon: ASSETS.misc.strength_icon,
    effect: { kind: 'damage', mult: 1.3 },
  },
  {
    id: 'dragonstone_hoard',
    name: 'Dragonstone Hoard',
    desc: '+500 gold to spend now',
    rarity: 'epic',
    icon: ASSETS.misc.coins_icon,
    effect: { kind: 'gold', amount: 500 },
  },
  {
    id: 'greater_fortify',
    name: 'Greater Fortify',
    desc: '+2 max life (and heal 2)',
    rarity: 'epic',
    icon: ASSETS.misc.hp_icon,
    effect: { kind: 'maxLife', amount: 2 },
  },
];

/**
 * Roll a hand of `count` distinct cards, weighted by rarity, without
 * replacement. `rng` is injected (`Math.random` in the engine) so the roll is
 * deterministic under test. Never returns more than the pool holds.
 */
export function rollDraft(
  rng: () => number,
  count = 3,
  pool: readonly DraftCard[] = DRAFT_POOL,
): DraftCard[] {
  const remaining = [...pool];
  const hand: DraftCard[] = [];
  const n = Math.min(count, remaining.length);
  for (let i = 0; i < n; i++) {
    const total = remaining.reduce((s, c) => s + RARITY_WEIGHT[c.rarity], 0);
    let roll = rng() * total;
    let idx = 0;
    for (let j = 0; j < remaining.length; j++) {
      roll -= RARITY_WEIGHT[remaining[j].rarity];
      if (roll < 0) { idx = j; break; }
      idx = j;
    }
    hand.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return hand;
}

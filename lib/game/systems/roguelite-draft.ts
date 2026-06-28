import { ASSETS } from '../assets';

/**
 * Roguelite draft: the per-wave choice that defines the mode. After clearing a
 * wave in roguelite mode the engine rolls a small hand of {@link DraftCard}s and
 * the player keeps one, applying its {@link DraftEffect} to the run. This module
 * is pure (RNG injected) so the pool and the weighted roll are unit-testable; the
 * engine owns applying the chosen effect.
 *
 * Balance note — `range`/`fireRate` multipliers are GAME-CHANGING (they reshape
 * coverage and DPS far more than flat damage), so their per-rarity steps are kept
 * deliberately *small* (see {@link RNG}/{@link SPD}). All `*Mult` effects fold
 * into the run's {@link RunModifiers} **multiplicatively**, so stacking three
 * +5% range cards compounds to ×1.16, not +15% — the curve is intentional.
 */

export type DraftRarity = 'common' | 'rare' | 'epic';

/** What keeping a card does. Instant effects grant a one-off resource; the
 *  `*Mult` effects fold into the engine's run-scoped {@link RunModifiers} and
 *  buff every tower for the rest of the run (multiplicatively). `multi` bundles
 *  several effects into one card (combo rewards). Add a kind here, handle it in
 *  the engine's `applyDraftEffect`, and add a card to {@link DRAFT_POOL}. */
export type DraftEffect =
  | { kind: 'gold'; amount: number }
  | { kind: 'essence'; amount: number }
  | { kind: 'life'; amount: number }
  | { kind: 'maxLife'; amount: number }
  | { kind: 'damage'; mult: number }
  | { kind: 'range'; mult: number }
  | { kind: 'fireRate'; mult: number }
  | { kind: 'multi'; effects: DraftEffect[] };

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

const M = ASSETS.misc;

/**
 * Per-rarity multiplier steps. Damage may step harder; range & fire-rate are the
 * game-changers, so their steps stay small and compound multiplicatively. Combo
 * (`multi`) cards reuse the *lower* tier's step per stat, so a two-stat card is
 * roughly worth one single-stat card of its own rarity.
 */
const DMG: Record<DraftRarity, number> = { common: 1.06, rare: 1.12, epic: 1.22 };
const RNG: Record<DraftRarity, number> = { common: 1.03, rare: 1.05, epic: 1.08 };
const SPD: Record<DraftRarity, number> = { common: 1.03, rare: 1.05, epic: 1.08 };

/**
 * The draft pool. 50+ OSRS-flavoured cards across three rarities — single-stat
 * boosts, instant resources, and combo (`multi`) cards. Grow it by adding cards
 * here (and, later, tower/prayer/debuff kinds + their `applyDraftEffect` cases).
 */
export const DRAFT_POOL: readonly DraftCard[] = [
  // ───────────────────────── commons (the backbone) ─────────────────────────
  { id: 'coin_pouch', name: 'Coin Pouch', desc: '+200 gold to spend now', rarity: 'common', icon: M.coins_icon, effect: { kind: 'gold', amount: 200 } },
  { id: 'looted_coins', name: 'Looted Coins', desc: '+275 gold scavenged from the fallen', rarity: 'common', icon: M.coins_icon, effect: { kind: 'gold', amount: 275 } },
  { id: 'tax_rebate', name: 'Tax Rebate', desc: '+150 gold back from the bank', rarity: 'common', icon: M.coins_icon, effect: { kind: 'gold', amount: 150 } },
  { id: 'essence_shard', name: 'Essence Shard', desc: '+12 Rune Essence (kept after the run)', rarity: 'common', icon: M.rune_essence_icon, effect: { kind: 'essence', amount: 12 } },
  { id: 'pure_essence', name: 'Pure Essence', desc: '+18 Rune Essence (kept after the run)', rarity: 'common', icon: M.essence_icon, effect: { kind: 'essence', amount: 18 } },
  { id: 'bandages', name: 'Bandages', desc: 'Patch the gate for +2 lives', rarity: 'common', icon: M.hp_icon, effect: { kind: 'life', amount: 2 } },
  { id: 'shark_supper', name: 'Shark Supper', desc: 'A hearty meal restores +3 lives', rarity: 'common', icon: M.hp_icon, effect: { kind: 'life', amount: 3 } },
  { id: 'whetstone', name: 'Whetstone', desc: '+6% damage for every tower, this run', rarity: 'common', icon: M.strength_icon, effect: { kind: 'damage', mult: DMG.common } },
  { id: 'attack_potion', name: 'Attack Potion', desc: '+6% damage for every tower, this run', rarity: 'common', icon: M.strength_icon, effect: { kind: 'damage', mult: DMG.common } },
  { id: 'spyglass', name: 'Spyglass', desc: '+3% range for every tower, this run', rarity: 'common', icon: M.ranged_icon, effect: { kind: 'range', mult: RNG.common } },
  { id: 'far_sight', name: 'Far Sight', desc: '+3% range for every tower, this run', rarity: 'common', icon: M.ranged_icon, effect: { kind: 'range', mult: RNG.common } },
  { id: 'swift_gloves', name: 'Swift Gloves', desc: '+3% attack speed for every tower, this run', rarity: 'common', icon: M.attack_icon, effect: { kind: 'fireRate', mult: SPD.common } },
  { id: 'oiled_gears', name: 'Oiled Gears', desc: '+3% attack speed for every tower, this run', rarity: 'common', icon: M.attack_icon, effect: { kind: 'fireRate', mult: SPD.common } },
  { id: 'prayer_drops', name: 'Prayer Drops', desc: '+6% damage for every tower, this run', rarity: 'common', icon: M.prayer_icon, effect: { kind: 'damage', mult: DMG.common } },
  { id: 'whittled_arrows', name: 'Whittled Arrows', desc: '+6% damage for every tower, this run', rarity: 'common', icon: M.skill_woodcutting, effect: { kind: 'damage', mult: DMG.common } },
  { id: 'mined_shot', name: 'Mined Shot', desc: '+275 gold from a rich ore vein', rarity: 'common', icon: M.skill_mining, effect: { kind: 'gold', amount: 275 } },
  { id: 'guam_tincture', name: 'Guam Tincture', desc: 'A weak brew mends +2 lives', rarity: 'common', icon: M.skill_herblore, effect: { kind: 'life', amount: 2 } },
  { id: 'apprentice_focus', name: 'Apprentice Focus', desc: '+6% damage for every tower, this run', rarity: 'common', icon: M.magic_icon, effect: { kind: 'damage', mult: DMG.common } },
  { id: 'sturdy_planks', name: 'Sturdy Planks', desc: 'Reinforce the gate: +1 max life', rarity: 'common', icon: M.skill_crafting, effect: { kind: 'maxLife', amount: 1 } },
  { id: 'fletched_quiver', name: 'Fletched Quiver', desc: '+3% range & +6% damage, this run', rarity: 'common', icon: M.ranged_icon,
    effect: { kind: 'multi', effects: [{ kind: 'range', mult: RNG.common }, { kind: 'damage', mult: DMG.common }] } },

  // ───────────────────────────── rares (mid power) ───────────────────────────
  { id: 'sharpened_blades', name: 'Sharpened Blades', desc: '+12% damage for every tower, this run', rarity: 'rare', icon: M.strength_icon, effect: { kind: 'damage', mult: DMG.rare } },
  { id: 'super_strength', name: 'Super Strength', desc: '+12% damage for every tower, this run', rarity: 'rare', icon: M.strength_icon, effect: { kind: 'damage', mult: DMG.rare } },
  { id: 'eagle_eyes', name: 'Eagle Eyes', desc: '+5% range for every tower, this run', rarity: 'rare', icon: M.ranged_icon, effect: { kind: 'range', mult: RNG.rare } },
  { id: 'hawk_eye', name: 'Hawk Eye', desc: '+5% range for every tower, this run', rarity: 'rare', icon: M.ranged_icon, effect: { kind: 'range', mult: RNG.rare } },
  { id: 'battle_cadence', name: 'Battle Cadence', desc: '+5% attack speed for every tower, this run', rarity: 'rare', icon: M.attack_icon, effect: { kind: 'fireRate', mult: SPD.rare } },
  { id: 'war_drums', name: 'War Drums', desc: '+5% attack speed for every tower, this run', rarity: 'rare', icon: M.attack_icon, effect: { kind: 'fireRate', mult: SPD.rare } },
  { id: 'fortify_gate', name: 'Fortify Gate', desc: '+1 max life (and heal 1)', rarity: 'rare', icon: M.hp_icon, effect: { kind: 'maxLife', amount: 1 } },
  { id: 'mystic_lore', name: 'Mystic Lore', desc: '+12% damage for every tower, this run', rarity: 'rare', icon: M.magic_icon, effect: { kind: 'damage', mult: DMG.rare } },
  { id: 'piety', name: 'Piety', desc: '+12% damage for every tower, this run', rarity: 'rare', icon: M.prayer_icon, effect: { kind: 'damage', mult: DMG.rare } },
  { id: 'slayer_contract', name: 'Slayer Contract', desc: '+450 gold bounty paid in full', rarity: 'rare', icon: M.slayer_crossbow, effect: { kind: 'gold', amount: 450 } },
  { id: 'essence_cache', name: 'Essence Cache', desc: '+28 Rune Essence (kept after the run)', rarity: 'rare', icon: M.rune_essence_icon, effect: { kind: 'essence', amount: 28 } },
  { id: 'ranarr_harvest', name: 'Ranarr Harvest', desc: 'A potent crop restores +4 lives', rarity: 'rare', icon: M.ranarr, effect: { kind: 'life', amount: 4 } },
  // — rare combos (two stats at common-tier steps each) —
  { id: 'rangers_kit', name: "Ranger's Kit", desc: '+5% range & +12% damage, this run', rarity: 'rare', icon: M.ranged_icon,
    effect: { kind: 'multi', effects: [{ kind: 'range', mult: RNG.rare }, { kind: 'damage', mult: DMG.common }] } },
  { id: 'duelists_stance', name: "Duelist's Stance", desc: '+5% attack speed & +12% damage, this run', rarity: 'rare', icon: M.attack_icon,
    effect: { kind: 'multi', effects: [{ kind: 'fireRate', mult: SPD.rare }, { kind: 'damage', mult: DMG.common }] } },
  { id: 'sentinels_watch', name: "Sentinel's Watch", desc: '+5% range & +3% attack speed, this run', rarity: 'rare', icon: M.ranged_icon,
    effect: { kind: 'multi', effects: [{ kind: 'range', mult: RNG.rare }, { kind: 'fireRate', mult: SPD.common }] } },
  { id: 'war_chest', name: 'War Chest', desc: '+300 gold & +6% damage, this run', rarity: 'rare', icon: M.coins_icon,
    effect: { kind: 'multi', effects: [{ kind: 'gold', amount: 300 }, { kind: 'damage', mult: DMG.common }] } },
  { id: 'field_medic', name: 'Field Medic', desc: '+2 lives & +1 max life', rarity: 'rare', icon: M.hp_icon,
    effect: { kind: 'multi', effects: [{ kind: 'life', amount: 2 }, { kind: 'maxLife', amount: 1 }] } },
  { id: 'arcane_study', name: 'Arcane Study', desc: '+18 Essence & +6% damage, this run', rarity: 'rare', icon: M.spellbook_standard,
    effect: { kind: 'multi', effects: [{ kind: 'essence', amount: 18 }, { kind: 'damage', mult: DMG.common }] } },

  // ───────────────────────────── epics (rare treats) ─────────────────────────
  { id: 'berserk', name: 'Berserk', desc: '+22% damage for every tower, this run', rarity: 'epic', icon: M.strength_icon, effect: { kind: 'damage', mult: DMG.epic } },
  { id: 'overload', name: 'Overload', desc: '+22% damage for every tower, this run', rarity: 'epic', icon: M.skill_herblore, effect: { kind: 'damage', mult: DMG.epic } },
  { id: 'farsight_scope', name: 'Farsight Scope', desc: '+8% range for every tower, this run', rarity: 'epic', icon: M.ranged_icon, effect: { kind: 'range', mult: RNG.epic } },
  { id: 'rapid_fire', name: 'Rapid Fire', desc: '+8% attack speed for every tower, this run', rarity: 'epic', icon: M.attack_icon, effect: { kind: 'fireRate', mult: SPD.epic } },
  { id: 'dragonstone_hoard', name: 'Dragonstone Hoard', desc: '+750 gold to spend now', rarity: 'epic', icon: M.coins_icon, effect: { kind: 'gold', amount: 750 } },
  { id: 'essence_motherlode', name: 'Essence Motherlode', desc: '+45 Rune Essence (kept after the run)', rarity: 'epic', icon: M.rune_essence_icon, effect: { kind: 'essence', amount: 45 } },
  { id: 'greater_fortify', name: 'Greater Fortify', desc: '+2 max life (and heal 2)', rarity: 'epic', icon: M.hp_icon, effect: { kind: 'maxLife', amount: 2 } },
  { id: 'second_wind', name: 'Second Wind', desc: 'Rally the gate for +5 lives', rarity: 'epic', icon: M.hp_icon, effect: { kind: 'life', amount: 5 } },
  // — epic combos (two/three stats at rare-tier steps) —
  { id: 'rigour', name: 'Rigour', desc: '+8% range & +12% damage, this run', rarity: 'epic', icon: M.prayer_icon,
    effect: { kind: 'multi', effects: [{ kind: 'range', mult: RNG.epic }, { kind: 'damage', mult: DMG.rare }] } },
  { id: 'augury', name: 'Augury', desc: '+8% attack speed & +12% damage, this run', rarity: 'epic', icon: M.magic_icon,
    effect: { kind: 'multi', effects: [{ kind: 'fireRate', mult: SPD.epic }, { kind: 'damage', mult: DMG.rare }] } },
  { id: 'twisted_bow', name: 'Twisted Bow', desc: '+5% range & +5% attack speed, this run', rarity: 'epic', icon: M.ranged_icon,
    effect: { kind: 'multi', effects: [{ kind: 'range', mult: RNG.rare }, { kind: 'fireRate', mult: SPD.rare }] } },
  { id: 'inquisitors_set', name: "Inquisitor's Set", desc: '+12% damage, +5% attack speed & +5% range, this run', rarity: 'epic', icon: M.strength_icon,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.rare }, { kind: 'fireRate', mult: SPD.rare }, { kind: 'range', mult: RNG.rare }] } },
  { id: 'ancients_pact', name: "Ancient's Pact", desc: '+12% damage & +30 Essence, this run', rarity: 'epic', icon: M.spellbook_ancient,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.rare }, { kind: 'essence', amount: 30 }] } },
  { id: 'kings_ransom', name: "King's Ransom", desc: '+500 gold & +12% damage, this run', rarity: 'epic', icon: M.coins_icon,
    effect: { kind: 'multi', effects: [{ kind: 'gold', amount: 500 }, { kind: 'damage', mult: DMG.rare }] } },
  { id: 'last_stand', name: 'Last Stand', desc: '+1 max life & +12% damage, this run', rarity: 'epic', icon: M.hp_icon,
    effect: { kind: 'multi', effects: [{ kind: 'maxLife', amount: 1 }, { kind: 'damage', mult: DMG.rare }] } },
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

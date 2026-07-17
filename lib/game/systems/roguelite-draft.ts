import { ASSETS, itemIcon } from '../assets';
import type { CombatStyle, MageMode } from '../types';

/**
 * Roguelite draft: the per-wave choice that defines the mode. After clearing a
 * wave in roguelite mode the engine rolls a small hand of {@link DraftCard}s and
 * the player keeps one, applying its {@link DraftEffect} to the run. This module
 * is pure (RNG injected) so the pool and the weighted roll are unit-testable; the
 * engine owns applying the chosen effect.
 *
 * Stat buffs are **per combat style** (melee / ranged / magic) — a Strength Potion
 * only helps melee towers, a Ranging Potion only ranged, etc. — modelled after the
 * in-game potion progression (Strength → Super Strength → Super Combat, then the
 * universal Overload as the general top tier). A buff with no `style` is "general"
 * and hits all three. Names/icons map to their OSRS equivalents.
 *
 * Balance note — `range`/`fireRate` multipliers are GAME-CHANGING (they reshape
 * coverage and DPS far more than flat damage), so their per-rarity steps are kept
 * deliberately *small* (see {@link RNG}/{@link SPD}). All `*Mult` effects fold into
 * the run's modifiers **multiplicatively**, so the curve compounds, not adds.
 */

/** Four tiers, ramping in power and dropping in draft frequency. */
export type DraftRarity = 'common' | 'uncommon' | 'rare' | 'ultra';

/** What keeping a card does. Instant effects grant a one-off resource; the
 *  `*Mult` effects fold into the engine's run modifiers and buff towers of the
 *  given `style` (or every tower when `style` is omitted = general). `multi`
 *  bundles several effects into one card. Add a kind here, handle it in the
 *  engine's `applyDraftEffectOne`, and add a card to {@link DRAFT_POOL}.
 *
 *  Beyond the numeric `*Mult` buffs, the **behavioural** kinds below change a
 *  *rule of the run* rather than a stat — they are what make the draft feel like
 *  a roguelite. They carry concrete params (not a multiplier) and each is wired
 *  to a dedicated engine hook (kill resolution / fire loop / wave clear):
 *
 *  On-kill chain reactions —
 *  - `ricochet`  : a kill arcs `frac` of the blow to the nearest enemy in `radius`.
 *  - `overkill`  : a kill's *excess* damage cleaves into the nearest enemy.
 *  - `soulSplit` : every `every`-th kill restores a life.
 *  - `killStreak`: every `every` kills, a shockwave hits ALL enemies for `damage`.
 *  Risk / reward curses —
 *  - `lastStand` : ×`mult` damage while at `belowLives` lives or fewer.
 *  - `berserker` : +`perMissingLife` damage for each life you've lost.
 *  - `bloodPact` : ×`mult` damage, but every wave cleared costs one life.
 *  - `greed`     : enemies get ×`hpMult` HP but pay ×`goldMult` gold.
 *  Tower transformations —
 *  - `doubleShot`: ranged towers loose a second shot at another enemy.
 *  - `venomTips` : every tower's hit also injects a venom DoT.
 *  - `chainFreeze`: a slow spreads to enemies within `radius`.
 *  - `pierce`    : projectiles punch through to the enemy behind.
 *  Placement synergies (per-tower damage from the field layout) —
 *  - `packTactics`: +`frac` damage per same-type tower in `radius` (cap `maxStacks`).
 *  - `trinity`   : ×`mult` damage when both *other* styles sit within `radius`.
 *  - `vanguard`  : ×`mult` damage for the tower nearest the portal.
 *  - `loneWolf`  : ×`mult` damage for a tower with no other tower in `radius`. */
export type DraftEffect =
  | { kind: 'slayerPoints'; amount: number }
  | { kind: 'essence'; amount: number }
  | { kind: 'life'; amount: number }
  | { kind: 'maxLife'; amount: number }
  | { kind: 'damage'; mult: number; style?: CombatStyle }
  | { kind: 'range'; mult: number; style?: CombatStyle }
  | { kind: 'fireRate'; mult: number; style?: CombatStyle }
  // ── on-kill chain reactions ──
  | { kind: 'ricochet'; frac: number; radius: number }
  | { kind: 'overkill'; radius: number }
  | { kind: 'soulSplit'; every: number }
  | { kind: 'killStreak'; every: number; damage: number }
  // ── risk / reward curses ──
  | { kind: 'lastStand'; belowLives: number; mult: number }
  | { kind: 'berserker'; perMissingLife: number }
  | { kind: 'bloodPact'; mult: number }
  | { kind: 'greed'; hpMult: number; goldMult: number }
  // ── tower transformations ──
  | { kind: 'doubleShot' }
  | { kind: 'venomTips'; dps: number; dur: number }
  | { kind: 'chainFreeze'; radius: number }
  | { kind: 'pierce'; radius: number }
  // ── placement synergies (per-tower damage, computed from the field layout) ──
  | { kind: 'packTactics'; frac: number; radius: number; maxStacks: number }
  | { kind: 'trinity'; mult: number; radius: number }
  | { kind: 'vanguard'; mult: number }
  | { kind: 'loneWolf'; mult: number; radius: number }
  // ── magic spellbook specialisations (buff only one wizard subtype) ──
  | { kind: 'mageBuff'; mode: MageMode; damage?: number; range?: number; fireRate?: number }
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
  /** Once-per-run cards (the build-defining behavioural effects): after a card
   *  is drafted it is dropped from the rest of the run's hands. Stat buffs are
   *  meant to stack, so they leave this unset. See {@link availableCards}. */
  unique?: boolean;
}

/** Selection weight per rarity — commons are the backbone, ultras rare treats. */
export const RARITY_WEIGHT: Record<DraftRarity, number> = {
  common: 100,
  uncommon: 50,
  rare: 22,
  ultra: 8,
};

/**
 * The weights a **boosted** hand rolls on: the boss reward once every relic is
 * already owned. Commons collapse and the top end opens up (ultra 8 → 45), so a
 * boosted hand is worth beating a boss for rather than being a bought roll with
 * extra steps. Same pool and same one-per-resource-group rule — only the odds move.
 */
export const BOOSTED_RARITY_WEIGHT: Record<DraftRarity, number> = {
  common: 20,
  uncommon: 40,
  rare: 55,
  ultra: 45,
};

/**
 * Buying a card roll: the price starts at {@link CARD_ROLL_BASE_COST} and multiplies
 * by {@link CARD_ROLL_COST_GROWTH} per roll already bought this run (50 → 75 → 113
 * → 169 → …). Geometric, not linear, so it keeps pace with an economy that also
 * compounds — a roll stays a real "cards or towers?" decision at wave 60 instead of
 * decaying into pocket change.
 */
export const CARD_ROLL_BASE_COST = 50;
export const CARD_ROLL_COST_GROWTH = 1.5;

/** Gold price of the next card roll, given how many were already bought this run. */
export function cardRollCost(rollsBought: number): number {
  const n = Math.max(0, Math.floor(rollsBought));
  return Math.round(CARD_ROLL_BASE_COST * Math.pow(CARD_ROLL_COST_GROWTH, n));
}

/**
 * Per-rarity multiplier steps. Damage may step harder; range & fire-rate are the
 * game-changers, so their steps stay small and compound multiplicatively. Combo
 * (`multi`) cards reuse a *lower* tier's step per stat, so a two-stat card is
 * roughly worth one single-stat card of its own rarity.
 */
// Steps are HALVED from their original power (per-style buffs were too strong and
// snowballed the run) — every bonus's delta is now half of what it was.
const DMG: Record<DraftRarity, number> = { common: 1.03, uncommon: 1.05, rare: 1.075, ultra: 1.11 };
const RNG: Record<DraftRarity, number> = { common: 1.015, uncommon: 1.02, rare: 1.03, ultra: 1.04 };
const SPD: Record<DraftRarity, number> = { common: 1.015, uncommon: 1.02, rare: 1.03, ultra: 1.04 };

/**
 * The draft pool. 50+ OSRS-flavoured cards across four rarities. Stat buffs are
 * per-style (melee/ranged/magic) and named after a real in-game item, whose own
 * sprite is the card art. Damage = potions, attack-speed/range = weapons, with a
 * universal potion as each stat's general (ultra) top tier; resources stay
 * general. Grow it by adding cards here (and, later, tower / prayer / debuff
 * kinds + their `applyDraftEffect` cases).
 */
export const DRAFT_POOL: readonly DraftCard[] = [
  // ───────────────────────── melee damage (potions) ───────────────────────
  { id: 'strength_potion', name: 'Strength Potion', desc: '+3% damage for melee towers, this run', rarity: 'common', icon: itemIcon('strength_potion'), effect: { kind: 'damage', mult: DMG.common, style: 'melee' } },
  { id: 'super_strength', name: 'Super Strength', desc: '+5% damage for melee towers, this run', rarity: 'uncommon', icon: itemIcon('super_strength'), effect: { kind: 'damage', mult: DMG.uncommon, style: 'melee' } },
  { id: 'super_combat', name: 'Super Combat Potion', desc: '+7.5% damage for melee towers, this run', rarity: 'rare', icon: itemIcon('super_combat_potion'), effect: { kind: 'damage', mult: DMG.rare, style: 'melee' } },
  // ──────────────────────── ranged damage (potions) ───────────────────────
  { id: 'ranging_potion', name: 'Ranging Potion', desc: '+3% damage for ranged towers, this run', rarity: 'common', icon: itemIcon('ranging_potion'), effect: { kind: 'damage', mult: DMG.common, style: 'ranged' } },
  { id: 'super_ranging', name: 'Divine Ranging Potion', desc: '+5% damage for ranged towers, this run', rarity: 'uncommon', icon: itemIcon('divine_ranging_potion'), effect: { kind: 'damage', mult: DMG.uncommon, style: 'ranged' } },
  { id: 'bastion_potion', name: 'Bastion Potion', desc: '+7.5% damage for ranged towers, this run', rarity: 'rare', icon: itemIcon('bastion_potion'), effect: { kind: 'damage', mult: DMG.rare, style: 'ranged' } },
  // ───────────────────────── magic damage (potions) ───────────────────────
  { id: 'magic_potion', name: 'Magic Potion', desc: '+3% damage for magic towers, this run', rarity: 'common', icon: itemIcon('magic_potion'), effect: { kind: 'damage', mult: DMG.common, style: 'magic' } },
  { id: 'imbued_heart', name: 'Imbued Heart', desc: '+5% damage for magic towers, this run', rarity: 'uncommon', icon: itemIcon('imbued_heart'), effect: { kind: 'damage', mult: DMG.uncommon, style: 'magic' } },
  { id: 'battlemage_potion', name: 'Battlemage Potion', desc: '+7.5% damage for magic towers, this run', rarity: 'rare', icon: itemIcon('battlemage_potion'), effect: { kind: 'damage', mult: DMG.rare, style: 'magic' } },
  // ──────────────────────── general damage (Overload) ─────────────────────
  { id: 'overload', name: 'Overload', desc: '+11% damage for ALL towers, this run', rarity: 'ultra', icon: itemIcon('overload_4'), effect: { kind: 'damage', mult: DMG.ultra } },

  // ───────────────────────── melee speed (weapons) ────────────────────────
  { id: 'rune_scimitar', name: 'Rune Scimitar', desc: '+1.5% attack speed for melee towers, this run', rarity: 'common', icon: itemIcon('rune_scimitar'), effect: { kind: 'fireRate', mult: SPD.common, style: 'melee' } },
  { id: 'dragon_scimitar', name: 'Dragon Scimitar', desc: '+2% attack speed for melee towers, this run', rarity: 'uncommon', icon: itemIcon('dragon_scimitar'), effect: { kind: 'fireRate', mult: SPD.uncommon, style: 'melee' } },
  { id: 'abyssal_whip', name: 'Abyssal Whip', desc: '+3% attack speed for melee towers, this run', rarity: 'rare', icon: itemIcon('abyssal_whip'), effect: { kind: 'fireRate', mult: SPD.rare, style: 'melee' } },
  // ──────────────────────── ranged speed (weapons) ────────────────────────
  { id: 'rapid_stance', name: 'Rune Knife', desc: '+1.5% attack speed for ranged towers, this run', rarity: 'common', icon: itemIcon('rune_knife'), effect: { kind: 'fireRate', mult: SPD.common, style: 'ranged' } },
  { id: 'magic_shortbow', name: 'Magic Shortbow', desc: '+2% attack speed for ranged towers, this run', rarity: 'uncommon', icon: itemIcon('magic_shortbow'), effect: { kind: 'fireRate', mult: SPD.uncommon, style: 'ranged' } },
  { id: 'dragon_darts', name: 'Dragon Darts', desc: '+3% attack speed for ranged towers, this run', rarity: 'rare', icon: itemIcon('dragon_dart'), effect: { kind: 'fireRate', mult: SPD.rare, style: 'ranged' } },
  // ───────────────────────── magic speed (weapons) ────────────────────────
  { id: 'swift_glyphs', name: 'Kodai Wand', desc: '+1.5% attack speed for magic towers, this run', rarity: 'common', icon: itemIcon('kodai_wand'), effect: { kind: 'fireRate', mult: SPD.common, style: 'magic' } },
  { id: 'trident_seas', name: 'Trident of the Seas', desc: '+2% attack speed for magic towers, this run', rarity: 'uncommon', icon: itemIcon('trident_of_the_seas'), effect: { kind: 'fireRate', mult: SPD.uncommon, style: 'magic' } },
  { id: 'harmonised_staff', name: 'Harmonised Staff', desc: '+3% attack speed for magic towers, this run', rarity: 'rare', icon: itemIcon('harmonised_nightmare_staff'), effect: { kind: 'fireRate', mult: SPD.rare, style: 'magic' } },
  // ──────────────────── general speed (Stamina, top tier) ──────────────────
  { id: 'war_tempo', name: 'Stamina Potion', desc: '+4% attack speed for ALL towers, this run', rarity: 'ultra', icon: itemIcon('stamina_potion'), effect: { kind: 'fireRate', mult: SPD.ultra } },

  // ───────────────────────── melee range (halberds) ───────────────────────
  { id: 'halberd', name: 'Rune Halberd', desc: '+1.5% range for melee towers, this run', rarity: 'common', icon: itemIcon('rune_halberd'), effect: { kind: 'range', mult: RNG.common, style: 'melee' } },
  { id: 'dragon_halberd', name: 'Dragon Halberd', desc: '+2% range for melee towers, this run', rarity: 'uncommon', icon: itemIcon('dragon_halberd'), effect: { kind: 'range', mult: RNG.uncommon, style: 'melee' } },
  { id: 'noxious_halberd', name: 'Noxious Halberd', desc: '+3% range for melee towers, this run', rarity: 'rare', icon: itemIcon('noxious_halberd'), effect: { kind: 'range', mult: RNG.rare, style: 'melee' } },
  // ─────────────────────────── ranged range (bows) ────────────────────────
  { id: 'longrange_stance', name: 'Magic Longbow', desc: '+1.5% range for ranged towers, this run', rarity: 'common', icon: itemIcon('magic_longbow'), effect: { kind: 'range', mult: RNG.common, style: 'ranged' } },
  { id: 'eagle_eye', name: 'Dark Bow', desc: '+2% range for ranged towers, this run', rarity: 'uncommon', icon: itemIcon('dark_bow'), effect: { kind: 'range', mult: RNG.uncommon, style: 'ranged' } },
  { id: 'twisted_bow', name: 'Twisted Bow', desc: '+3% range for ranged towers, this run', rarity: 'rare', icon: itemIcon('twisted_bow'), effect: { kind: 'range', mult: RNG.rare, style: 'ranged' } },
  // ────────────────────────── magic range (staves) ────────────────────────
  { id: 'iban_staff', name: "Iban's Staff", desc: '+1.5% range for magic towers, this run', rarity: 'common', icon: itemIcon('ibans_staff'), effect: { kind: 'range', mult: RNG.common, style: 'magic' } },
  { id: 'ahrims_staff', name: "Ahrim's Staff", desc: '+2% range for magic towers, this run', rarity: 'uncommon', icon: itemIcon('ahrims_staff'), effect: { kind: 'range', mult: RNG.uncommon, style: 'magic' } },
  { id: 'nightmare_staff', name: 'Nightmare Staff', desc: '+3% range for magic towers, this run', rarity: 'rare', icon: itemIcon('nightmare_staff'), effect: { kind: 'range', mult: RNG.rare, style: 'magic' } },
  // ──────────────────── general range (Hunter, top tier) ───────────────────
  { id: 'far_sight', name: 'Hunter Potion', desc: '+4% range for ALL towers, this run', rarity: 'ultra', icon: itemIcon('hunter_potion'), effect: { kind: 'range', mult: RNG.ultra } },

  // ─────────────────────────── resources (general) ────────────────────────
  // Slayer points, not gold. A pile of gold is the least interesting thing a hand
  // can offer: it buys the same towers you were already going to buy, so the card
  // is a stat buff with a delay. Points are spent on the Slayer rewards shop —
  // helm, Bigger and Badder, block/extend/skip — where each purchase changes how
  // the run plays, so a resource card is a real pick again.
  //
  // ⚠ SIZING THESE: the amounts look mean on purpose. The Essence Sack converts
  // points to Rune Essence at a fixed 2.4:1, so a points card is ALSO an essence
  // card at 2.4× its face value — a "+10 points" card would quietly hand over 24
  // essence and undo the very reward-rarity it sits next to. The ceiling on a
  // points card is therefore set by the essence cards below, not by the Slayer
  // shop's prices. Raise these only alongside SLAYER_ESSENCE_SACK_YIELD.
  { id: 'enchanted_gem', name: 'Enchanted Gem', desc: '+2 Slayer points', rarity: 'common', icon: itemIcon('enchanted_gem'), effect: { kind: 'slayerPoints', amount: 2 } },
  { id: 'slayer_ring', name: 'Slayer Ring', desc: '+3 Slayer points', rarity: 'uncommon', icon: itemIcon('slayer_ring'), effect: { kind: 'slayerPoints', amount: 3 } },
  { id: 'bracelet_of_slaughter', name: 'Bracelet of Slaughter', desc: '+4 Slayer points', rarity: 'rare', icon: itemIcon('bracelet_of_slaughter'), effect: { kind: 'slayerPoints', amount: 4 } },
  { id: 'eternal_gem', name: 'Eternal Gem', desc: '+6 Slayer points', rarity: 'ultra', icon: itemIcon('eternal_gem'), effect: { kind: 'slayerPoints', amount: 6 } },
  // Rune Essence is META currency — it outlives the run and buys permanent power,
  // so a run that hands it out freely is a run that pays you to lose. Every essence
  // card is rare or better, and worth roughly 40% of what it used to be.
  { id: 'essence_shard', name: 'Rune Essence', desc: '+5 Rune Essence (kept after the run)', rarity: 'rare', icon: itemIcon('rune_essence'), effect: { kind: 'essence', amount: 5 } },
  { id: 'gilded_altar', name: 'Blessed Bone Shards', desc: '+8 Rune Essence (kept after the run)', rarity: 'rare', icon: itemIcon('blessed_bone_shards'), effect: { kind: 'essence', amount: 8 } },
  { id: 'essence_cache', name: 'Pure Essence', desc: '+10 Rune Essence (kept after the run)', rarity: 'rare', icon: itemIcon('pure_essence'), effect: { kind: 'essence', amount: 10 } },
  { id: 'essence_motherlode', name: 'Daeyalt Essence', desc: '+15 Rune Essence (kept after the run)', rarity: 'ultra', icon: itemIcon('daeyalt_essence'), effect: { kind: 'essence', amount: 15 } },
  { id: 'bandages', name: 'Bandages', desc: 'Patch the gate for +2 lives', rarity: 'common', icon: itemIcon('bandages'), effect: { kind: 'life', amount: 2 } },
  { id: 'shark_supper', name: 'Shark', desc: 'A hearty meal restores +3 lives', rarity: 'uncommon', icon: itemIcon('shark'), effect: { kind: 'life', amount: 3 } },
  { id: 'saradomin_brew', name: 'Saradomin Brew', desc: 'A blessed brew restores +4 lives', rarity: 'rare', icon: itemIcon('saradomin_brew'), effect: { kind: 'life', amount: 4 } },
  { id: 'fortify_gate', name: 'Rune Kiteshield', desc: '+1 max life (and heal 1)', rarity: 'rare', icon: itemIcon('rune_kiteshield'), effect: { kind: 'maxLife', amount: 1 } },
  { id: 'greater_fortify', name: 'Dragon Kiteshield', desc: '+2 max life (and heal 2)', rarity: 'ultra', icon: itemIcon('dragon_kiteshield'), effect: { kind: 'maxLife', amount: 2 } },
  { id: 'anglerfish', name: 'Anglerfish', desc: 'An overheal restores +3 lives', rarity: 'uncommon', icon: itemIcon('anglerfish'), effect: { kind: 'life', amount: 3 } },

  // ───────────────────────────── combo cards ──────────────────────────────
  { id: 'berserker_ring', name: 'Berserker Ring', desc: '+3% damage & +1.5% attack speed for melee, this run', rarity: 'uncommon', icon: itemIcon('berserker_ring'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'melee' }, { kind: 'fireRate', mult: SPD.common, style: 'melee' }] } },
  { id: 'pegasian_boots', name: 'Pegasian Boots', desc: '+1.5% range & +1.5% attack speed for ranged, this run', rarity: 'uncommon', icon: itemIcon('pegasian_boots'),
    effect: { kind: 'multi', effects: [{ kind: 'range', mult: RNG.common, style: 'ranged' }, { kind: 'fireRate', mult: SPD.common, style: 'ranged' }] } },
  { id: 'slayer_helmet', name: 'Slayer Helmet', desc: '+3% melee damage & +2 Slayer points', rarity: 'uncommon', icon: itemIcon('slayer_helmet'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'melee' }, { kind: 'slayerPoints', amount: 2 }] } },
  { id: 'rangers_kit', name: 'Ranger Boots', desc: '+5% damage & +2% range for ranged, this run', rarity: 'rare', icon: itemIcon('ranger_boots'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'ranged' }, { kind: 'range', mult: RNG.uncommon, style: 'ranged' }] } },
  { id: 'occult_necklace', name: 'Occult Necklace', desc: '+5% damage & +2% attack speed for magic, this run', rarity: 'rare', icon: itemIcon('occult_necklace'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'magic' }, { kind: 'fireRate', mult: SPD.uncommon, style: 'magic' }] } },
  { id: 'void_knight', name: 'Void Knight', desc: '+3% damage & +1.5% attack speed for ALL towers, this run', rarity: 'rare', icon: itemIcon('void_knight_top'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common }, { kind: 'fireRate', mult: SPD.common }] } },
  { id: 'inquisitors_set', name: "Inquisitor's Set", desc: '+7.5% damage, +3% attack speed & +3% range for melee, this run', rarity: 'ultra', icon: itemIcon('inquisitors_great_helm'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.rare, style: 'melee' }, { kind: 'fireRate', mult: SPD.rare, style: 'melee' }, { kind: 'range', mult: RNG.rare, style: 'melee' }] } },
  { id: 'elite_void', name: 'Elite Void', desc: '+5% damage, +2% range & +2% attack speed for ALL, this run', rarity: 'ultra', icon: itemIcon('elite_void_top'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon }, { kind: 'range', mult: RNG.uncommon }, { kind: 'fireRate', mult: SPD.uncommon }] } },
  { id: 'dragon_boots', name: 'Dragon Boots', desc: '+3% damage & +1.5% range for melee, this run', rarity: 'uncommon', icon: itemIcon('dragon_boots'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'melee' }, { kind: 'range', mult: RNG.common, style: 'melee' }] } },
  { id: 'archers_ring', name: 'Archers Ring', desc: '+3% damage & +1.5% range for ranged, this run', rarity: 'uncommon', icon: itemIcon('archers_ring'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'ranged' }, { kind: 'range', mult: RNG.common, style: 'ranged' }] } },
  { id: 'seers_ring', name: 'Seers Ring', desc: '+3% damage & +1.5% range for magic, this run', rarity: 'uncommon', icon: itemIcon('seers_ring'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'magic' }, { kind: 'range', mult: RNG.common, style: 'magic' }] } },
  { id: 'fire_cape', name: 'Fire Cape', desc: '+5% damage & +2% range for melee, this run', rarity: 'rare', icon: itemIcon('fire_cape'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'melee' }, { kind: 'range', mult: RNG.uncommon, style: 'melee' }] } },
  { id: 'avas_assembler', name: "Ava's Assembler", desc: '+5% damage & +2% attack speed for ranged, this run', rarity: 'rare', icon: itemIcon('avas_assembler'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'ranged' }, { kind: 'fireRate', mult: SPD.uncommon, style: 'ranged' }] } },
  { id: 'eternal_boots', name: 'Eternal Boots', desc: '+5% damage & +2% attack speed for magic, this run', rarity: 'rare', icon: itemIcon('eternal_boots'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'magic' }, { kind: 'fireRate', mult: SPD.uncommon, style: 'magic' }] } },
  { id: 'amulet_of_fury', name: 'Amulet of Fury', desc: '+3% damage & +1.5% attack speed for ALL towers, this run', rarity: 'rare', icon: itemIcon('amulet_of_fury'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common }, { kind: 'fireRate', mult: SPD.common }] } },
  { id: 'masori_set', name: 'Masori Armour', desc: '+7.5% damage, +3% range & +3% attack speed for ranged, this run', rarity: 'ultra', icon: itemIcon('masori_body'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.rare, style: 'ranged' }, { kind: 'range', mult: RNG.rare, style: 'ranged' }, { kind: 'fireRate', mult: SPD.rare, style: 'ranged' }] } },
  { id: 'ancestral_set', name: 'Ancestral Robes', desc: '+7.5% damage, +3% range & +3% attack speed for magic, this run', rarity: 'ultra', icon: itemIcon('ancestral_robe_top'),
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.rare, style: 'magic' }, { kind: 'range', mult: RNG.rare, style: 'magic' }, { kind: 'fireRate', mult: SPD.rare, style: 'magic' }] } },

  // ═══════════════ behavioural cards — change a RULE, not a stat ════════════
  // Build-defining one-offs: all rare/ultra and `unique` (drafted once per run,
  // then removed from the pool — they set a flag, so a repeat would be dead weight).
  // ── on-kill chain reactions ──────────────────────────────────────────────
  { id: 'dragon_claws', name: 'Dragon Claws', desc: 'On a kill, the strike rends the nearest enemy for 50% of the blow', rarity: 'rare', unique: true, icon: itemIcon('dragon_claws'), effect: { kind: 'ricochet', frac: 0.5, radius: 95 } },
  { id: 'scythe_of_vitur', name: 'Scythe of Vitur', desc: 'A kill’s excess damage cleaves into the nearest enemy', rarity: 'ultra', unique: true, icon: itemIcon('scythe_of_vitur'), effect: { kind: 'overkill', radius: 95 } },
  { id: 'soul_split', name: 'Soul Split', desc: 'Every 8th kill restores 1 life', rarity: 'rare', unique: true, icon: itemIcon('soul_rune'), effect: { kind: 'soulSplit', every: 8 } },
  { id: 'dragon_warhammer', name: 'Dragon Warhammer', desc: 'Every 20 kills, a shockwave smashes ALL enemies for 40', rarity: 'ultra', unique: true, icon: itemIcon('dragon_warhammer'), effect: { kind: 'killStreak', every: 20, damage: 40 } },
  // ── risk / reward curses ─────────────────────────────────────────────────
  { id: 'phoenix_necklace', name: 'Phoenix Necklace', desc: 'While at 2 lives or fewer, ALL towers deal double damage', rarity: 'rare', unique: true, icon: itemIcon('phoenix_necklace'), effect: { kind: 'lastStand', belowLives: 2, mult: 2 } },
  { id: 'berserker_brew', name: 'Berserker Necklace', desc: '+12% damage for every life you have lost', rarity: 'rare', unique: true, icon: itemIcon('berserker_necklace'), effect: { kind: 'berserker', perMissingLife: 0.12 } },
  { id: 'blood_pact', name: 'Blood Pact', desc: '+40% damage to ALL towers, but each wave cleared costs 1 life', rarity: 'rare', unique: true, icon: itemIcon('blood_shard'), effect: { kind: 'bloodPact', mult: 1.4 } },
  { id: 'greedy_pact', name: 'Greedy Pact', desc: 'Enemies have +50% HP, but drop double gold', rarity: 'rare', unique: true, icon: itemIcon('zenyte'), effect: { kind: 'greed', hpMult: 1.5, goldMult: 2 } },
  // ── tower transformations ────────────────────────────────────────────────
  { id: 'dragon_knife', name: 'Dragon Knife', desc: 'Ranged towers loose a second shot at another enemy in range', rarity: 'rare', unique: true, icon: itemIcon('dragon_knife'), effect: { kind: 'doubleShot' } },
  { id: 'toxic_blowpipe', name: 'Toxic Blowpipe', desc: 'Every tower’s hit also injects venom', rarity: 'rare', unique: true, icon: itemIcon('toxic_blowpipe'), effect: { kind: 'venomTips', dps: 6, dur: 4 } },
  { id: 'ice_barrage_card', name: 'Ice Barrage', desc: 'Any slow now spreads to nearby enemies', rarity: 'rare', unique: true, icon: ASSETS.spells['Ice_Barrage'], effect: { kind: 'chainFreeze', radius: 75 } },
  { id: 'heavy_ballista', name: 'Heavy Ballista', desc: 'Projectiles punch through to strike the enemy behind', rarity: 'rare', unique: true, icon: itemIcon('heavy_ballista'), effect: { kind: 'pierce', radius: 70 } },
  // ── placement synergies (reward HOW you position, not just what you pick) ──
  { id: 'clan_vexillum', name: 'Clan Vexillum', desc: 'Each tower gains +8% damage per nearby tower of the same kind (max +40%)', rarity: 'ultra', unique: true, icon: itemIcon('clan_vexillum'), effect: { kind: 'packTactics', frac: 0.08, radius: 96, maxStacks: 5 } },
  { id: 'combat_triangle', name: 'Combat Triangle', desc: 'A tower flanked by both other combat styles deals +30% damage', rarity: 'ultra', unique: true, icon: ASSETS.misc.multicombat_icon, effect: { kind: 'trinity', mult: 1.3, radius: 96 } },
  { id: 'dinhs_bulwark', name: "Dinh's Bulwark", desc: 'Your frontmost tower (nearest the portal) deals +60% damage', rarity: 'ultra', unique: true, icon: itemIcon('dinhs_bulwark'), effect: { kind: 'vanguard', mult: 1.6 } },
  { id: 'lone_wolf', name: 'Lone Wolf', desc: 'A tower with no other tower nearby deals +50% damage', rarity: 'ultra', unique: true, icon: itemIcon('wolf_mask'), effect: { kind: 'loneWolf', mult: 1.5, radius: 96 } },
  // ── magic spellbook specialisations — buff ONE wizard subtype only ──
  { id: 'tome_of_fire', name: 'Tome of Fire', desc: 'Elemental wizards: +25% damage and +10% attack speed', rarity: 'ultra', unique: true, icon: itemIcon('tome_of_fire'), effect: { kind: 'mageBuff', mode: 'elemental', damage: 1.25, fireRate: 1.1 } },
  { id: 'ancient_sceptre', name: 'Ancient Sceptre', desc: 'Ancient wizards: +20% damage and +15% range', rarity: 'ultra', unique: true, icon: itemIcon('ancient_sceptre'), effect: { kind: 'mageBuff', mode: 'ancients', damage: 1.2, range: 1.15 } },
  { id: 'lunar_staff', name: 'Lunar Staff', desc: 'Utility wizards: +25% support range and +15% damage', rarity: 'ultra', unique: true, icon: itemIcon('lunar_staff'), effect: { kind: 'mageBuff', mode: 'utility', range: 1.25, damage: 1.15 } },
];

/** Cards still eligible to roll: drops any `unique` card already taken this run
 *  (so a build-defining behavioural effect can't reappear). Stat buffs lack the
 *  flag and always remain draftable. */
export function availableCards(
  takenUniqueIds: ReadonlySet<string>,
  pool: readonly DraftCard[] = DRAFT_POOL,
): DraftCard[] {
  return pool.filter(c => !(c.unique && takenUniqueIds.has(c.id)));
}

/**
 * Resource-reward group of a *pure* resource card (one whose whole effect is a
 * single resource grant), or null for anything else (stat buffs, behavioural
 * cards, `multi` bundles). Used to keep a hand from offering two interchangeable
 * "numbers go up" rewards — choosing between 5 and 10 essence is no choice at
 * all. `currency` = Slayer points/essence, `lives` = current/max life.
 *
 * Slayer points share the `currency` group with essence rather than getting their
 * own: the Essence Sack converts one into the other, so a hand offering both would
 * be offering the same reward at two exchange rates.
 */
function resourceGroup(card: DraftCard): 'currency' | 'lives' | null {
  switch (card.effect.kind) {
    case 'slayerPoints': case 'essence': return 'currency';
    case 'life': case 'maxLife': return 'lives';
    default: return null;
  }
}

/**
 * Roll a hand of `count` distinct cards, weighted by rarity, without
 * replacement. `rng` is injected (`Math.random` in the engine) so the roll is
 * deterministic under test. Never returns more than the pool holds.
 *
 * A hand carries **at most one card per resource group** ({@link resourceGroup}):
 * two pure-currency (or two pure-life) cards are a false choice, so once one is
 * drawn the rest of that group is skipped — unless the pool has nothing else
 * left to offer (then the guard relaxes so the hand still fills).
 *
 * `weights` swaps the rarity odds: {@link BOOSTED_RARITY_WEIGHT} for a boss's
 * boosted hand, the default {@link RARITY_WEIGHT} otherwise.
 */
export function rollDraft(
  rng: () => number,
  count = 3,
  pool: readonly DraftCard[] = DRAFT_POOL,
  weights: Record<DraftRarity, number> = RARITY_WEIGHT,
): DraftCard[] {
  const remaining = [...pool];
  const hand: DraftCard[] = [];
  const usedGroups = new Set<'currency' | 'lives'>();
  const n = Math.min(count, remaining.length);
  for (let i = 0; i < n; i++) {
    // Prefer cards whose resource group isn't already represented; fall back to
    // the full remaining pool only if that leaves nothing to draw.
    const eligible = remaining.filter(c => { const g = resourceGroup(c); return !g || !usedGroups.has(g); });
    const pickFrom = eligible.length ? eligible : remaining;
    const total = pickFrom.reduce((s, c) => s + weights[c.rarity], 0);
    let roll = rng() * total;
    let idx = 0;
    for (let j = 0; j < pickFrom.length; j++) {
      roll -= weights[pickFrom[j].rarity];
      if (roll < 0) { idx = j; break; }
      idx = j;
    }
    const card = pickFrom[idx];
    const g = resourceGroup(card);
    if (g) usedGroups.add(g);
    hand.push(card);
    remaining.splice(remaining.indexOf(card), 1);
  }
  return hand;
}

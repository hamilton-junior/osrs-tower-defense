import { ASSETS } from '../assets';
import type { CombatStyle } from '../types';

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
 *  The "battlefield" kinds are run-wide and play differently from the per-style
 *  tower stats above — they enable distinct archetypes:
 *  - `bounty`  : +flat gold on every kill (an economy build).
 *  - `vuln`    : enemies take ×mult damage from ALL towers (a universal offence
 *               that stacks with, and is style-agnostic unlike, `damage`).
 *  - `chill`   : enemies move ×mult speed for the whole run (≤1 = slower; tempo /
 *               crowd-control, keeping them in range longer). */
export type DraftEffect =
  | { kind: 'gold'; amount: number }
  | { kind: 'essence'; amount: number }
  | { kind: 'life'; amount: number }
  | { kind: 'maxLife'; amount: number }
  | { kind: 'damage'; mult: number; style?: CombatStyle }
  | { kind: 'range'; mult: number; style?: CombatStyle }
  | { kind: 'fireRate'; mult: number; style?: CombatStyle }
  | { kind: 'bounty'; amount: number }
  | { kind: 'vuln'; mult: number }
  | { kind: 'chill'; mult: number }
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

/** Selection weight per rarity — commons are the backbone, ultras rare treats. */
export const RARITY_WEIGHT: Record<DraftRarity, number> = {
  common: 100,
  uncommon: 50,
  rare: 22,
  ultra: 8,
};

/** Wiki image base — every card art is the real in-game item matching its name
 *  (hot-linked, same host the rest of the app uses; broken loads degrade away). */
const W = ASSETS.misc.wiki_base;

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
// Battlefield steps. `vuln` is a UNIVERSAL damage amp (every tower, every style),
// so its steps sit a touch below the general-damage tier to avoid eclipsing the
// per-style cards. `chill` is a move-speed multiplier (≤1 = slower); small steps,
// since keeping enemies in range longer compounds with every tower's uptime.
const VULN: Record<DraftRarity, number> = { common: 1.02, uncommon: 1.03, rare: 1.04, ultra: 1.06 };
const CHILL: Record<DraftRarity, number> = { common: 0.98, uncommon: 0.965, rare: 0.95, ultra: 0.93 };

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
  { id: 'strength_potion', name: 'Strength Potion', desc: '+3% damage for melee towers, this run', rarity: 'common', icon: `${W}Strength_potion%284%29.png`, effect: { kind: 'damage', mult: DMG.common, style: 'melee' } },
  { id: 'super_strength', name: 'Super Strength', desc: '+5% damage for melee towers, this run', rarity: 'uncommon', icon: `${W}Super_strength%284%29.png`, effect: { kind: 'damage', mult: DMG.uncommon, style: 'melee' } },
  { id: 'super_combat', name: 'Super Combat Potion', desc: '+7.5% damage for melee towers, this run', rarity: 'rare', icon: `${W}Super_combat_potion%284%29.png`, effect: { kind: 'damage', mult: DMG.rare, style: 'melee' } },
  // ──────────────────────── ranged damage (potions) ───────────────────────
  { id: 'ranging_potion', name: 'Ranging Potion', desc: '+3% damage for ranged towers, this run', rarity: 'common', icon: `${W}Ranging_potion%284%29.png`, effect: { kind: 'damage', mult: DMG.common, style: 'ranged' } },
  { id: 'super_ranging', name: 'Divine Ranging Potion', desc: '+5% damage for ranged towers, this run', rarity: 'uncommon', icon: `${W}Divine_ranging_potion%284%29.png`, effect: { kind: 'damage', mult: DMG.uncommon, style: 'ranged' } },
  { id: 'bastion_potion', name: 'Bastion Potion', desc: '+7.5% damage for ranged towers, this run', rarity: 'rare', icon: `${W}Bastion_potion%284%29.png`, effect: { kind: 'damage', mult: DMG.rare, style: 'ranged' } },
  // ───────────────────────── magic damage (potions) ───────────────────────
  { id: 'magic_potion', name: 'Magic Potion', desc: '+3% damage for magic towers, this run', rarity: 'common', icon: `${W}Magic_potion%284%29.png`, effect: { kind: 'damage', mult: DMG.common, style: 'magic' } },
  { id: 'imbued_heart', name: 'Imbued Heart', desc: '+5% damage for magic towers, this run', rarity: 'uncommon', icon: `${W}Imbued_heart.png`, effect: { kind: 'damage', mult: DMG.uncommon, style: 'magic' } },
  { id: 'battlemage_potion', name: 'Battlemage Potion', desc: '+7.5% damage for magic towers, this run', rarity: 'rare', icon: `${W}Battlemage_potion%284%29.png`, effect: { kind: 'damage', mult: DMG.rare, style: 'magic' } },
  // ──────────────────────── general damage (Overload) ─────────────────────
  { id: 'overload', name: 'Overload', desc: '+11% damage for ALL towers, this run', rarity: 'ultra', icon: `${W}Overload_%284%29.png`, effect: { kind: 'damage', mult: DMG.ultra } },

  // ───────────────────────── melee speed (weapons) ────────────────────────
  { id: 'rune_scimitar', name: 'Rune Scimitar', desc: '+1.5% attack speed for melee towers, this run', rarity: 'common', icon: `${W}Rune_scimitar.png`, effect: { kind: 'fireRate', mult: SPD.common, style: 'melee' } },
  { id: 'dragon_scimitar', name: 'Dragon Scimitar', desc: '+2% attack speed for melee towers, this run', rarity: 'uncommon', icon: `${W}Dragon_scimitar.png`, effect: { kind: 'fireRate', mult: SPD.uncommon, style: 'melee' } },
  { id: 'abyssal_whip', name: 'Abyssal Whip', desc: '+3% attack speed for melee towers, this run', rarity: 'rare', icon: `${W}Abyssal_whip.png`, effect: { kind: 'fireRate', mult: SPD.rare, style: 'melee' } },
  // ──────────────────────── ranged speed (weapons) ────────────────────────
  { id: 'rapid_stance', name: 'Rune Knife', desc: '+1.5% attack speed for ranged towers, this run', rarity: 'common', icon: `${W}Rune_knife.png`, effect: { kind: 'fireRate', mult: SPD.common, style: 'ranged' } },
  { id: 'magic_shortbow', name: 'Magic Shortbow', desc: '+2% attack speed for ranged towers, this run', rarity: 'uncommon', icon: `${W}Magic_shortbow.png`, effect: { kind: 'fireRate', mult: SPD.uncommon, style: 'ranged' } },
  { id: 'dragon_darts', name: 'Dragon Darts', desc: '+3% attack speed for ranged towers, this run', rarity: 'rare', icon: `${W}Dragon_dart.png`, effect: { kind: 'fireRate', mult: SPD.rare, style: 'ranged' } },
  // ───────────────────────── magic speed (weapons) ────────────────────────
  { id: 'swift_glyphs', name: 'Kodai Wand', desc: '+1.5% attack speed for magic towers, this run', rarity: 'common', icon: `${W}Kodai_wand.png`, effect: { kind: 'fireRate', mult: SPD.common, style: 'magic' } },
  { id: 'trident_seas', name: 'Trident of the Seas', desc: '+2% attack speed for magic towers, this run', rarity: 'uncommon', icon: `${W}Trident_of_the_seas.png`, effect: { kind: 'fireRate', mult: SPD.uncommon, style: 'magic' } },
  { id: 'harmonised_staff', name: 'Harmonised Staff', desc: '+3% attack speed for magic towers, this run', rarity: 'rare', icon: `${W}Harmonised_nightmare_staff.png`, effect: { kind: 'fireRate', mult: SPD.rare, style: 'magic' } },
  // ──────────────────── general speed (Stamina, top tier) ──────────────────
  { id: 'war_tempo', name: 'Stamina Potion', desc: '+4% attack speed for ALL towers, this run', rarity: 'ultra', icon: `${W}Stamina_potion%284%29.png`, effect: { kind: 'fireRate', mult: SPD.ultra } },

  // ───────────────────────── melee range (halberds) ───────────────────────
  { id: 'halberd', name: 'Rune Halberd', desc: '+1.5% range for melee towers, this run', rarity: 'common', icon: `${W}Rune_halberd.png`, effect: { kind: 'range', mult: RNG.common, style: 'melee' } },
  { id: 'dragon_halberd', name: 'Dragon Halberd', desc: '+2% range for melee towers, this run', rarity: 'uncommon', icon: `${W}Dragon_halberd.png`, effect: { kind: 'range', mult: RNG.uncommon, style: 'melee' } },
  { id: 'noxious_halberd', name: 'Noxious Halberd', desc: '+3% range for melee towers, this run', rarity: 'rare', icon: `${W}Noxious_halberd.png`, effect: { kind: 'range', mult: RNG.rare, style: 'melee' } },
  // ─────────────────────────── ranged range (bows) ────────────────────────
  { id: 'longrange_stance', name: 'Magic Longbow', desc: '+1.5% range for ranged towers, this run', rarity: 'common', icon: `${W}Magic_longbow.png`, effect: { kind: 'range', mult: RNG.common, style: 'ranged' } },
  { id: 'eagle_eye', name: 'Dark Bow', desc: '+2% range for ranged towers, this run', rarity: 'uncommon', icon: `${W}Dark_bow.png`, effect: { kind: 'range', mult: RNG.uncommon, style: 'ranged' } },
  { id: 'twisted_bow', name: 'Twisted Bow', desc: '+3% range for ranged towers, this run', rarity: 'rare', icon: `${W}Twisted_bow.png`, effect: { kind: 'range', mult: RNG.rare, style: 'ranged' } },
  // ────────────────────────── magic range (staves) ────────────────────────
  { id: 'iban_staff', name: "Iban's Staff", desc: '+1.5% range for magic towers, this run', rarity: 'common', icon: `${W}Iban%27s_staff.png`, effect: { kind: 'range', mult: RNG.common, style: 'magic' } },
  { id: 'ahrims_staff', name: "Ahrim's Staff", desc: '+2% range for magic towers, this run', rarity: 'uncommon', icon: `${W}Ahrim%27s_staff.png`, effect: { kind: 'range', mult: RNG.uncommon, style: 'magic' } },
  { id: 'nightmare_staff', name: 'Nightmare Staff', desc: '+3% range for magic towers, this run', rarity: 'rare', icon: `${W}Nightmare_staff.png`, effect: { kind: 'range', mult: RNG.rare, style: 'magic' } },
  // ──────────────────── general range (Hunter, top tier) ───────────────────
  { id: 'far_sight', name: 'Hunter Potion', desc: '+4% range for ALL towers, this run', rarity: 'ultra', icon: `${W}Hunter_potion%284%29.png`, effect: { kind: 'range', mult: RNG.ultra } },

  // ─────────────────────────── resources (general) ────────────────────────
  { id: 'coin_pouch', name: 'Coin Pouch', desc: '+100 gold to spend now', rarity: 'common', icon: `${W}Coins_detail.png`, effect: { kind: 'gold', amount: 100 } },
  { id: 'looted_coins', name: 'Looting Bag', desc: '+140 gold scavenged from the fallen', rarity: 'common', icon: `${W}Looting_bag.png`, effect: { kind: 'gold', amount: 140 } },
  { id: 'slayer_bounty', name: 'Slayer Bounty', desc: '+250 gold contract reward', rarity: 'rare', icon: `${W}Enchanted_gem.png`, effect: { kind: 'gold', amount: 250 } },
  { id: 'dragonstone_hoard', name: 'Dragonstone', desc: '+450 gold to spend now', rarity: 'ultra', icon: `${W}Dragonstone.png`, effect: { kind: 'gold', amount: 450 } },
  { id: 'essence_shard', name: 'Rune Essence', desc: '+12 Rune Essence (kept after the run)', rarity: 'common', icon: `${W}Rune_essence_detail.png`, effect: { kind: 'essence', amount: 12 } },
  { id: 'essence_cache', name: 'Pure Essence', desc: '+22 Rune Essence (kept after the run)', rarity: 'uncommon', icon: `${W}Pure_essence_detail.png`, effect: { kind: 'essence', amount: 22 } },
  { id: 'essence_motherlode', name: 'Daeyalt Essence', desc: '+35 Rune Essence (kept after the run)', rarity: 'rare', icon: `${W}Daeyalt_essence.png`, effect: { kind: 'essence', amount: 35 } },
  { id: 'bandages', name: 'Bandages', desc: 'Patch the gate for +2 lives', rarity: 'common', icon: `${W}Bandages.png`, effect: { kind: 'life', amount: 2 } },
  { id: 'shark_supper', name: 'Shark', desc: 'A hearty meal restores +3 lives', rarity: 'uncommon', icon: `${W}Shark.png`, effect: { kind: 'life', amount: 3 } },
  { id: 'saradomin_brew', name: 'Saradomin Brew', desc: 'A blessed brew restores +4 lives', rarity: 'rare', icon: `${W}Saradomin_brew%284%29.png`, effect: { kind: 'life', amount: 4 } },
  { id: 'fortify_gate', name: 'Rune Kiteshield', desc: '+1 max life (and heal 1)', rarity: 'rare', icon: `${W}Rune_kiteshield.png`, effect: { kind: 'maxLife', amount: 1 } },
  { id: 'greater_fortify', name: 'Dragon Kiteshield', desc: '+2 max life (and heal 2)', rarity: 'ultra', icon: `${W}Dragon_kiteshield.png`, effect: { kind: 'maxLife', amount: 2 } },
  { id: 'tokkul', name: 'Tokkul', desc: '+120 gold from the TzHaar', rarity: 'common', icon: `${W}Tokkul.png`, effect: { kind: 'gold', amount: 120 } },
  { id: 'reward_casket', name: 'Reward Casket', desc: '+300 gold from a master clue', rarity: 'rare', icon: `${W}Reward_casket_%28master%29.png`, effect: { kind: 'gold', amount: 300 } },
  { id: 'anglerfish', name: 'Anglerfish', desc: 'An overheal restores +3 lives', rarity: 'uncommon', icon: `${W}Anglerfish.png`, effect: { kind: 'life', amount: 3 } },
  { id: 'gilded_altar', name: 'Blessed Bone Shards', desc: '+18 Rune Essence (kept after the run)', rarity: 'uncommon', icon: `${W}Blessed_bone_shards.png`, effect: { kind: 'essence', amount: 18 } },

  // ──────────────── battlefield: bounty (gold per kill) ───────────────────
  { id: 'ring_of_wealth', name: 'Ring of Wealth', desc: '+3 gold from every kill, this run', rarity: 'uncommon', icon: `${W}Ring_of_wealth.png`, effect: { kind: 'bounty', amount: 3 } },
  { id: 'ring_of_wealth_i', name: 'Ring of Wealth (i)', desc: '+6 gold from every kill, this run', rarity: 'rare', icon: `${W}Ring_of_wealth_%28i%29.png`, effect: { kind: 'bounty', amount: 6 } },
  { id: 'gilded_scarab', name: 'Pharaoh’s Sceptre', desc: '+10 gold from every kill, this run', rarity: 'ultra', icon: `${W}Pharaoh%27s_sceptre.png`, effect: { kind: 'bounty', amount: 10 } },
  // ─────────── battlefield: vulnerability (enemies take more damage) ────────
  { id: 'curse', name: 'Curse', desc: 'Enemies take +2% damage from ALL towers, this run', rarity: 'common', icon: `${W}Curse.png`, effect: { kind: 'vuln', mult: VULN.common } },
  { id: 'vulnerability', name: 'Vulnerability', desc: 'Enemies take +3% damage from ALL towers, this run', rarity: 'uncommon', icon: `${W}Vulnerability.png`, effect: { kind: 'vuln', mult: VULN.uncommon } },
  { id: 'mark_of_darkness', name: 'Mark of Darkness', desc: 'Enemies take +4% damage from ALL towers, this run', rarity: 'rare', icon: `${W}Mark_of_Darkness.png`, effect: { kind: 'vuln', mult: VULN.rare } },
  { id: 'enfeeble', name: 'Enfeeble', desc: 'Enemies take +6% damage from ALL towers, this run', rarity: 'ultra', icon: `${W}Enfeeble.png`, effect: { kind: 'vuln', mult: VULN.ultra } },
  // ─────────────── battlefield: chill (enemies move slower) ────────────────
  { id: 'bind', name: 'Bind', desc: 'Enemies move 2% slower, this run', rarity: 'common', icon: `${W}Bind.png`, effect: { kind: 'chill', mult: CHILL.common } },
  { id: 'snare', name: 'Snare', desc: 'Enemies move 3.5% slower, this run', rarity: 'uncommon', icon: `${W}Snare.png`, effect: { kind: 'chill', mult: CHILL.uncommon } },
  { id: 'entangle', name: 'Entangle', desc: 'Enemies move 5% slower, this run', rarity: 'rare', icon: `${W}Entangle.png`, effect: { kind: 'chill', mult: CHILL.rare } },
  { id: 'ice_barrage_field', name: 'Ice Barrage', desc: 'Enemies move 7% slower, this run', rarity: 'ultra', icon: `${W}Ice_Barrage.png`, effect: { kind: 'chill', mult: CHILL.ultra } },

  // ───────────────────────────── combo cards ──────────────────────────────
  { id: 'berserker_ring', name: 'Berserker Ring', desc: '+3% damage & +1.5% attack speed for melee, this run', rarity: 'uncommon', icon: `${W}Berserker_ring.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'melee' }, { kind: 'fireRate', mult: SPD.common, style: 'melee' }] } },
  { id: 'pegasian_boots', name: 'Pegasian Boots', desc: '+1.5% range & +1.5% attack speed for ranged, this run', rarity: 'uncommon', icon: `${W}Pegasian_boots.png`,
    effect: { kind: 'multi', effects: [{ kind: 'range', mult: RNG.common, style: 'ranged' }, { kind: 'fireRate', mult: SPD.common, style: 'ranged' }] } },
  { id: 'slayer_helmet', name: 'Slayer Helmet', desc: '+3% melee damage & +100 gold', rarity: 'uncommon', icon: `${W}Slayer_helmet.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'melee' }, { kind: 'gold', amount: 100 }] } },
  { id: 'rangers_kit', name: 'Ranger Boots', desc: '+5% damage & +2% range for ranged, this run', rarity: 'rare', icon: `${W}Ranger_boots.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'ranged' }, { kind: 'range', mult: RNG.uncommon, style: 'ranged' }] } },
  { id: 'occult_necklace', name: 'Occult Necklace', desc: '+5% damage & +2% attack speed for magic, this run', rarity: 'rare', icon: `${W}Occult_necklace.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'magic' }, { kind: 'fireRate', mult: SPD.uncommon, style: 'magic' }] } },
  { id: 'void_knight', name: 'Void Knight', desc: '+3% damage & +1.5% attack speed for ALL towers, this run', rarity: 'rare', icon: `${W}Void_knight_top.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common }, { kind: 'fireRate', mult: SPD.common }] } },
  { id: 'inquisitors_set', name: "Inquisitor's Set", desc: '+7.5% damage, +3% attack speed & +3% range for melee, this run', rarity: 'ultra', icon: `${W}Inquisitor%27s_great_helm.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.rare, style: 'melee' }, { kind: 'fireRate', mult: SPD.rare, style: 'melee' }, { kind: 'range', mult: RNG.rare, style: 'melee' }] } },
  { id: 'elite_void', name: 'Elite Void', desc: '+5% damage, +2% range & +2% attack speed for ALL, this run', rarity: 'ultra', icon: `${W}Elite_void_top.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon }, { kind: 'range', mult: RNG.uncommon }, { kind: 'fireRate', mult: SPD.uncommon }] } },
  { id: 'dragon_boots', name: 'Dragon Boots', desc: '+3% damage & +1.5% range for melee, this run', rarity: 'uncommon', icon: `${W}Dragon_boots.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'melee' }, { kind: 'range', mult: RNG.common, style: 'melee' }] } },
  { id: 'archers_ring', name: 'Archers Ring', desc: '+3% damage & +1.5% range for ranged, this run', rarity: 'uncommon', icon: `${W}Archers_ring.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'ranged' }, { kind: 'range', mult: RNG.common, style: 'ranged' }] } },
  { id: 'seers_ring', name: 'Seers Ring', desc: '+3% damage & +1.5% range for magic, this run', rarity: 'uncommon', icon: `${W}Seers_ring.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common, style: 'magic' }, { kind: 'range', mult: RNG.common, style: 'magic' }] } },
  { id: 'fire_cape', name: 'Fire Cape', desc: '+5% damage & +2% range for melee, this run', rarity: 'rare', icon: `${W}Fire_cape.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'melee' }, { kind: 'range', mult: RNG.uncommon, style: 'melee' }] } },
  { id: 'avas_assembler', name: "Ava's Assembler", desc: '+5% damage & +2% attack speed for ranged, this run', rarity: 'rare', icon: `${W}Ava%27s_assembler.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'ranged' }, { kind: 'fireRate', mult: SPD.uncommon, style: 'ranged' }] } },
  { id: 'eternal_boots', name: 'Eternal Boots', desc: '+5% damage & +2% attack speed for magic, this run', rarity: 'rare', icon: `${W}Eternal_boots.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.uncommon, style: 'magic' }, { kind: 'fireRate', mult: SPD.uncommon, style: 'magic' }] } },
  { id: 'amulet_of_fury', name: 'Amulet of Fury', desc: '+3% damage & +1.5% attack speed for ALL towers, this run', rarity: 'rare', icon: `${W}Amulet_of_fury.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.common }, { kind: 'fireRate', mult: SPD.common }] } },
  { id: 'masori_set', name: 'Masori Armour', desc: '+7.5% damage, +3% range & +3% attack speed for ranged, this run', rarity: 'ultra', icon: `${W}Masori_body.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.rare, style: 'ranged' }, { kind: 'range', mult: RNG.rare, style: 'ranged' }, { kind: 'fireRate', mult: SPD.rare, style: 'ranged' }] } },
  { id: 'ancestral_set', name: 'Ancestral Robes', desc: '+7.5% damage, +3% range & +3% attack speed for magic, this run', rarity: 'ultra', icon: `${W}Ancestral_robe_top.png`,
    effect: { kind: 'multi', effects: [{ kind: 'damage', mult: DMG.rare, style: 'magic' }, { kind: 'range', mult: RNG.rare, style: 'magic' }, { kind: 'fireRate', mult: SPD.rare, style: 'magic' }] } },
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

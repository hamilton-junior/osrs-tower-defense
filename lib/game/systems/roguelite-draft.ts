import { ASSETS } from '../assets';
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
  | { kind: 'gold'; amount: number }
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

  // ═══════════════ behavioural cards — change a RULE, not a stat ════════════
  // Build-defining one-offs: all rare/ultra and `unique` (drafted once per run,
  // then removed from the pool — they set a flag, so a repeat would be dead weight).
  // ── on-kill chain reactions ──────────────────────────────────────────────
  { id: 'dragon_claws', name: 'Dragon Claws', desc: 'On a kill, the strike rends the nearest enemy for 50% of the blow', rarity: 'rare', unique: true, icon: `${W}Dragon_claws.png`, effect: { kind: 'ricochet', frac: 0.5, radius: 95 } },
  { id: 'scythe_of_vitur', name: 'Scythe of Vitur', desc: 'A kill’s excess damage cleaves into the nearest enemy', rarity: 'ultra', unique: true, icon: `${W}Scythe_of_vitur.png`, effect: { kind: 'overkill', radius: 95 } },
  { id: 'soul_split', name: 'Soul Split', desc: 'Every 8th kill restores 1 life', rarity: 'rare', unique: true, icon: `${W}Soul_Split.png`, effect: { kind: 'soulSplit', every: 8 } },
  { id: 'dragon_warhammer', name: 'Dragon Warhammer', desc: 'Every 20 kills, a shockwave smashes ALL enemies for 40', rarity: 'ultra', unique: true, icon: `${W}Dragon_warhammer.png`, effect: { kind: 'killStreak', every: 20, damage: 40 } },
  // ── risk / reward curses ─────────────────────────────────────────────────
  { id: 'phoenix_necklace', name: 'Phoenix Necklace', desc: 'While at 2 lives or fewer, ALL towers deal double damage', rarity: 'rare', unique: true, icon: `${W}Phoenix_necklace.png`, effect: { kind: 'lastStand', belowLives: 2, mult: 2 } },
  { id: 'berserker_brew', name: 'Berserker Necklace', desc: '+12% damage for every life you have lost', rarity: 'rare', unique: true, icon: `${W}Berserker_necklace.png`, effect: { kind: 'berserker', perMissingLife: 0.12 } },
  { id: 'blood_pact', name: 'Blood Pact', desc: '+40% damage to ALL towers, but each wave cleared costs 1 life', rarity: 'rare', unique: true, icon: `${W}Blood_shard.png`, effect: { kind: 'bloodPact', mult: 1.4 } },
  { id: 'greedy_pact', name: 'Greedy Pact', desc: 'Enemies have +25% HP, but drop double gold', rarity: 'rare', unique: true, icon: `${W}Zenyte.png`, effect: { kind: 'greed', hpMult: 1.25, goldMult: 2 } },
  // ── tower transformations ────────────────────────────────────────────────
  { id: 'dragon_knife', name: 'Dragon Knife', desc: 'Ranged towers loose a second shot at another enemy in range', rarity: 'rare', unique: true, icon: `${W}Dragon_knife.png`, effect: { kind: 'doubleShot' } },
  { id: 'toxic_blowpipe', name: 'Toxic Blowpipe', desc: 'Every tower’s hit also injects venom', rarity: 'rare', unique: true, icon: `${W}Toxic_blowpipe.png`, effect: { kind: 'venomTips', dps: 6, dur: 4 } },
  { id: 'ice_barrage_card', name: 'Ice Barrage', desc: 'Any slow now spreads to nearby enemies', rarity: 'rare', unique: true, icon: `${W}Ice_Barrage.png`, effect: { kind: 'chainFreeze', radius: 75 } },
  { id: 'heavy_ballista', name: 'Heavy Ballista', desc: 'Projectiles punch through to strike the enemy behind', rarity: 'rare', unique: true, icon: `${W}Heavy_ballista.png`, effect: { kind: 'pierce', radius: 70 } },
  // ── placement synergies (reward HOW you position, not just what you pick) ──
  { id: 'clan_vexillum', name: 'Clan Vexillum', desc: 'Each tower gains +8% damage per nearby tower of the same kind (max +40%)', rarity: 'ultra', unique: true, icon: `${W}Clan_vexillum_%28green%29.png`, effect: { kind: 'packTactics', frac: 0.08, radius: 96, maxStacks: 5 } },
  { id: 'combat_triangle', name: 'Combat Triangle', desc: 'A tower flanked by both other combat styles deals +30% damage', rarity: 'ultra', unique: true, icon: `${W}Multicombat.png`, effect: { kind: 'trinity', mult: 1.3, radius: 96 } },
  { id: 'dinhs_bulwark', name: "Dinh's Bulwark", desc: 'Your frontmost tower (nearest the portal) deals +60% damage', rarity: 'ultra', unique: true, icon: `${W}Dinh%27s_bulwark.png`, effect: { kind: 'vanguard', mult: 1.6 } },
  { id: 'lone_wolf', name: 'Lone Wolf', desc: 'A tower with no other tower nearby deals +50% damage', rarity: 'ultra', unique: true, icon: `${W}Wolf_mask.png`, effect: { kind: 'loneWolf', mult: 1.5, radius: 96 } },
  // ── magic spellbook specialisations — buff ONE wizard subtype only ──
  { id: 'tome_of_fire', name: 'Tome of Fire', desc: 'Elemental wizards: +25% damage and +10% attack speed', rarity: 'ultra', unique: true, icon: `${W}Tome_of_fire.png`, effect: { kind: 'mageBuff', mode: 'elemental', damage: 1.25, fireRate: 1.1 } },
  { id: 'ancient_sceptre', name: 'Ancient Sceptre', desc: 'Ancient wizards: +20% damage and +15% range', rarity: 'ultra', unique: true, icon: `${W}Ancient_sceptre.png`, effect: { kind: 'mageBuff', mode: 'ancients', damage: 1.2, range: 1.15 } },
  { id: 'lunar_staff', name: 'Lunar Staff', desc: 'Utility wizards: +25% support range and +15% damage', rarity: 'ultra', unique: true, icon: `${W}Lunar_staff.png`, effect: { kind: 'mageBuff', mode: 'utility', range: 1.25, damage: 1.15 } },
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

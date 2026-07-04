import type { Element, AncientType, MageMode } from '../types';

/**
 * On-hit status a magic projectile can inflict (resolved by the engine's hit).
 * `pushback` knocks the enemy back along the path; `amp` marks it to take extra
 * damage from every source. Fire/Smoke both use `burn` but the engine scales it
 * differently (Fire = % max HP, Smoke = flat); Earth/Shadow both `stun` but at
 * different durations. The difference is single-target (Elemental) vs AoE
 * (Ancients) — see the engine's `applyOnHit`.
 */
export type MagicEffect = 'slow' | 'stun' | 'burn' | 'pushback' | 'amp';

export interface ElementSpec {
  effect: MagicEffect;
  color: string;
  /** Projectile glow/trail colour — matches the spell sprite, not the UI accent
   *  (e.g. Earth casts glow green, Air whitish), so the bolt reads as its element.
   *  Falls back to {@link ElementSpec.color} when omitted. */
  glow?: string;
  label: string;
  desc: string;
}

/**
 * Elemental spellbook: single-target specialists. Each element is mechanically
 * distinct so the choice matters beyond elemental weakness.
 */
export const ELEMENT_ORDER: Exclude<Element, 'none'>[] = ['air', 'water', 'earth', 'fire'];
export const ELEMENTS: Record<Exclude<Element, 'none'>, ElementSpec> = {
  air: { effect: 'pushback', color: '#cfe8ff', glow: '#eaf6ff', label: 'Air', desc: 'Knocks the enemy back along the path' },
  water: { effect: 'amp', color: '#3fa9ff', glow: '#3fa9ff', label: 'Water', desc: 'Marks the enemy: +25% damage taken (3s)' },
  earth: { effect: 'stun', color: '#b07a3c', glow: '#46c23a', label: 'Earth', desc: 'Long single-target stun (~2s)' },
  fire: { effect: 'burn', color: '#ff5a1f', glow: '#ff5a1f', label: 'Fire', desc: 'Burns for a % of max HP per second' },
};

export interface AncientSpec {
  /** Status applied to every enemy caught in the barrage (Blood has none). */
  effect?: MagicEffect;
  /** Blood barrage: chance to heal a life on a kill (scales with tower level). */
  lifesteal?: boolean;
  color: string;
  /** Projectile glow/trail colour (matches the sprite: Shadow black, Ice white-
   *  blue, …). Falls back to {@link AncientSpec.color} when omitted. */
  glow?: string;
  label: string;
  desc: string;
}

/** Ancients spellbook: AoE barrages — generally stronger, less specialised. */
export const ANCIENT_ORDER: AncientType[] = ['ice', 'blood', 'shadow', 'smoke'];
export const ANCIENTS: Record<AncientType, AncientSpec> = {
  ice: { effect: 'slow', color: '#7fe6ff', glow: '#dff4ff', label: 'Ice', desc: 'AoE barrage that slows' },
  blood: { lifesteal: true, color: '#c81e1e', glow: '#c81e1e', label: 'Blood', desc: 'AoE barrage; bonus damage = (3 + 0.5·level)% of max HP, plus a chance to restore a life on a kill' },
  shadow: { effect: 'stun', color: '#6a3fb0', glow: '#1b1024', label: 'Shadow', desc: 'AoE barrage with a brief stun' },
  smoke: { effect: 'burn', color: '#9a9a9a', glow: '#8f8f8f', label: 'Smoke', desc: 'AoE barrage that poisons for the current wave number per second' },
};

/**
 * Utility spellbook: support casters that don't fire projectiles. On top of the
 * always-on aura, each utility wizard projects ONE field over the enemies in its
 * range, chosen by the player:
 *  - `curse`    → vulnerability field: enemies take +25% damage while inside.
 *  - `enfeeble` → frost field: enemies are slowed while inside.
 *  - `sanctity` → Prayer Ward: cuts your active Prayer drain (no field). Each
 *    such wizard shaves the drain; 5 of them (with a maxed Prayer-regen upgrade)
 *    halve it. See {@link PrayerSystem.drainReduction}.
 */
export type SupportSpellId = 'curse' | 'enfeeble' | 'sanctity';

export interface SupportSpec {
  color: string;
  label: string;
  desc: string;
  /** Arceuus-spellbook wiki icon file name, used as the spell's sprite/badge. */
  spell: string;
}

export const SUPPORT_ORDER: SupportSpellId[] = ['curse', 'enfeeble', 'sanctity'];
export const SUPPORT_SPELLS: Record<SupportSpellId, SupportSpec> = {
  curse: { color: '#c77dff', label: 'Vulnerability', desc: 'Enemies in range take +25% damage', spell: 'Death_Charge' },
  enfeeble: { color: '#7fe6ff', label: 'Enfeeble', desc: 'Enemies in range are slowed', spell: 'Undead_Grasp' },
  sanctity: { color: '#ffd24a', label: 'Prayer Ward', desc: 'Cuts your active Prayer drain (stacks per wizard)', spell: 'Vile_Vigour' },
};

/** OSRS game tick (0.6s). */
export const TICK_SECONDS = 0.6;

/**
 * Spell names per tower level (level 1→4). Used to build the on-canvas spell
 * badge, the projectile sprite, and the panel icons. Elemental towers cast the
 * standard Strike→Wave line; Ancients cast the Rush→Barrage line. The element
 * (Air="Wind"/…) and ancient (Ice/Blood/…) supply the spell's prefix word, so
 * the sprite key matches the wiki file name, e.g. `Fire_Wave`, `Ice_Barrage`.
 */
export const ELEMENTAL_TIER_NAMES = ['Strike', 'Bolt', 'Blast', 'Wave'] as const;
export const ANCIENT_TIER_NAMES = ['Rush', 'Burst', 'Blitz', 'Barrage'] as const;
export const ELEMENT_SPELL_WORD: Record<Exclude<Element, 'none'>, string> = {
  air: 'Wind', water: 'Water', earth: 'Earth', fire: 'Fire',
};
export const ANCIENT_SPELL_WORD: Record<AncientType, string> = {
  ice: 'Ice', blood: 'Blood', shadow: 'Shadow', smoke: 'Smoke',
};

function tierIndex(level: number): number {
  return Math.min(Math.max(level, 1), 4) - 1;
}

/** Wiki spell-file name for an Elemental cast, e.g. ("fire", 4) → "Fire_Wave". */
export function elementalSpellName(element: Exclude<Element, 'none'>, level: number): string {
  return `${ELEMENT_SPELL_WORD[element]}_${ELEMENTAL_TIER_NAMES[tierIndex(level)]}`;
}

/** Wiki spell-file name for an Ancients cast, e.g. ("ice", 4) → "Ice_Barrage". */
export function ancientSpellName(ancient: AncientType, level: number): string {
  return `${ANCIENT_SPELL_WORD[ancient]}_${ANCIENT_TIER_NAMES[tierIndex(level)]}`;
}

/** The spell-sprite key for a wizard's current cast/field (null for non-wizard).
 *  Utility resolves to its support spell's Arceuus icon (it fires no projectile,
 *  but the icon is still shown as the staff badge). */
export function spellSpriteName(
  tower: { type: string; mageMode?: MageMode; element?: Element; ancientType?: AncientType; supportSpell?: SupportSpellId; level: number },
): string | null {
  if (tower.type !== 'wizard') return null;
  const mode = tower.mageMode ?? 'elemental';
  if (mode === 'elemental') return elementalSpellName((tower.element ?? 'air') as Exclude<Element, 'none'>, tower.level);
  if (mode === 'ancients') return ancientSpellName(tower.ancientType ?? 'ice', tower.level);
  return SUPPORT_SPELLS[tower.supportSpell ?? 'curse'].spell; // utility → Arceuus icon
}

/**
 * Ancients hit for the Ice-barrage values (Rush 16 → Burst 22 → Blitz 25 →
 * Barrage 30, per the OSRS wiki), independent of the chosen ancient element —
 * the element only changes the on-hit effect. They out-damage the Elemental
 * line (Fire Wave 20) but, being AoE, their splash is reduced on non-primary
 * targets by {@link BARRAGE_SPLASH_FALLOFF} so they stay a side-grade.
 */
export const ANCIENT_HITS = [16, 22, 25, 30];
export function ancientHit(level: number): number {
  return ANCIENT_HITS[tierIndex(level)];
}

/** Fraction of a barrage's damage dealt to caught-but-not-primary targets. */
export const BARRAGE_SPLASH_FALLOFF = 0.5;

/** Extra damage an elemental cast deals to an enemy weak to that element. */
export const WEAKNESS_BONUS = 1.5;

/** Damage multiplier for an elemental hit, given the enemy's weakness. */
export function weaknessMultiplier(element: Element, weakness: Element | undefined): number {
  return element !== 'none' && weakness != null && weakness === element ? WEAKNESS_BONUS : 1;
}

/** Chance (0–1) for a Blood barrage to steal a life, given the tower's level. */
export function lifestealChance(towerLevel: number): number {
  return (1 + towerLevel) / 100; // 2% at L1 → 5% at L4
}

/**
 * Blood barrage bonus damage as a fraction of the target's max HP: `(3 + 0.5·level)%`
 * (3.5% at L1 → 5% at L4). Added on top of the flat barrage hit so Blood scales
 * against high-HP enemies — its niche beside the chance-to-heal lifesteal.
 */
export function bloodBonusFrac(towerLevel: number): number {
  return (3 + 0.5 * towerLevel) / 100;
}

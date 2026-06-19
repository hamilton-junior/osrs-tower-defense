import type { Element, AncientType } from '../types';

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
  label: string;
  desc: string;
}

/**
 * Elemental spellbook: single-target specialists. Each element is mechanically
 * distinct so the choice matters beyond elemental weakness.
 */
export const ELEMENT_ORDER: Exclude<Element, 'none'>[] = ['air', 'water', 'earth', 'fire'];
export const ELEMENTS: Record<Exclude<Element, 'none'>, ElementSpec> = {
  air: { effect: 'pushback', color: '#cfe8ff', label: 'Air', desc: 'Knocks the enemy back along the path' },
  water: { effect: 'amp', color: '#3fa9ff', label: 'Water', desc: 'Marks the enemy: +25% damage taken (3s)' },
  earth: { effect: 'stun', color: '#b07a3c', label: 'Earth', desc: 'Long single-target stun (~2s)' },
  fire: { effect: 'burn', color: '#ff5a1f', label: 'Fire', desc: 'Burns for a % of max HP per second' },
};

export interface AncientSpec {
  /** Status applied to every enemy caught in the barrage (Blood has none). */
  effect?: MagicEffect;
  /** Blood barrage: chance to heal a life on a kill (scales with tower level). */
  lifesteal?: boolean;
  color: string;
  label: string;
  desc: string;
}

/** Ancients spellbook: AoE barrages — generally stronger, less specialised. */
export const ANCIENT_ORDER: AncientType[] = ['ice', 'blood', 'shadow', 'smoke'];
export const ANCIENTS: Record<AncientType, AncientSpec> = {
  ice: { effect: 'slow', color: '#7fe6ff', label: 'Ice', desc: 'AoE barrage that slows' },
  blood: { lifesteal: true, color: '#c81e1e', label: 'Blood', desc: 'AoE barrage; chance to restore a life on a kill' },
  shadow: { effect: 'stun', color: '#6a3fb0', label: 'Shadow', desc: 'AoE barrage with a brief stun' },
  smoke: { effect: 'burn', color: '#9a9a9a', label: 'Smoke', desc: 'AoE barrage that poisons (flat damage)' },
};

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

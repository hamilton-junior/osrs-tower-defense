import type { Element, AncientType } from '../types';

/** On-hit status a magic projectile can inflict (reused by the engine's hit). */
export type MagicEffect = 'slow' | 'stun' | 'burn';

export interface ElementSpec {
  /** Status applied on hit; Air is pure damage (none). */
  effect?: MagicEffect;
  color: string;
  label: string;
}

/** Elemental spellbook: single-target, each element a different on-hit status. */
export const ELEMENT_ORDER: Exclude<Element, 'none'>[] = ['air', 'water', 'earth', 'fire'];
export const ELEMENTS: Record<Exclude<Element, 'none'>, ElementSpec> = {
  air: { color: '#cfe8ff', label: 'Air' },
  water: { effect: 'slow', color: '#3fa9ff', label: 'Water' },
  earth: { effect: 'stun', color: '#b07a3c', label: 'Earth' },
  fire: { effect: 'burn', color: '#ff5a1f', label: 'Fire' },
};

export interface AncientSpec {
  /** Status applied to every enemy caught in the barrage. */
  effect?: MagicEffect;
  /** Blood barrage: heal a life on a kill. */
  lifesteal?: boolean;
  color: string;
  label: string;
}

/** Ancients spellbook: every cast is an area-of-effect barrage. */
export const ANCIENT_ORDER: AncientType[] = ['ice', 'blood', 'shadow', 'smoke'];
export const ANCIENTS: Record<AncientType, AncientSpec> = {
  ice: { effect: 'slow', color: '#7fe6ff', label: 'Ice' },
  blood: { lifesteal: true, color: '#c81e1e', label: 'Blood' },
  shadow: { effect: 'stun', color: '#6a3fb0', label: 'Shadow' },
  smoke: { effect: 'burn', color: '#9a9a9a', label: 'Smoke' },
};

/** Extra damage an elemental cast deals to an enemy weak to that element. */
export const WEAKNESS_BONUS = 1.5;

/** Damage multiplier for an elemental hit, given the enemy's weakness. */
export function weaknessMultiplier(element: Element, weakness: Element | undefined): number {
  return element !== 'none' && weakness != null && weakness === element ? WEAKNESS_BONUS : 1;
}

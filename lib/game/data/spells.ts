/**
 * Castable Magic spells used by `GameEngine.castSpell` (the utility/teleport
 * spellbook, distinct from the wizard-tower combat spells). Each spell needs
 * the player's Magic `level` and consumes `runes` (id → quantity) per cast.
 */
export interface CastableSpell {
  id: string;
  level: number;
  runes: Record<string, number>;
  xp: number;
}

export const MAGIC_SPELLS: CastableSpell[] = [
  { id: 'bones_to_peaches', level: 60, runes: { nature_rune: 2, earth_rune: 4, water_rune: 4 }, xp: 35.5 },
  { id: 'high_alchemy', level: 55, runes: { nature_rune: 1, fire_rune: 5 }, xp: 65 },
  { id: 'superheat_item', level: 43, runes: { nature_rune: 1, fire_rune: 4 }, xp: 53 },
  { id: 'ice_barrage', level: 94, runes: { blood_rune: 2, death_rune: 4, water_rune: 6 }, xp: 52 },
  { id: 'blood_barrage', level: 92, runes: { blood_rune: 4, death_rune: 4, soul_rune: 1 }, xp: 51 },
];

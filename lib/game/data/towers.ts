
import type { CombatStyle, Tower, TowerType } from '../types';

/**
 * Each tower's combat style and whether stat boosts (potions/prayers) apply.
 * Boosts key off `style`, not the tower id — so a Ranging potion buffs every
 * `ranged` weapon. The Dwarf Cannon deals Ranged damage but, like in OSRS, has
 * fixed damage, so it is `boostable: false` and ignores potions/prayers. Retune
 * here (e.g. make the cannon a boostable `melee` weapon) without touching logic.
 */
export const TOWER_STYLES: Record<TowerType, { style: CombatStyle; boostable: boolean }> = {
  archer: { style: 'ranged', boostable: true },
  toxic: { style: 'ranged', boostable: true },
  cannon: { style: 'ranged', boostable: false },
  wizard: { style: 'magic', boostable: true },
  tzhaar: { style: 'melee', boostable: true },
  slayer: { style: 'melee', boostable: true },
};

export interface TowerTier {
  level: number;
  name: string;
  damage: number;
  cooldown: number;
  range: number;
  color: string;
  upgradeCost: number;
  special?: Tower['special'];
  minDamage?: number;
  maxDamage?: number;
}

export interface TowerDef {
  type: TowerType;
  baseName: string;
  tiers: TowerTier[];
  fireSound?: string;
}

const TICK = 0.6;

export const TOWERS: Record<string, TowerDef> = {
  archer: {
    type: 'archer',
    baseName: 'Ranged',
    fireSound: 'archer',
    tiers: [
      { level: 1, name: 'Shortbow', damage: 3, cooldown: 3 * TICK * 1000, range: 7 * 25, color: '#9acd32', upgradeCost: 25 },
      { level: 2, name: 'Magic Shortbow', damage: 8, cooldown: 3 * TICK * 1000, range: 7 * 25, color: '#32CD32', upgradeCost: 65 },
      { level: 3, name: 'Dark Bow', damage: 15, cooldown: 5 * TICK * 1000, range: 9 * 25, color: '#E0FFFF', upgradeCost: 150 },
      { level: 4, name: 'Bow of Faerdhinen', damage: 25, cooldown: 3 * TICK * 1000, range: 10 * 25, color: '#a020f0', upgradeCost: 500 }
    ]
  },
  wizard: {
    type: 'wizard',
    baseName: 'Magic',
    fireSound: 'wizard',
    // Damage mirrors the strongest standard-spellbook cast at each tier — the
    // Fire variant (Strike 8 → Bolt 12 → Blast 16 → Wave 20, per the OSRS wiki).
    // Every element hits for the same number; the element only changes the on-hit
    // effect and the weakness bonus, so no element is a damage downgrade.
    tiers: [
      { level: 1, name: 'Strike', damage: 8, cooldown: 5 * TICK * 1000, range: 6 * 25, color: '#a0cfff', upgradeCost: 40 },
      { level: 2, name: 'Bolt', damage: 12, cooldown: 5 * TICK * 1000, range: 7 * 25, color: '#a0cfff', upgradeCost: 80 },
      { level: 3, name: 'Blast', damage: 16, cooldown: 5 * TICK * 1000, range: 8 * 25, color: '#a0cfff', upgradeCost: 200 },
      { level: 4, name: 'Wave', damage: 20, cooldown: 5 * TICK * 1000, range: 8 * 25, color: '#7b68ee', upgradeCost: 600 }
    ]
  },
  cannon: {
    type: 'cannon',
    baseName: 'Cannon',
    fireSound: 'cannon_1',
    tiers: [
      // AoE on every tier — the cannon's identity is full-damage crowd-clear (no
      // Ancients splash falloff). Early tiers are fast + small; late tiers are
      // slow, hard-hitting and wide (see cannonBlastRadius). Min/max give the
      // shot a spread; fixed-damage so it ignores potions/prayers (TOWER_STYLES).
      // Tier names match the tier models (see ASSETS.towers.cannon): paint
      // cannon → ship cannon → multicannon → ornament-kit multicannon.
      { level: 1, name: 'Hand Cannon', damage: 0, minDamage: 0, maxDamage: 8, cooldown: 2 * TICK * 1000, range: 9 * 25, color: '#cd5c5c', upgradeCost: 100, special: 'aoe' },
      { level: 2, name: 'Naval Cannon', damage: 0, minDamage: 5, maxDamage: 12, cooldown: 2 * TICK * 1000, range: 9 * 25, color: '#808080', upgradeCost: 200, special: 'aoe' },
      { level: 3, name: 'Dwarf Multicannon', damage: 35, minDamage: 25, maxDamage: 45, cooldown: 4 * TICK * 1000, range: 11 * 25, color: '#d2b48c', upgradeCost: 400, special: 'aoe' },
      { level: 4, name: 'Ornated Dwarf Multicannon', damage: 65, minDamage: 50, maxDamage: 80, cooldown: 4 * TICK * 1000, range: 12 * 25, color: '#ff4500', upgradeCost: 800, special: 'aoe' }
    ]
  },
  tzhaar: {
    type: 'tzhaar',
    baseName: 'TzHaar',
    fireSound: 'tzhaar_1',
    // Obsidian melee: short range, heavy hits, and a knockback that shoves the
    // enemy back along the path — tempo control no wizard has. Every tier knocks
    // back, scaling with the weapon (½·=·+50%·×2 of the Air gust — see
    // tzhaarKnockback), AND every tier now stuns on hit (tzhaarStun: 0.3s/0.45s
    // at the dagger tiers); the maul tiers (Ket-Om / Inquisitor's) also crush for
    // the full 0.6s stun on top of the (bigger) shove.
    tiers: [
      { level: 1, name: 'TzHaar-Ket', damage: 12, cooldown: 4 * TICK * 1000, range: 3 * 25, color: '#8B0000', upgradeCost: 125, special: 'pushback' },
      { level: 2, name: 'Toktz-xil-ak', damage: 22, cooldown: 4 * TICK * 1000, range: 4 * 25, color: '#ff4500', upgradeCost: 300, special: 'pushback' },
      { level: 3, name: 'TzHaar-Ket-Om', damage: 45, cooldown: 6 * TICK * 1000, range: 5 * 25, color: '#ff0000', upgradeCost: 600, special: 'crush' },
      { level: 4, name: "Inquisitor's Mace", damage: 85, cooldown: 4 * TICK * 1000, range: 5 * 25, color: '#ffd700', upgradeCost: 1000, special: 'crush' }
    ]
  },
  slayer: {
    type: 'slayer',
    baseName: 'Slayer',
    fireSound: 'slayer_1',
    // Melee executioner: short reach (a blade, not a bow) with a cadence that only
    // ever gets *faster* as it tiers — 4 → 3 → 3 → 2 ticks — so its big per-tier
    // damage + category bonus (slayerWeaponBonus) makes it the single-target boss
    // killer. Tight range keeps it off the archer's long-range volume niche.
    tiers: [
      { level: 1, name: 'Darklight', damage: 15, cooldown: 4 * TICK * 1000, range: 4 * 25, color: '#4B0082', upgradeCost: 125 },
      { level: 2, name: 'Arclight', damage: 25, cooldown: 3 * TICK * 1000, range: 4 * 25, color: '#006400', upgradeCost: 250 },
      { level: 3, name: 'Leaf-bladed Sword', damage: 55, cooldown: 3 * TICK * 1000, range: 5 * 25, color: '#00ff00', upgradeCost: 500 },
      { level: 4, name: 'Emberlight', damage: 95, cooldown: 2 * TICK * 1000, range: 5 * 25, color: '#0000ff', upgradeCost: 1200 }
    ]
  },
  toxic: {
    type: 'toxic',
    baseName: 'Toxic',
    fireSound: 'toxic_1',
    // Venom on every tier: each hit ramps a poison DoT that climbs with sustained
    // fire and keeps ticking after the enemy leaves range — a DoT that *grows*,
    // unlike the wizard's flat burn/poison (see venomRamp / applyOnHit 'venom').
    tiers: [
      { level: 1, name: 'Tanzanite Fang', damage: 8, cooldown: 2 * TICK * 1000, range: 5 * 25, color: '#2a6b5a', upgradeCost: 200, special: 'venom' },
      { level: 2, name: 'Toxic Blowpipe', damage: 16, cooldown: 2 * TICK * 1000, range: 5 * 25, color: '#008b8b', upgradeCost: 400, special: 'venom' },
      { level: 3, name: 'Magic Fang', damage: 32, cooldown: 3 * TICK * 1000, range: 6 * 25, color: '#32cd32', upgradeCost: 800, special: 'venom' },
      { level: 4, name: 'Trident of the Swamp', damage: 55, cooldown: 2 * TICK * 1000, range: 6 * 25, color: '#ff4500', upgradeCost: 1500, special: 'venom' }
    ]
  }
};

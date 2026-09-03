
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
  // Fusions inherit the style of the parent whose reach they keep.
  scorching_bow: { style: 'ranged', boostable: true },
  venator_bow: { style: 'ranged', boostable: true },
  noxious_halberd: { style: 'melee', boostable: true },
  purging_staff: { style: 'magic', boostable: true },
  toxic_staff_of_the_dead: { style: 'magic', boostable: true },
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
      { level: 3, name: 'Magic Fang', damage: 32, cooldown: 2 * TICK * 1000, range: 6 * 25, color: '#32cd32', upgradeCost: 800, special: 'venom' },
      { level: 4, name: 'Trident of the Swamp', damage: 55, cooldown: 2 * TICK * 1000, range: 6 * 25, color: '#ff4500', upgradeCost: 1500, special: 'venom' }
    ]
  },
  // ---------------------------------------------------------------- fusions
  // A fused weapon arrives finished: one tier, no upgrade ladder. Its single
  // `upgradeCost` is therefore not a price — nothing sells it — but the invested
  // value the run refunds on a sell, which is why it reads as roughly what the
  // two parents plus the fusion fee cost.
  //
  // Scorching bow = Bow of Faerdhinen + Emberlight. Against a favoured target
  // (Slayer task / Superior / boss) it hits for 1.5x/1.3x/1.25x AND reaches it
  // wherever it stands, so its uptime is the whole board; against everything
  // else it is a plain 100 dps bow, slightly *worse* than the two towers it ate.
  // That trade is the whole weapon: it stops clearing waves to never miss the
  // one kill that matters.
  scorching_bow: {
    type: 'scorching_bow',
    baseName: 'Scorching',
    fireSound: 'archer',
    tiers: [
      { level: 1, name: 'Scorching Bow', damage: 120, cooldown: 2 * TICK * 1000, range: 10 * 25, color: '#c8412a', upgradeCost: 4800 }
    ]
  },
  // Venator bow = Bow of Faerdhinen + the cannon's reach down a lane. One shot
  // runs the length of the road it was fired along and keeps going back up the
  // road behind it, with no cap on how many it hits — but it sheds a quarter of
  // its damage at every bend and dies two bends out. So it is not a tower you
  // aim, it is a tower you *site*: on the long straight approach it out-damages
  // anything on the board, and in a switchback it is a slow single-target bow.
  venator_bow: {
    type: 'venator_bow',
    baseName: 'Venator',
    fireSound: 'archer',
    tiers: [
      { level: 1, name: 'Venator Bow', damage: 55, cooldown: 5 * TICK * 1000, range: 9 * 25, color: '#6f4fa8', upgradeCost: 4600 }
    ]
  },
  // Noxious halberd = the TzHaar's obsidian and the Toxic fang's venom, and it
  // fixes what is wrong with both: the TzHaar only ever touches one enemy, and
  // the fang's venom needs sustained fire on one target to be worth anything. So
  // the halberd SWINGS — every attack hits everything inside its (short) square
  // at full damage — and then levels the whole swing up to the strongest venom
  // already burning on any of them. It grows no venom of its own worth having;
  // it is the tower that takes the venom a Toxic tower spent a wave ramping on
  // the front tank and smears it across the pack behind. Alone: a mediocre AoE
  // melee. Beside a fang: the reason the fang was worth building.
  noxious_halberd: {
    type: 'noxious_halberd',
    baseName: 'Noxious',
    fireSound: 'tzhaar',
    tiers: [
      { level: 1, name: 'Noxious Halberd', damage: 70, cooldown: 4 * TICK * 1000, range: 5 * 25, color: '#6a9a2f', upgradeCost: 4400 }
    ]
  },
  // Purging staff = Trident-class staff + Emberlight. An executioner: its hit grows
  // with the health the target has already lost (x1 full → x2 on the last sliver,
  // purgeDamageMult), and every hit shuts healing off for 5s — boss self-heals,
  // Jad's Yt-HurKot, Scurrius's rats, the Corporeal Beast's siphon and the
  // Regenerating affix all stop at once. Against a fresh enemy it is worse than
  // either parent; against anything that is dying, or refuses to, nothing else
  // comes close.
  purging_staff: {
    type: 'purging_staff',
    baseName: 'Purging',
    tiers: [
      { level: 1, name: 'Purging Staff', damage: 100, cooldown: 3 * TICK * 1000, range: 8 * 25, color: '#8a5bd0', upgradeCost: 5000, special: 'purge' }
    ]
  },
  // Toxic staff of the dead = the Trident of the Swamp's venom welded into a
  // wizard's staff, and the only tower in the game whose weapon is the OTHER
  // towers. It carries no venom special of its own: instead every tower firing
  // from inside its range — archer, cannon, halberd, the staff itself — leaves
  // venom on what it hits (see envenomAura). The fang's problem was always that
  // its venom ramps on whatever one enemy it happened to be pointed at; the
  // staff hands that venom to the whole board's rate of fire. So its range is
  // the widest on the board, because the range IS the weapon, and where it
  // stands matters more than what it shoots.
  toxic_staff_of_the_dead: {
    type: 'toxic_staff_of_the_dead',
    baseName: 'Toxic',
    tiers: [
      { level: 1, name: 'Toxic Staff of the Dead', damage: 70, cooldown: 3 * TICK * 1000, range: 9 * 25, color: '#4f8f3a', upgradeCost: 4700 }
    ]
  }
};

import type { Item, Tower, TowerType, AmmoClass, Enemy } from '../types';
import { towerCombatLevel } from './tower-xp';
import { slayerWeaponBonus } from './tower-identity';
import { GEAR_POOL } from '../data/gear';

/** The ammo/rune/kit family each tower type consumes in its Classic ammo slot.
 *  Single source of truth for the ammo slot's class gate — jewellery has no
 *  class gate (universal). The two melee towers (slayer, tzhaar) both burn
 *  `melee_kit`; every other tower type has its own class. */
export const TOWER_AMMO_CLASS: Record<TowerType, AmmoClass> = {
  archer: 'arrows',
  toxic: 'darts',
  cannon: 'cannonballs',
  wizard: 'runes',
  tzhaar: 'melee_kit',
  slayer: 'melee_kit',
};

/** Reader for `TOWER_AMMO_CLASS` (mirrors the old `weaponClassFor`). */
export function towerAmmoClassFor(type: TowerType): AmmoClass {
  return TOWER_AMMO_CLASS[type];
}

export type EquipCheck = { ok: true } | { ok: false; reason: 'class' | 'level' };

/** Whether `tower` may equip `gear`. Ammo must match the tower's ammo class
 *  (see `TOWER_AMMO_CLASS`); jewellery is universal. Both require the tower's
 *  combat level (in its style skill) to meet `levelReq`. Slot routing (ammo vs
 *  jewellery) is the caller's job — this checks compatibility only. */
export function canEquip(tower: Pick<Tower, 'type' | 'skills'>, gear: Item): EquipCheck {
  if (gear.type === 'ammo' && gear.ammoClass !== towerAmmoClassFor(tower.type)) {
    return { ok: false, reason: 'class' };
  }
  if (towerCombatLevel(tower) < (gear.levelReq ?? 1)) return { ok: false, reason: 'level' };
  return { ok: true };
}

export interface GearDropContext {
  wave: number;
  isBoss: boolean;
}

/** The highest common `levelReq` allowed to drop at this wave — mirrors the
 *  wave-capped gear tier of the legacy loot roll (wave / 3, floored). */
function commonLevelCap(wave: number): number {
  return Math.max(1, Math.floor(wave / 3) + 1);
}

/**
 * Roll gear drops for one kill (Classic only — the engine gates the call).
 * Consumes `rng` in a fixed order: common-ammo gate+pick, jewellery gate+pick,
 * then a boss-only signature gate+pick. Common ammo is capped by wave so a
 * top-tier piece can't fall on wave 1. Returns the pieces that landed.
 */
export function rollGearDrops(ctx: GearDropContext, rng: () => number = Math.random): Item[] {
  const out: Item[] = [];
  const cap = commonLevelCap(ctx.wave);
  const pick = (pool: Item[]) => pool.length ? pool[Math.floor(rng() * pool.length)] : null;

  // Common ammo — rare, wave-capped.
  if (rng() < 0.02) {
    const p = pick(GEAR_POOL.filter(g => g.type === 'ammo' && g.rarity === 'common' && (g.levelReq ?? 1) <= cap));
    if (p) out.push(p);
  }
  // Jewellery — rarer.
  if (rng() < 0.01) {
    const p = pick(GEAR_POOL.filter(g => g.type === 'jewellery' && (g.levelReq ?? 1) <= cap));
    if (p) out.push(p);
  }
  // Signature — bosses only.
  if (ctx.isBoss && rng() < 0.25) {
    const p = pick(GEAR_POOL.filter(g => g.rarity === 'signature'));
    if (p) out.push(p);
  }
  return out;
}

/**
 * Per-target damage multiplier from every equipped signature piece (1 when
 * none), folded across both gear slots (ammo, jewellery) — a tower running two
 * signatures multiplies both:
 *  - anti_tank: climbs with the target's max HP, 1.0 at ≤40 HP up to ~1.5 at
 *    very high HP.
 *  - slayer_bane: the slayer weapon bonus vs the active task / superiors / bosses.
 * Pure — the engine multiplies a landed hit by this at the damage site.
 */
export function gearDamageMult(tower: Pick<Tower, 'equipment'>, enemy: Pick<Enemy, 'type' | 'maxHp' | 'isBoss'>, taskType: string | null): number {
  let mult = 1;
  for (const item of [tower.equipment.ammo, tower.equipment.jewellery]) {
    const effect = item?.gearEffect;
    if (!effect) continue;
    if (effect === 'anti_tank') {
      const t = Math.max(0, Math.min(1, (enemy.maxHp - 40) / 1960)); // 40..2000 HP → 0..1
      mult *= 1 + 0.5 * t;
    } else if (effect === 'slayer_bane') {
      mult *= slayerWeaponBonus(enemy.type, taskType, !!enemy.isBoss);
    }
  }
  return mult;
}

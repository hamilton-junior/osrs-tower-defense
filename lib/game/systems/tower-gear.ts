import type { Item, Tower, TowerType, WeaponClass, Enemy } from '../types';
import { TOWER_STYLES } from '../data/towers';
import { towerCombatLevel } from './tower-xp';
import { slayerWeaponBonus } from './tower-identity';
import { GEAR_POOL } from '../data/gear';

/** The weapon family a tower type wields. Single source of truth for the weapon
 *  slot's class gate. */
export function weaponClassFor(type: TowerType): WeaponClass {
  switch (type) {
    case 'tzhaar': return 'maul';
    case 'slayer': return 'scimitar';
    case 'archer': return 'bow';
    case 'toxic': return 'blowpipe';
    case 'cannon': return 'cannonball';
    case 'wizard': return 'staff';
    // No other tower types exist; default keeps the switch total.
    default: return 'scimitar';
  }
}

export type EquipCheck = { ok: true } | { ok: false; reason: 'style' | 'class' | 'level' };

/** Whether `tower` may equip `gear`. Weapons must match the tower's style and
 *  weapon class; accessories are universal. Both require the tower's combat level
 *  (in its style skill) to meet `levelReq`. Slot routing (weapon vs accessory) is
 *  the caller's job — this checks compatibility only. */
export function canEquip(tower: Pick<Tower, 'type' | 'skills'>, gear: Item): EquipCheck {
  const style = TOWER_STYLES[tower.type].style;
  if (gear.type === 'weapon') {
    if (gear.style && gear.style !== style) return { ok: false, reason: 'style' };
    if (gear.weaponClass && gear.weaponClass !== weaponClassFor(tower.type)) return { ok: false, reason: 'class' };
  }
  if (towerCombatLevel(tower) < (gear.levelReq ?? 1)) return { ok: false, reason: 'level' };
  return { ok: true };
}

export interface GearDropContext {
  wave: number;
  isBoss: boolean;
}

/** The highest common `levelReq` allowed to drop at this wave — mirrors the
 *  wave-capped weapon tier of the legacy loot roll (wave / 3, floored). */
function commonLevelCap(wave: number): number {
  return Math.max(1, Math.floor(wave / 3) + 1);
}

/**
 * Roll gear drops for one kill (Classic only — the engine gates the call).
 * Consumes `rng` in a fixed order: common-weapon gate+pick, accessory gate+pick,
 * then a boss-only signature gate+pick. Common weapons are capped by wave so a
 * dragon scimitar can't fall on wave 1. Returns the pieces that landed.
 */
export function rollGearDrops(ctx: GearDropContext, rng: () => number = Math.random): Item[] {
  const out: Item[] = [];
  const cap = commonLevelCap(ctx.wave);
  const pick = (pool: Item[]) => pool.length ? pool[Math.floor(rng() * pool.length)] : null;

  // Common weapon — rare, wave-capped.
  if (rng() < 0.02) {
    const p = pick(GEAR_POOL.filter(g => g.type === 'weapon' && g.rarity === 'common' && (g.levelReq ?? 1) <= cap));
    if (p) out.push(p);
  }
  // Accessory — rarer.
  if (rng() < 0.01) {
    const p = pick(GEAR_POOL.filter(g => g.type === 'accessory' && (g.levelReq ?? 1) <= cap));
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
 * Per-target damage multiplier from an equipped signature weapon (1 when none).
 *  - twisted_bow: climbs with the target's max HP (anti-tank), 1.0 at ≤40 HP up
 *    to ~1.5 at very high HP.
 *  - darklight: the slayer weapon bonus vs the active task / superiors / bosses.
 * Pure — the engine multiplies a landed hit by this at the damage site.
 */
export function gearDamageMult(tower: Pick<Tower, 'equipment'>, enemy: Pick<Enemy, 'type' | 'maxHp' | 'isBoss'>, taskType: string | null): number {
  const effect = tower.equipment.weapon?.gearEffect;
  if (!effect) return 1;
  if (effect === 'twisted_bow') {
    const t = Math.max(0, Math.min(1, (enemy.maxHp - 40) / 1960)); // 40..2000 HP → 0..1
    return 1 + 0.5 * t;
  }
  if (effect === 'darklight') {
    return slayerWeaponBonus(enemy.type, taskType, !!enemy.isBoss);
  }
  return 1;
}

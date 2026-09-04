import type { Item, Tower, TowerType, AmmoClass, Enemy, MageMode, GearEffectId } from '../types';
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
  // A fusion consumes the ammo of the parent whose weapon it is.
  scorching_bow: 'arrows',
  venator_bow: 'arrows',
  noxious_halberd: 'melee_kit',
  purging_staff: 'runes',
  toxic_staff_of_the_dead: 'runes',
  eclipse_atlatl: 'darts',
};

/** Reader for `TOWER_AMMO_CLASS` (mirrors the old `weaponClassFor`). */
export function towerAmmoClassFor(type: TowerType): AmmoClass {
  return TOWER_AMMO_CLASS[type];
}

export type EquipCheck = { ok: true } | { ok: false; reason: 'class' | 'level' };

/** Whether `tower` may equip `gear`. Ammo must match the tower's ammo class
 *  (see `TOWER_AMMO_CLASS`); jewellery is universal. Both require the tower's
 *  combat level (in its style skill) to meet `levelReq`. Slot routing (ammo vs
 *  jewellery) is the caller's job — this checks compatibility only.
 *
 *  One exception rides on the wizard's spellbook: the Utility wizard never
 *  attacks, so runes would buy it damage it cannot deal. It takes jewellery
 *  only, which is where its XP/utility bonuses live anyway. */
export function canEquip(tower: Pick<Tower, 'type' | 'skills'> & { mageMode?: MageMode }, gear: Item): EquipCheck {
  if (gear.type === 'ammo' && tower.type === 'wizard' && tower.mageMode === 'utility') {
    return { ok: false, reason: 'class' };
  }
  if (gear.type === 'ammo' && gear.ammoClass !== towerAmmoClassFor(tower.type)) {
    return { ok: false, reason: 'class' };
  }
  if (towerCombatLevel(tower) < (gear.levelReq ?? 1)) return { ok: false, reason: 'level' };
  return { ok: true };
}

/** The stat keys a piece can carry — the whole of `Item.bonus`. */
const GEAR_STAT_KEYS = ['damage', 'damagePct', 'range', 'cooldown', 'xpBonus'] as const;

/**
 * Would `item` improve `tower`? True when the tower can equip it at all *and*
 * either the matching slot is empty or the piece beats what is worn on at least
 * one stat. Deliberately generous on mixed trades (more damage but less range
 * still counts): the player decides, this only hides pieces that improve
 * nothing anywhere.
 */
export function isUpgradeFor(tower: Pick<Tower, 'type' | 'skills' | 'equipment'> & { mageMode?: MageMode }, item: Item): boolean {
  if (!canEquip(tower, item).ok) return false;
  const worn = tower.equipment?.[item.type === 'ammo' ? 'ammo' : 'jewellery'];
  if (!worn) return true;
  return GEAR_STAT_KEYS.some((k) => (item.bonus[k] ?? 0) > (worn.bonus[k] ?? 0));
}

/** Whether any tower on the board would be improved by `item` — what the loot
 *  bag's "hide non-upgrades" filter asks of every piece. */
export function isUpgradeForAny(towers: readonly (Pick<Tower, 'type' | 'skills' | 'equipment'> & { mageMode?: MageMode })[], item: Item): boolean {
  return towers.some((t) => isUpgradeFor(t, item));
}

export interface GearDropContext {
  wave: number;
  isBoss: boolean;
  /** Multiplier on every drop chance below (1 = the ordinary rate). A Hunter
   *  catch is worth more than a kill, so it rolls with this above 1. */
  luck?: number;
}

/** The highest common `levelReq` allowed to drop at this wave: the gear ladder
 *  opens one tier per three waves (wave / 3, floored). */
function commonLevelCap(wave: number): number {
  return Math.max(1, Math.floor(wave / 3) + 1);
}

// The drop pools, split once at module load: `GEAR_POOL` never changes, so only
// the wave cap is worth re-testing per kill (this runs on every enemy death).
const COMMON_AMMO: readonly Item[] = GEAR_POOL.filter(g => g.type === 'ammo' && g.rarity === 'common');
const JEWELLERY: readonly Item[] = GEAR_POOL.filter(g => g.type === 'jewellery');
const SIGNATURES: readonly Item[] = GEAR_POOL.filter(g => g.rarity === 'signature');

/**
 * Roll gear drops for one kill (Classic only — the engine gates the call).
 * Consumes `rng` in a fixed order: common-ammo gate+pick, jewellery gate+pick,
 * then a boss-only signature gate+pick. Common ammo is capped by wave so a
 * top-tier piece can't fall on wave 1. `ctx.luck` scales every gate, so a better
 * roll is one number rather than a second pass — which also means it can never
 * hand out the same piece twice. Returns the pieces that landed.
 */
export function rollGearDrops(ctx: GearDropContext, rng: () => number = Math.random): Item[] {
  const out: Item[] = [];
  const cap = commonLevelCap(ctx.wave);
  const luck = Math.max(0, ctx.luck ?? 1);
  const pick = (pool: readonly Item[]) => pool.length ? pool[Math.floor(rng() * pool.length)] : null;
  const upTo = (pool: readonly Item[]) => pool.filter(g => (g.levelReq ?? 1) <= cap);

  // Common ammo — rare, wave-capped.
  if (rng() < 0.02 * luck) {
    const p = pick(upTo(COMMON_AMMO));
    if (p) out.push(p);
  }
  // Jewellery — rarer.
  if (rng() < 0.01 * luck) {
    const p = pick(upTo(JEWELLERY));
    if (p) out.push(p);
  }
  // Signature — bosses only.
  if (ctx.isBoss && rng() < 0.25 * luck) {
    const p = pick(SIGNATURES);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Per-target damage multiplier from every equipped signature piece (1 when
 * none), folded across both gear slots (ammo, jewellery) — a tower running two
 * signatures multiplies both:
 *  - blood_fury: climbs with the target's max HP, 1.0 at ≤40 HP up to ~1.5 at
 *    very high HP. Its other half — a life won back on a kill — isn't a damage
 *    question, so it lives at the kill site instead.
 *  - slayer_bane: the slayer weapon bonus vs the active task / superiors / bosses.
 *  - cc_breaker: nothing here. The Amulet of the damned buys no damage at all; it
 *    breaks what the target it hits can shrug off (see `markCcBreak`).
 * Pure — the engine multiplies a landed hit by this at the damage site.
 */
export function gearDamageMult(tower: Pick<Tower, 'equipment'>, enemy: Pick<Enemy, 'type' | 'maxHp' | 'isBoss'>, taskType: string | null): number {
  let mult = 1;
  for (const item of [tower.equipment.ammo, tower.equipment.jewellery]) {
    const effect = item?.gearEffect;
    if (!effect) continue;
    if (effect === 'blood_fury') {
      const t = Math.max(0, Math.min(1, (enemy.maxHp - 40) / 1960)); // 40..2000 HP → 0..1
      mult *= 1 + 0.5 * t;
    } else if (effect === 'slayer_bane') {
      mult *= slayerWeaponBonus(enemy.type, taskType, !!enemy.isBoss);
    }
  }
  return mult;
}

/**
 * Does `tower` wear a piece carrying `effect`, in either slot? The signatures that
 * aren't a damage rule — a life won back on a kill, a resistance broken on a hit —
 * ask this at their own site rather than riding the multiplier `gearDamageMult`
 * returns, which can only ever answer a damage question.
 */
export function wearsGearEffect(tower: Pick<Tower, 'equipment'>, effect: GearEffectId): boolean {
  return tower.equipment.ammo?.gearEffect === effect || tower.equipment.jewellery?.gearEffect === effect;
}

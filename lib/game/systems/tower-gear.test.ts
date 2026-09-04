import { describe, it, expect } from 'vitest';
import { TOWER_AMMO_CLASS, towerAmmoClassFor, canEquip, rollGearDrops, gearDamageMult, isUpgradeFor, isUpgradeForAny, wearsGearEffect } from './tower-gear';
import { GEAR } from '../data/gear';
import { CATCH_DROP_LUCK } from './hunter-traps';
import type { Tower, TowerSkill, Enemy, TowerType } from '../types';

const skill = (level: number): TowerSkill => ({ level, xp: 0 });
// minimal Tower stub; only fields the functions read matter
const tower = (over: Partial<Tower> = {}): Tower => ({
  type: 'slayer', skills: { strength: skill(50), ranged: skill(50), magic: skill(50) },
  equipment: { ammo: null, jewellery: null },
  ...(over as object),
} as Tower);
const enemy = (over: Partial<Enemy> = {}): Enemy => ({ type: 'goblin', maxHp: 100, isBoss: false, ...(over as object) } as Enemy);

describe('TOWER_AMMO_CLASS / towerAmmoClassFor', () => {
  it('maps each tower type to its ammo class', () => {
    expect(towerAmmoClassFor('archer')).toBe('arrows');
    expect(towerAmmoClassFor('toxic')).toBe('darts');
    expect(towerAmmoClassFor('cannon')).toBe('cannonballs');
    expect(towerAmmoClassFor('wizard')).toBe('runes');
    expect(towerAmmoClassFor('tzhaar')).toBe('melee_kit');
    expect(towerAmmoClassFor('slayer')).toBe('melee_kit');
  });
  it('is exhaustive over every tower type', () => {
    const types: TowerType[] = ['archer', 'wizard', 'cannon', 'tzhaar', 'slayer', 'toxic'];
    for (const t of types) expect(TOWER_AMMO_CLASS[t]).toBeDefined();
  });
});

describe('canEquip', () => {
  it('accepts matching ammo at sufficient level', () => {
    expect(canEquip(tower({ type: 'slayer' }), GEAR.bronze_gloves)).toEqual({ ok: true });
  });
  it('rejects ammo of the wrong class', () => {
    // bronze_gloves is melee_kit; an archer needs arrows
    expect(canEquip(tower({ type: 'archer' }), GEAR.bronze_gloves)).toEqual({ ok: false, reason: 'class' });
  });
  it('rejects below the level requirement', () => {
    const t = tower({ type: 'archer', skills: { strength: skill(5), ranged: skill(5), magic: skill(5) } });
    expect(canEquip(t, GEAR.dragon_arrow)).toEqual({ ok: false, reason: 'level' }); // needs 44
  });
  it('accepts a universal jewellery piece on any tower at level', () => {
    expect(canEquip(tower({ type: 'wizard' }), GEAR.amulet_of_strength)).toEqual({ ok: true });
  });
  it('rejects jewellery below its level requirement', () => {
    const t = tower({ type: 'archer', skills: { strength: skill(5), ranged: skill(5), magic: skill(5) } });
    expect(canEquip(t, GEAR.salve_amulet_ei)).toEqual({ ok: false, reason: 'level' }); // needs 30
  });
  // The Utility wizard is support-only: runes would buy damage it never deals.
  it('rejects runes on a Utility wizard but keeps them on the other spellbooks', () => {
    expect(canEquip(tower({ type: 'wizard', mageMode: 'utility' }), GEAR.mind_rune)).toEqual({ ok: false, reason: 'class' });
    expect(canEquip(tower({ type: 'wizard', mageMode: 'elemental' }), GEAR.mind_rune)).toEqual({ ok: true });
    expect(canEquip(tower({ type: 'wizard', mageMode: 'ancients' }), GEAR.mind_rune)).toEqual({ ok: true });
  });
  it('still lets a Utility wizard wear jewellery', () => {
    expect(canEquip(tower({ type: 'wizard', mageMode: 'utility' }), GEAR.amulet_of_strength)).toEqual({ ok: true });
  });
});

describe('isUpgradeFor', () => {
  it('is true for an empty slot the tower can use', () => {
    expect(isUpgradeFor(tower({ type: 'slayer' }), GEAR.bronze_gloves)).toBe(true);
  });
  it('is false when the tower cannot equip it at all', () => {
    expect(isUpgradeFor(tower({ type: 'archer' }), GEAR.bronze_gloves)).toBe(false);
    const lowLevel = tower({ type: 'archer', skills: { strength: skill(5), ranged: skill(5), magic: skill(5) } });
    expect(isUpgradeFor(lowLevel, GEAR.dragon_arrow)).toBe(false);
  });
  it('is false when what is worn beats it on every stat', () => {
    const t = tower({ type: 'slayer', equipment: { ammo: GEAR.rune_gloves, jewellery: null } });
    expect(isUpgradeFor(t, GEAR.bronze_gloves)).toBe(false);
  });
  it('is true when it beats the worn piece on any stat', () => {
    const t = tower({ type: 'slayer', equipment: { ammo: GEAR.bronze_gloves, jewellery: null } });
    expect(isUpgradeFor(t, GEAR.rune_gloves)).toBe(true);
  });
  it('routes jewellery against the jewellery slot, not the ammo one', () => {
    const t = tower({ type: 'slayer', equipment: { ammo: GEAR.rune_gloves, jewellery: null } });
    expect(isUpgradeFor(t, GEAR.amulet_of_strength)).toBe(true);
  });
  it('asks the whole board, and is false with no towers at all', () => {
    const archer = tower({ type: 'archer' });
    const melee = tower({ type: 'slayer' });
    expect(isUpgradeForAny([archer], GEAR.bronze_gloves)).toBe(false);
    expect(isUpgradeForAny([archer, melee], GEAR.bronze_gloves)).toBe(true);
    expect(isUpgradeForAny([], GEAR.bronze_gloves)).toBe(false);
  });
});

describe('rollGearDrops', () => {
  it('returns nothing when every gate roll is high', () => {
    const rng = () => 0.99;
    expect(rollGearDrops({ wave: 30, isBoss: true }, rng)).toEqual([]);
  });
  it('drops a signature only from a boss', () => {
    // force the signature gate to pass, everything else to fail
    const seq = [0.999, 0.999, 0.0, 0.0]; let i = 0; const rng = () => seq[i++] ?? 0.99;
    const boss = rollGearDrops({ wave: 60, isBoss: true }, rng);
    expect(boss.some(g => g.rarity === 'signature')).toBe(true);
    const notBoss = rollGearDrops({ wave: 60, isBoss: false }, () => 0.0);
    expect(notBoss.some(g => g.rarity === 'signature')).toBe(false);
  });
  it('luck widens the gates — a roll that missed at 1x lands at 2x', () => {
    // 0.03 is past the 2% ammo gate and short of doubling it.
    const rng = () => 0.03;
    expect(rollGearDrops({ wave: 30, isBoss: false }, rng)).toEqual([]);
    const lucky = rollGearDrops({ wave: 30, isBoss: false, luck: CATCH_DROP_LUCK }, rng);
    expect(lucky.some(g => g.type === 'ammo')).toBe(true);
  });
  it('luck cannot hand out the same piece twice — it is one roll, not two', () => {
    const drops = rollGearDrops({ wave: 60, isBoss: false, luck: 10 }, () => 0);
    expect(new Set(drops.map(g => g.id)).size).toBe(drops.length);
  });
  it('never drops common gear whose levelReq exceeds the wave cap', () => {
    const drops = rollGearDrops({ wave: 1, isBoss: false }, () => 0.0);
    for (const g of drops) expect((g.levelReq ?? 1)).toBeLessThanOrEqual(3); // wave 1 cap
  });
});

describe('gearDamageMult', () => {
  it('is 1 with no signature gear equipped', () => {
    expect(gearDamageMult(tower({ type: 'archer' }), enemy(), null)).toBe(1);
  });
  it('blood_fury scales up against high-maxHp targets', () => {
    // every signature ships as jewellery-only content (see gear.ts), so blood_fury
    // is exercised via the jewellery slot here.
    const t = tower({ type: 'archer', equipment: { ammo: null, jewellery: GEAR.amulet_of_blood_fury } });
    expect(gearDamageMult(t, enemy({ maxHp: 40 }), null)).toBeCloseTo(1, 5);
    expect(gearDamageMult(t, enemy({ maxHp: 4000 }), null)).toBeGreaterThan(1.3);
  });
  it('slayer_bane rewards the active slayer task / superior / boss', () => {
    const t = tower({ type: 'slayer', equipment: { ammo: null, jewellery: GEAR.salve_amulet_ei } });
    expect(gearDamageMult(t, enemy({ type: 'goblin' }), 'goblin')).toBeGreaterThan(1);
    expect(gearDamageMult(t, enemy({ type: 'goblin' }), 'zombie')).toBe(1);
    expect(gearDamageMult(t, enemy({ isBoss: true }), null)).toBeGreaterThan(1);
  });
  it('folds both equipped slots multiplicatively', () => {
    // Real content only ships jewellery signatures (one slot), so this exercises
    // the generic per-slot fold with a synthetic ammo piece carrying a gearEffect
    // — gearDamageMult itself is slot-agnostic and should still multiply both.
    const furyAmmo = { ...GEAR.amulet_of_blood_fury, id: 'test_blood_fury_ammo', type: 'ammo' as const };
    const both = tower({ type: 'archer', equipment: { ammo: furyAmmo, jewellery: GEAR.salve_amulet_ei } });
    const ammoOnly = tower({ type: 'archer', equipment: { ammo: furyAmmo, jewellery: null } });
    const e = enemy({ maxHp: 4000, type: 'goblin' });
    expect(gearDamageMult(both, e, 'goblin')).toBeGreaterThan(gearDamageMult(ammoOnly, e, 'goblin'));
  });
});

describe('cc_breaker buys no damage', () => {
  // The Amulet of the damned pays entirely in broken resistance. If it ever starts
  // returning a multiplier here it is quietly a damage amulet too, and its stat line
  // stops being the whole story.
  it('leaves gearDamageMult at 1 against anything', () => {
    const t = tower({ type: 'wizard', equipment: { ammo: null, jewellery: GEAR.amulet_of_the_damned } });
    expect(gearDamageMult(t, enemy({ maxHp: 4000 }), null)).toBe(1);
    expect(gearDamageMult(t, enemy({ type: 'goblin', isBoss: true }), 'goblin')).toBe(1);
  });
});

describe('wearsGearEffect', () => {
  const damned = GEAR.amulet_of_the_damned;
  it('finds the effect in either slot', () => {
    expect(wearsGearEffect(tower({ equipment: { ammo: null, jewellery: damned } }), 'cc_breaker')).toBe(true);
    expect(wearsGearEffect(tower({ equipment: { ammo: damned, jewellery: null } }), 'cc_breaker')).toBe(true);
  });

  it('is false for an empty tower, and for a signature carrying a different effect', () => {
    expect(wearsGearEffect(tower(), 'cc_breaker')).toBe(false);
    const fury = tower({ equipment: { ammo: null, jewellery: GEAR.amulet_of_blood_fury } });
    expect(wearsGearEffect(fury, 'cc_breaker')).toBe(false);
    expect(wearsGearEffect(fury, 'blood_fury')).toBe(true);
  });

  it('is false for ordinary gear, which carries no effect at all', () => {
    expect(wearsGearEffect(tower({ equipment: { ammo: null, jewellery: GEAR.amulet_of_glory } }), 'blood_fury')).toBe(false);
  });
});

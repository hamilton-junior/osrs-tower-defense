import { describe, it, expect } from 'vitest';
import { TOWER_AMMO_CLASS, towerAmmoClassFor, canEquip, rollGearDrops, gearDamageMult } from './tower-gear';
import { GEAR } from '../data/gear';
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
    expect(canEquip(tower({ type: 'slayer' }), GEAR.whetstone_kit_g)).toEqual({ ok: true });
  });
  it('rejects ammo of the wrong class', () => {
    // whetstone_kit_g is melee_kit; an archer needs arrows
    expect(canEquip(tower({ type: 'archer' }), GEAR.whetstone_kit_g)).toEqual({ ok: false, reason: 'class' });
  });
  it('rejects below the level requirement', () => {
    const t = tower({ type: 'archer', skills: { strength: skill(5), ranged: skill(5), magic: skill(5) } });
    expect(canEquip(t, GEAR.twisted_arrows_g)).toEqual({ ok: false, reason: 'level' }); // needs 40
  });
  it('accepts a universal jewellery piece on any tower at level', () => {
    expect(canEquip(tower({ type: 'wizard' }), GEAR.amulet_of_power_g)).toEqual({ ok: true });
  });
  it('rejects jewellery below its level requirement', () => {
    const t = tower({ type: 'archer', skills: { strength: skill(5), ranged: skill(5), magic: skill(5) } });
    expect(canEquip(t, GEAR.bane_amulet_g)).toEqual({ ok: false, reason: 'level' }); // needs 30
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
  it('never drops common gear whose levelReq exceeds the wave cap', () => {
    const drops = rollGearDrops({ wave: 1, isBoss: false }, () => 0.0);
    for (const g of drops) expect((g.levelReq ?? 1)).toBeLessThanOrEqual(3); // wave 1 cap
  });
});

describe('gearDamageMult', () => {
  it('is 1 with no signature gear equipped', () => {
    expect(gearDamageMult(tower({ type: 'archer' }), enemy(), null)).toBe(1);
  });
  it('anti_tank scales up against high-maxHp targets', () => {
    const t = tower({ type: 'archer', equipment: { ammo: GEAR.twisted_arrows_g, jewellery: null } });
    expect(gearDamageMult(t, enemy({ maxHp: 40 }), null)).toBeCloseTo(1, 5);
    expect(gearDamageMult(t, enemy({ maxHp: 4000 }), null)).toBeGreaterThan(1.3);
  });
  it('slayer_bane rewards the active slayer task / superior / boss', () => {
    const t = tower({ type: 'slayer', equipment: { ammo: null, jewellery: GEAR.bane_amulet_g } });
    expect(gearDamageMult(t, enemy({ type: 'goblin' }), 'goblin')).toBeGreaterThan(1);
    expect(gearDamageMult(t, enemy({ type: 'goblin' }), 'zombie')).toBe(1);
    expect(gearDamageMult(t, enemy({ isBoss: true }), null)).toBeGreaterThan(1);
  });
  it('folds both equipped slots multiplicatively', () => {
    const both = tower({ type: 'archer', equipment: { ammo: GEAR.twisted_arrows_g, jewellery: GEAR.bane_amulet_g } });
    const ammoOnly = tower({ type: 'archer', equipment: { ammo: GEAR.twisted_arrows_g, jewellery: null } });
    const e = enemy({ maxHp: 4000, type: 'goblin' });
    expect(gearDamageMult(both, e, 'goblin')).toBeGreaterThan(gearDamageMult(ammoOnly, e, 'goblin'));
  });
});

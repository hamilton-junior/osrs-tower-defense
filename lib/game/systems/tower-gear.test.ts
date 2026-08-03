import { describe, it, expect } from 'vitest';
import { weaponClassFor, canEquip, rollGearDrops, gearDamageMult } from './tower-gear';
import { GEAR } from '../data/gear';
import type { Tower, TowerSkill, Enemy } from '../types';

const skill = (level: number): TowerSkill => ({ level, xp: 0 });
// minimal Tower stub; only fields the functions read matter
const tower = (over: Partial<Tower> = {}): Tower => ({
  type: 'slayer', skills: { strength: skill(50), ranged: skill(50), magic: skill(50) },
  equipment: { weapon: null, shield: null, accessory: null },
  ...(over as object),
} as Tower);
const enemy = (over: Partial<Enemy> = {}): Enemy => ({ type: 'goblin', maxHp: 100, isBoss: false, ...(over as object) } as Enemy);

describe('weaponClassFor', () => {
  it('maps each tower type to its weapon family', () => {
    expect(weaponClassFor('slayer')).toBe('scimitar');
    expect(weaponClassFor('tzhaar')).toBe('maul');
    expect(weaponClassFor('archer')).toBe('bow');
    expect(weaponClassFor('toxic')).toBe('blowpipe');
    expect(weaponClassFor('cannon')).toBe('cannonball');
    expect(weaponClassFor('wizard')).toBe('staff');
  });
});

describe('canEquip', () => {
  it('accepts a matching weapon at sufficient level', () => {
    expect(canEquip(tower({ type: 'slayer' }), GEAR.rune_scimitar_g)).toEqual({ ok: true });
  });
  it('rejects a wrong weapon class (same style, different class)', () => {
    // granite_maul_g is melee/maul; a slayer is melee/scimitar → passes style, fails class
    expect(canEquip(tower({ type: 'slayer' }), GEAR.granite_maul_g)).toEqual({ ok: false, reason: 'class' });
  });
  it('rejects a wrong style before class (a defensive belt-and-braces check)', () => {
    // shortbow is ranged; a melee tower fails on style
    expect(canEquip(tower({ type: 'tzhaar' }), GEAR.shortbow_g).ok).toBe(false);
  });
  it('rejects below the level requirement', () => {
    const t = tower({ type: 'slayer', skills: { strength: skill(5), ranged: skill(5), magic: skill(5) } });
    expect(canEquip(t, GEAR.rune_scimitar_g)).toEqual({ ok: false, reason: 'level' }); // needs 12
  });
  it('accepts a universal accessory on any tower at level', () => {
    expect(canEquip(tower({ type: 'wizard' }), GEAR.amulet_of_power_g)).toEqual({ ok: true });
  });
  it('rejects an accessory below its level requirement', () => {
    const t = tower({ type: 'archer', skills: { strength: skill(5), ranged: skill(5), magic: skill(5) } });
    expect(canEquip(t, GEAR.combat_bracelet_g)).toEqual({ ok: false, reason: 'level' }); // needs 15
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
  it('is 1 with no signature weapon', () => {
    expect(gearDamageMult(tower({ type: 'archer' }), enemy(), null)).toBe(1);
  });
  it('twisted bow scales up against high-maxHp targets', () => {
    const t = tower({ type: 'archer', equipment: { weapon: GEAR.twisted_bow_g, shield: null, accessory: null } });
    expect(gearDamageMult(t, enemy({ maxHp: 40 }), null)).toBeCloseTo(1, 5);
    expect(gearDamageMult(t, enemy({ maxHp: 4000 }), null)).toBeGreaterThan(1.3);
  });
  it('darklight rewards the active slayer task / superior / boss', () => {
    const t = tower({ type: 'slayer', equipment: { weapon: GEAR.darklight_g, shield: null, accessory: null } });
    expect(gearDamageMult(t, enemy({ type: 'goblin' }), 'goblin')).toBeGreaterThan(1);
    expect(gearDamageMult(t, enemy({ type: 'goblin' }), 'zombie')).toBe(1);
    expect(gearDamageMult(t, enemy({ isBoss: true }), null)).toBeGreaterThan(1);
  });
});

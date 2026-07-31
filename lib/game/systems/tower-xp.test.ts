import { describe, it, expect } from 'vitest';
import {
  styleSkillKey, xpFromHit, trainSkill, levelStatBonus,
  tierUnlockLevel, towerCombatLevel, tierGateFor,
  XP_WEAKNESS_BONUS, PER_LEVEL_CAP, MAX_TOWER_LEVEL,
} from './tower-xp';
import { towerXpForLevel } from './leveling';
import type { Tower, TowerSkill } from '../types';

const skill = (level: number, xp = 0): TowerSkill => ({ level, xp });

// Minimal tower shape the gate/level helpers read.
const twr = (over: Partial<Pick<Tower, 'type' | 'level' | 'maxLevel' | 'skills'>> = {}) => ({
  type: 'archer' as const, level: 1, maxLevel: 4,
  skills: { strength: skill(1), ranged: skill(1), magic: skill(1) },
  ...over,
});

describe('styleSkillKey', () => {
  it('maps each style to its skill', () => {
    expect(styleSkillKey('melee')).toBe('strength');
    expect(styleSkillKey('ranged')).toBe('ranged');
    expect(styleSkillKey('magic')).toBe('magic');
  });
});

describe('xpFromHit', () => {
  it('is proportional to damage dealt', () => {
    expect(xpFromHit(40, false)).toBe(40);
  });
  it('applies the weakness bonus only when the weakness was exploited', () => {
    expect(xpFromHit(40, true)).toBe(40 * XP_WEAKNESS_BONUS);
  });
  it('grants nothing for a zero/absorbed hit', () => {
    expect(xpFromHit(0, true)).toBe(0);
    expect(xpFromHit(-5, false)).toBe(0);
  });
});

describe('trainSkill', () => {
  it('adds xp without levelling below the threshold', () => {
    const r = trainSkill(skill(1, 0), 10); // L1 needs towerXpForLevel(1)=80
    expect(r).toEqual({ level: 1, xp: 10, leveledUp: false });
  });
  it('levels up and carries the remainder', () => {
    const need = towerXpForLevel(1); // 80
    const r = trainSkill(skill(1, 0), need + 5);
    expect(r).toEqual({ level: 2, xp: 5, leveledUp: true });
  });
  it('crosses several levels in one big gain', () => {
    const gain = towerXpForLevel(1) + towerXpForLevel(2) + towerXpForLevel(3) + 1;
    const r = trainSkill(skill(1, 0), gain);
    expect(r.level).toBe(4);
    expect(r.xp).toBe(1);
    expect(r.leveledUp).toBe(true);
  });
  it('caps at MAX_TOWER_LEVEL and clamps leftover xp to 0', () => {
    const r = trainSkill(skill(MAX_TOWER_LEVEL, 0), 1_000_000_000);
    expect(r.level).toBe(MAX_TOWER_LEVEL);
    expect(r.xp).toBe(0);
  });
});

describe('levelStatBonus', () => {
  it('is 1.0 at level 1', () => {
    expect(levelStatBonus(1)).toBe(1);
  });
  it('grows and saturates at the cap', () => {
    expect(levelStatBonus(11)).toBeCloseTo(1.1);
    expect(levelStatBonus(9999)).toBe(PER_LEVEL_CAP);
  });
});

describe('tier gate', () => {
  it('reports the level required for the next tier', () => {
    expect(tierUnlockLevel(2)).toBe(3);
    expect(tierUnlockLevel(3)).toBe(8);
    expect(tierUnlockLevel(4)).toBe(15);
  });
  it('reads the combat level off the tower style skill', () => {
    expect(towerCombatLevel(twr({ skills: { strength: skill(1), ranged: skill(7), magic: skill(1) } }))).toBe(7);
  });
  it('blocks the next tier below the threshold with the needed level', () => {
    const g = tierGateFor(twr({ level: 1 })); // needs L3, tower at L1
    expect(g).toEqual({ ok: false, neededLevel: 3 });
  });
  it('opens exactly at the threshold', () => {
    const g = tierGateFor(twr({ level: 1, skills: { strength: skill(1), ranged: skill(3), magic: skill(1) } }));
    expect(g).toEqual({ ok: true, neededLevel: 3 });
  });
  it('is closed at max tier', () => {
    const g = tierGateFor(twr({ level: 4, skills: { strength: skill(1), ranged: skill(99), magic: skill(1) } }));
    expect(g.ok).toBe(false);
  });
});

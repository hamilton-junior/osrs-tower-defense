import { describe, it, expect } from 'vitest';
import {
  HERBLORE_MAX_LEVEL,
  HERBLORE_START_LEVEL,
  brewBlocker,
  drinkPotion,
  emptyPouch,
  emptyStock,
  gainHerbloreXp,
  heldHerbs,
  herbloreXpForLevel,
  potionLivesOnClear,
  potionPrayerDrainMult,
  potionTowerMods,
  potionUnlocked,
  potionsSteady,
  potionsUnlockedAt,
  pouringPotion,
  steadyPotion,
  tickPotions,
  brewDamageMult,
  type ActivePotion,
} from './herblore';
import { POTIONS, POTION_BY_ID } from '../data/herblore';
import { SEED_BY_ID } from '../data/farming';

/** Total XP to climb from `from` to `to` — what a player actually has to brew. */
function xpBetween(from: number, to: number): number {
  let total = 0;
  for (let lv = from; lv < to; lv++) total += herbloreXpForLevel(lv);
  return total;
}

describe('the ladder', () => {
  it('pairs every potion with an ingredient the run can actually get', () => {
    for (const p of POTIONS) {
      if (p.herb) expect(SEED_BY_ID[p.herb], `${p.id} names no real herb`).toBeDefined();
      if (p.potionInput) expect(POTION_BY_ID[p.potionInput], `${p.id} brews from nothing`).toBeDefined();
      expect(!!p.herb || !!p.potionInput, `${p.id} needs no ingredient`).toBe(true);
    }
  });

  it('brews a potion out of a potion only from a rung below it', () => {
    // A Sanfew serum wants a Super restore, a Super combat a Super strength. Both
    // bases have to be reachable first, or the bench offers a recipe nobody can make.
    for (const p of POTIONS) {
      if (!p.potionInput) continue;
      expect(POTION_BY_ID[p.potionInput].level, `${p.id} outranks its base`).toBeLessThan(p.level);
    }
  });

  it('gates in the order it grows', () => {
    // Levels climb. XP does not: the numbers are OSRS's own, and a Bastion pays less
    // than a Zamorak brew even though it comes later.
    const levels = POTIONS.map(p => p.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it('lasts longer than the raw herb it was brewed from', () => {
    // The whole trade: a herb buffs one wave, a potion buffs several. The two that
    // do their job on the way down are the exception, and say so with zero waves.
    for (const p of POTIONS) {
      if (p.waves === 0) continue;
      expect(p.waves, `${p.id} is worth no more than its herb`).toBeGreaterThan(1);
    }
    expect(POTION_BY_ID.restore.waves).toBe(0);
    expect(POTION_BY_ID.brew.waves).toBe(0);
  });

  it('opens the run exactly one potion wide', () => {
    const open = potionsUnlockedAt(HERBLORE_START_LEVEL);
    expect(open.map(p => p.id)).toEqual(['attack']);
    expect(potionUnlocked('antidote', HERBLORE_START_LEVEL)).toBe(false);
  });
});

describe('the level curve', () => {
  it('costs a flat ten through the early levels', () => {
    expect(herbloreXpForLevel(1)).toBe(10);
    expect(herbloreXpForLevel(27)).toBe(10);
    expect(herbloreXpForLevel(40)).toBeGreaterThan(10);
  });

  it('rises with every level', () => {
    for (let lv = 27; lv < 99; lv++) {
      expect(herbloreXpForLevel(lv + 1)).toBeGreaterThanOrEqual(herbloreXpForLevel(lv));
    }
  });

  it('hands the Antidote over for a single Attack potion', () => {
    // Level 3 → 5 must cost less than one brew, so the bench teaches itself.
    expect(xpBetween(HERBLORE_START_LEVEL, 5)).toBeLessThanOrEqual(POTION_BY_ID.attack.xp);
  });

  it('asks for a run’s worth of brewing to reach the top of the ladder', () => {
    const total = xpBetween(HERBLORE_START_LEVEL, POTION_BY_ID.super_combat.level);
    expect(total).toBe(5016);
    // Roughly forty brews at the ladder's own rates — a run, not an afternoon.
    const perBrew = (POTION_BY_ID.attack.xp + POTION_BY_ID.prayer_regen.xp + POTION_BY_ID.restore.xp) / 3;
    expect(total / perBrew).toBeGreaterThan(15);
    expect(total / perBrew).toBeLessThan(80);
  });

  it('banks a brew across as many levels as it reaches', () => {
    const g = gainHerbloreXp(3, 0, 100);
    expect(g.level).toBeGreaterThan(3);
    expect(g.levels).toBe(g.level - 3);
    expect(g.xp).toBeLessThan(herbloreXpForLevel(g.level));
  });

  it('stops dead at the ceiling', () => {
    const g = gainHerbloreXp(HERBLORE_MAX_LEVEL, 0, 99999);
    expect(g.level).toBe(HERBLORE_MAX_LEVEL);
    expect(g.xp).toBe(0);
    expect(g.levels).toBe(0);
  });
});

describe('the bench', () => {
  it('names the first wall it hits, in the order a player hits them', () => {
    const def = POTION_BY_ID.magic;
    const pouch = emptyPouch();
    const stock = emptyStock();
    expect(brewBlocker(def, 1, pouch, stock, 99999)).toBe('level');
    expect(brewBlocker(def, def.level, pouch, stock, 99999)).toBe('herb');
    pouch.lantadyme = 1;
    expect(brewBlocker(def, def.level, pouch, stock, 0)).toBe('gold');
    expect(brewBlocker(def, def.level, pouch, stock, def.cost)).toBeNull();
  });

  it('asks for the base potion where a herb alone brews nothing', () => {
    const def = POTION_BY_ID.sanfew;
    const pouch = emptyPouch();
    const stock = emptyStock();
    expect(brewBlocker(def, def.level, pouch, stock, 99999)).toBe('potion');
    stock.restore = 1;
    expect(brewBlocker(def, def.level, pouch, stock, 99999)).toBeNull();
  });

  it('asks for both where a recipe wants a herb and a potion', () => {
    const def = POTION_BY_ID.super_combat;
    const pouch = emptyPouch();
    const stock = emptyStock();
    expect(brewBlocker(def, def.level, pouch, stock, 99999)).toBe('herb');
    pouch.torstol = 1;
    expect(brewBlocker(def, def.level, pouch, stock, 99999)).toBe('potion');
    stock.super_strength = 1;
    expect(brewBlocker(def, def.level, pouch, stock, 99999)).toBeNull();
  });

  it('lists only the stacks that are actually held', () => {
    const pouch = emptyPouch();
    expect(heldHerbs(pouch)).toEqual([]);
    pouch.torstol = 2;
    expect(heldHerbs(pouch)).toEqual([{ seedId: 'torstol', count: 2 }]);
  });

  it('starts both counters empty', () => {
    expect(Object.values(emptyPouch()).every(n => n === 0)).toBe(true);
    expect(Object.values(emptyStock()).every(n => n === 0)).toBe(true);
  });
});

describe('what is up', () => {
  it('refreshes a second dose instead of stacking it', () => {
    const def = POTION_BY_ID.attack;
    let active = drinkPotion([], def);
    active = tickPotions(active);
    expect(active[0].wavesLeft).toBe(def.waves - 1);
    active = drinkPotion(active, def);
    expect(active).toHaveLength(1);
    expect(active[0].wavesLeft).toBe(def.waves);
  });

  it('runs out after exactly the waves it promised', () => {
    const def = POTION_BY_ID.zamorak;
    let active: ActivePotion[] = drinkPotion([], def);
    for (let i = 0; i < def.waves - 1; i++) active = tickPotions(active);
    expect(active).toHaveLength(1);
    expect(tickPotions(active)).toEqual([]);
  });

  it('stacks two melee potions on the melee towers and nowhere else', () => {
    const s = POTION_BY_ID.strength;
    const z = POTION_BY_ID.zamorak;
    const mods = potionTowerMods(drinkPotion(drinkPotion([], s), z));
    expect(mods.damage.melee).toBeCloseTo(1.25 * 1.6);
    expect(mods.damage.ranged).toBe(1);
    expect(mods.damage.magic).toBe(1);
  });

  it('keeps a Ranging potion off the wizards and a Magic potion off the rangers', () => {
    const r = potionTowerMods(drinkPotion([], POTION_BY_ID.ranging));
    expect(r.damage.ranged).toBeCloseTo(1.4);
    expect(r.damage.magic).toBe(1);
    const m = potionTowerMods(drinkPotion([], POTION_BY_ID.magic));
    expect(m.damage.magic).toBeCloseTo(1.4);
    expect(m.damage.ranged).toBe(1);
  });

  it('lifts every style for a potion that names none', () => {
    const mods = potionTowerMods(drinkPotion([], POTION_BY_ID.energy));
    expect(mods.fireRate).toEqual({ melee: 1.12, ranged: 1.12, magic: 1.12 });
    expect(mods.damage).toEqual({ melee: 1, ranged: 1, magic: 1 });
  });

  it('carries two stats at once where a potion has two', () => {
    const mods = potionTowerMods(drinkPotion([], POTION_BY_ID.bastion));
    expect(mods.damage.ranged).toBeCloseTo(1.45);
    expect(mods.range.ranged).toBeCloseTo(1.2);
    expect(mods.range.melee).toBe(1);
  });

  it('slows the prayer drain and never below nothing', () => {
    const def = POTION_BY_ID.prayer_regen;
    expect(potionPrayerDrainMult([])).toBe(1);
    expect(potionPrayerDrainMult(drinkPotion([], def))).toBeCloseTo(0.6);
    expect(potionPrayerDrainMult(drinkPotion([], def))).toBeGreaterThanOrEqual(0);
  });

  it('hands a life back every wave a Sanfew serum is up, and names itself', () => {
    expect(potionLivesOnClear([])).toBe(0);
    expect(pouringPotion([])).toBeNull();
    const active = drinkPotion([], POTION_BY_ID.sanfew);
    expect(potionLivesOnClear(active)).toBe(1);
    expect(pouringPotion(active)?.id).toBe('sanfew');
  });

  it('holds the towers up only while an Antidote is up', () => {
    expect(potionsSteady([])).toBe(false);
    expect(potionsSteady(drinkPotion([], POTION_BY_ID.attack))).toBe(false);
    const anti = drinkPotion([], POTION_BY_ID.antidote);
    expect(potionsSteady(anti)).toBe(true);
    expect(steadyPotion(anti)?.id).toBe('antidote');
    let active = anti;
    for (let i = 0; i < POTION_BY_ID.antidote.waves; i++) active = tickPotions(active);
    expect(potionsSteady(active)).toBe(false);
  });
});

describe('the brew debt', () => {
  it('costs nothing until a brew is drunk', () => {
    expect(brewDamageMult(0)).toBe(1);
    expect(brewDamageMult(-3)).toBe(1);
  });

  it('takes a bite per brew, and compounds', () => {
    expect(brewDamageMult(1)).toBeCloseTo(0.92);
    expect(brewDamageMult(2)).toBeCloseTo(0.92 * 0.92);
    expect(brewDamageMult(3)).toBeLessThan(brewDamageMult(2));
  });

  it('never takes the towers down to nothing', () => {
    // A player who drinks brew after brew keeps paying, and keeps shooting.
    expect(brewDamageMult(50)).toBeGreaterThan(0);
  });
});

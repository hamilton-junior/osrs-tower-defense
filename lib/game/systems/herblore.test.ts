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
  tickPotions,
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
  it('pairs every potion with a herb the run can actually grow', () => {
    for (const p of POTIONS) expect(SEED_BY_ID[p.herb]).toBeDefined();
  });

  it('gates in the same order it grows', () => {
    const levels = POTIONS.map(p => p.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    const xp = POTIONS.map(p => p.xp);
    expect([...xp].sort((a, b) => a - b)).toEqual(xp);
  });

  it('lasts longer than the raw herb it was brewed from', () => {
    // The whole trade: a herb buffs one wave, a potion buffs several.
    for (const p of POTIONS) expect(p.waves).toBeGreaterThan(1);
  });

  it('opens the run exactly one potion wide', () => {
    const open = potionsUnlockedAt(HERBLORE_START_LEVEL);
    expect(open.map(p => p.id)).toEqual(['attack']);
    expect(potionUnlocked('antipoison', HERBLORE_START_LEVEL)).toBe(false);
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

  it('hands Antipoison over for a single Attack potion', () => {
    // Level 3 → 5 must cost less than one brew, so the bench teaches itself.
    expect(xpBetween(HERBLORE_START_LEVEL, 5)).toBeLessThanOrEqual(POTION_BY_ID.attack.xp);
  });

  it('asks for a run’s worth of brewing to reach the top of the ladder', () => {
    const total = xpBetween(HERBLORE_START_LEVEL, POTION_BY_ID.zamorak.level);
    expect(total).toBeGreaterThan(2000);
    expect(total).toBeLessThan(4500);
    // Roughly thirty brews at the ladder's own rates — a run, not an afternoon.
    const perBrew = (POTION_BY_ID.attack.xp + POTION_BY_ID.prayer.xp + POTION_BY_ID.restore.xp) / 3;
    expect(total / perBrew).toBeGreaterThan(15);
    expect(total / perBrew).toBeLessThan(60);
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
    const def = POTION_BY_ID.prayer;
    const pouch = emptyPouch();
    expect(brewBlocker(def, 1, pouch, 99999)).toBe('level');
    expect(brewBlocker(def, def.level, pouch, 99999)).toBe('herb');
    pouch.ranarr = 1;
    expect(brewBlocker(def, def.level, pouch, 0)).toBe('gold');
    expect(brewBlocker(def, def.level, pouch, def.secondary.cost)).toBeNull();
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

  it('multiplies the two damage potions together', () => {
    const a = POTION_BY_ID.attack;
    const z = POTION_BY_ID.zamorak;
    const active = drinkPotion(drinkPotion([], a), z);
    expect(potionTowerMods(active).damage).toBeCloseTo((1 + a.amount) * (1 + z.amount));
    // Range and fire rate are the herbs' half of the split — no potion touches them.
    expect(potionTowerMods(active).range).toBe(1);
    expect(potionTowerMods(active).fireRate).toBe(1);
  });

  it('slows the prayer drain and never below nothing', () => {
    const def = POTION_BY_ID.prayer;
    expect(potionPrayerDrainMult([])).toBe(1);
    expect(potionPrayerDrainMult(drinkPotion([], def))).toBeCloseTo(1 - def.amount);
    expect(potionPrayerDrainMult(drinkPotion([], def))).toBeGreaterThanOrEqual(0);
  });

  it('hands a life back every wave a Super restore is up', () => {
    expect(potionLivesOnClear([])).toBe(0);
    expect(potionLivesOnClear(drinkPotion([], POTION_BY_ID.restore)))
      .toBe(POTION_BY_ID.restore.amount);
  });

  it('holds the towers up only while an Antipoison is up', () => {
    expect(potionsSteady([])).toBe(false);
    expect(potionsSteady(drinkPotion([], POTION_BY_ID.attack))).toBe(false);
    const anti = drinkPotion([], POTION_BY_ID.antipoison);
    expect(potionsSteady(anti)).toBe(true);
    let active = anti;
    for (let i = 0; i < POTION_BY_ID.antipoison.waves; i++) active = tickPotions(active);
    expect(potionsSteady(active)).toBe(false);
  });
});

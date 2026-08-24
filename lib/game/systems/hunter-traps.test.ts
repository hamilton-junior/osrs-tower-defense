import { describe, it, expect } from 'vitest';
import {
  HUNTER_MAX_LEVEL,
  TRAP_TRIGGER_RADIUS,
  canCatch,
  catchBonusGold,
  chinBlastDamage,
  enemiesInBlast,
  gainHunterXp,
  hunterXpForLevel,
  maxActiveTraps,
  snapTrapSpot,
  trapAtPoint,
  trapCost,
  trapSpotFree,
  trapTriggeredBy,
  trapUnlocked,
  trapsUnlockedAt,
} from './hunter-traps';
import { HUNTER_TRAPS, HUNTER_TRAP_BY_ID } from '../data/hunter-traps';

const GRID = 32;
/** A straight road across the middle. Its vertices sit on grid *lines*, the way
 *  `buildPath` snaps them — so the walking line runs along a tile edge, never
 *  through a tile centre. Traps have to land on that line. */
const ROAD = [
  { x: 0, y: 320 },
  { x: 1440, y: 320 },
];
/** The same road turned on its side, for the other axis. */
const ROAD_DOWN = [
  { x: 320, y: 0 },
  { x: 320, y: 640 },
];

/** Total XP to reach `level` from 1 — what a player actually has to earn. */
function xpTo(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += hunterXpForLevel(l);
  return total;
}

describe('the trap ladder', () => {
  it('is the real OSRS one: five distinct levels, in order', () => {
    const levels = HUNTER_TRAPS.map(t => t.level);
    expect(levels).toEqual([1, 27, 53, 63, 71]);
    expect(new Set(levels).size).toBe(levels.length);
  });

  it('never asks for a level the run cannot reach', () => {
    for (const t of HUNTER_TRAPS) expect(t.level).toBeLessThanOrEqual(HUNTER_MAX_LEVEL);
  });

  it('pays more for the harder catch', () => {
    const xp = HUNTER_TRAPS.map(t => t.xp);
    for (let i = 1; i < xp.length; i++) expect(xp[i]).toBeGreaterThan(xp[i - 1]);
  });

  it('opens one rung at a time', () => {
    expect(trapsUnlockedAt(1).map(t => t.id)).toEqual(['bird_snare']);
    expect(trapsUnlockedAt(26).map(t => t.id)).toEqual(['bird_snare']);
    expect(trapsUnlockedAt(27).map(t => t.id)).toEqual(['bird_snare', 'box_trap']);
    expect(trapsUnlockedAt(99)).toHaveLength(HUNTER_TRAPS.length);
    expect(trapUnlocked('magic_box', 70)).toBe(false);
    expect(trapUnlocked('magic_box', 71)).toBe(true);
  });
});

describe('the Hunter curve', () => {
  it('only ever gets steeper', () => {
    for (let l = 2; l < HUNTER_MAX_LEVEL; l++) {
      expect(hunterXpForLevel(l)).toBeGreaterThanOrEqual(hunterXpForLevel(l - 1));
    }
  });

  it('costs at least the floor, so the first levels fall in a couple of catches', () => {
    expect(hunterXpForLevel(1)).toBe(10);
    // One bird snare, three charges, 34 xp each: comfortably past the first few.
    expect(xpTo(5)).toBeLessThan(34 * 3);
  });

  it('puts the second trap slot within the run\'s first stretch', () => {
    // ~10 bird-snare catches — three or four snares' worth.
    expect(xpTo(20)).toBeLessThan(34 * 12);
  });

  it('keeps the top of the ladder as a run-long goal', () => {
    // The magic box has to stay something a player works toward all run, not a
    // wave-twenty purchase — but it must not need OSRS's own 814k either.
    expect(xpTo(71)).toBeGreaterThan(15_000);
    expect(xpTo(71)).toBeLessThan(40_000);
  });
});

describe('how many traps may be out', () => {
  it('follows the OSRS table exactly', () => {
    expect(maxActiveTraps(1)).toBe(1);
    expect(maxActiveTraps(19)).toBe(1);
    expect(maxActiveTraps(20)).toBe(2);
    expect(maxActiveTraps(39)).toBe(2);
    expect(maxActiveTraps(40)).toBe(3);
    expect(maxActiveTraps(60)).toBe(4);
    expect(maxActiveTraps(80)).toBe(5);
  });

  it('stops at five however high Hunter goes', () => {
    expect(maxActiveTraps(99)).toBe(5);
    expect(maxActiveTraps(9999)).toBe(5);
  });
});

describe('what a trap costs', () => {
  it('is the listed price on wave one', () => {
    expect(trapCost(HUNTER_TRAP_BY_ID.bird_snare, 1)).toBe(60);
  });

  it('climbs with the wave, so late gold cannot carpet the road', () => {
    const early = trapCost(HUNTER_TRAP_BY_ID.chinchompa, 1);
    const late = trapCost(HUNTER_TRAP_BY_ID.chinchompa, 60);
    expect(late).toBeGreaterThan(early * 2);
  });

  it('always lands on a round figure', () => {
    for (const t of HUNTER_TRAPS) {
      for (const w of [1, 7, 33, 90]) expect(trapCost(t, w) % 5).toBe(0);
    }
  });
});

describe('placing one', () => {
  it('lands the trap on the road, not on the tile beside it', () => {
    const spot = snapTrapSpot(500, 312, ROAD, GRID);
    expect(spot).toEqual({ x: 496, y: 320 });
  });

  it('accepts the whole width of the road, not just its centre-line', () => {
    expect(snapTrapSpot(500, 306, ROAD, GRID)).not.toBeNull();
    expect(snapTrapSpot(500, 334, ROAD, GRID)).not.toBeNull();
  });

  it('refuses anywhere off the road — a trap is not a tower', () => {
    expect(snapTrapSpot(500, 200, ROAD, GRID)).toBeNull();
    expect(snapTrapSpot(500, 600, ROAD, GRID)).toBeNull();
  });

  it('gives both sides of the road the same spot, so two cannot sit abreast', () => {
    // The bug this replaced: clicks either side of the walking line snapped to the
    // two different tile centres flanking it, so a stretch of road took two traps
    // and neither was under the feet meant to spring it.
    const above = snapTrapSpot(500, 308, ROAD, GRID)!;
    const below = snapTrapSpot(500, 332, ROAD, GRID)!;
    expect(above).toEqual(below);
    expect(trapSpotFree(below, [above], GRID)).toBe(false);
  });

  it('snaps along a north-south leg too', () => {
    expect(snapTrapSpot(312, 500, ROAD_DOWN, GRID)).toEqual({ x: 320, y: 496 });
  });

  it('never slides a trap off the end of the road', () => {
    expect(snapTrapSpot(1450, 320, ROAD, GRID)).toEqual({ x: 1440, y: 320 });
  });

  it('keeps one trap per tile', () => {
    const spot = { x: 496, y: 320 };
    expect(trapSpotFree(spot, [], GRID)).toBe(true);
    expect(trapSpotFree(spot, [{ x: 496, y: 320 }], GRID)).toBe(false);
    expect(trapSpotFree(spot, [{ x: 528, y: 320 }], GRID)).toBe(true);
  });

  it('is easy to pick back up', () => {
    const traps = [{ x: 496, y: 320 }];
    expect(trapAtPoint(traps, 500, 324, GRID)).toBe(traps[0]);
    expect(trapAtPoint(traps, 560, 320, GRID)).toBeNull();
  });
});

describe('setting one off', () => {
  const trap = { x: 100, y: 100, rearm: 0, charges: 2 };

  it('fires when something treads on it', () => {
    expect(trapTriggeredBy(trap, { x: 100, y: 100 })).toBe(true);
    expect(trapTriggeredBy(trap, { x: 100 + TRAP_TRIGGER_RADIUS - 1, y: 100 })).toBe(true);
  });

  it('ignores whatever walks past it', () => {
    expect(trapTriggeredBy(trap, { x: 100 + TRAP_TRIGGER_RADIUS + 2, y: 100 })).toBe(false);
  });

  it('will not fire while it is resetting, or once it is spent', () => {
    expect(trapTriggeredBy({ ...trap, rearm: 0.4 }, { x: 100, y: 100 })).toBe(false);
    expect(trapTriggeredBy({ ...trap, charges: 0 }, { x: 100, y: 100 })).toBe(false);
  });
});

describe('catching', () => {
  const box = HUNTER_TRAP_BY_ID.box_trap;

  it('takes what is already nearly dead', () => {
    expect(canCatch(box, { hp: 20, maxHp: 100 })).toBe(true);
  });

  it('is a finisher, not an answer — a healthy enemy walks over it', () => {
    expect(canCatch(box, { hp: 90, maxHp: 100 })).toBe(false);
    expect(canCatch(box, { hp: 31, maxHp: 100 })).toBe(false);
  });

  it('never takes a boss', () => {
    expect(canCatch(box, { hp: 1, maxHp: 100_000, isBoss: true })).toBe(false);
  });

  it('reaches further up the bar the further up the ladder it is', () => {
    expect(HUNTER_TRAP_BY_ID.magic_box.catchAt).toBeGreaterThan(box.catchAt);
    expect(canCatch(HUNTER_TRAP_BY_ID.magic_box, { hp: 40, maxHp: 100 })).toBe(true);
  });

  it('is not something a snare or a chinchompa does', () => {
    expect(canCatch(HUNTER_TRAP_BY_ID.bird_snare, { hp: 1, maxHp: 100 })).toBe(false);
    expect(canCatch(HUNTER_TRAP_BY_ID.chinchompa, { hp: 1, maxHp: 100 })).toBe(false);
  });

  it('pays more than the kill would have', () => {
    expect(catchBonusGold(box, 40)).toBeGreaterThan(0);
    expect(catchBonusGold(HUNTER_TRAP_BY_ID.chinchompa, 40)).toBe(0);
  });
});

describe('the chinchompa', () => {
  const grey = HUNTER_TRAP_BY_ID.chinchompa;
  const red = HUNTER_TRAP_BY_ID.red_chinchompa;

  it('hits everything standing in it', () => {
    const enemies = [
      { x: 100, y: 100 },
      { x: 150, y: 100 },
      { x: 400, y: 100 },
    ];
    expect(enemiesInBlast(grey, { x: 100, y: 100 }, enemies)).toHaveLength(2);
  });

  it('reaches further when it is red', () => {
    expect(red.radius).toBeGreaterThan(grey.radius);
  });

  it('does nothing at all for a trap that is not a chinchompa', () => {
    expect(enemiesInBlast(HUNTER_TRAP_BY_ID.box_trap, { x: 0, y: 0 }, [{ x: 0, y: 0 }])).toEqual([]);
    expect(chinBlastDamage(HUNTER_TRAP_BY_ID.box_trap, { maxHp: 500 })).toBe(0);
  });

  it('keeps up with the enemies it lands on', () => {
    expect(chinBlastDamage(grey, { maxHp: 2000 })).toBeGreaterThan(chinBlastDamage(grey, { maxHp: 200 }));
    expect(chinBlastDamage(red, { maxHp: 2000 })).toBeGreaterThan(chinBlastDamage(grey, { maxHp: 2000 }));
  });

  it('is capped, so it can never be an execute on something huge', () => {
    expect(chinBlastDamage(grey, { maxHp: 1_000_000 })).toBeLessThanOrEqual(900);
    expect(chinBlastDamage(red, { maxHp: 1_000_000 })).toBeLessThanOrEqual(1800);
  });

  it('is a nuisance to a boss, not a phase', () => {
    const boss = chinBlastDamage(red, { maxHp: 20_000, isBoss: true });
    const mob = chinBlastDamage(red, { maxHp: 20_000 });
    expect(boss).toBeLessThan(mob / 3);
    expect(boss).toBeGreaterThan(0);
  });
});

describe('banking the XP', () => {
  it('levels up when the bar fills', () => {
    const g = gainHunterXp(1, 0, hunterXpForLevel(1));
    expect(g.level).toBe(2);
    expect(g.levels).toBe(1);
    expect(g.xp).toBe(0);
  });

  it('crosses as many levels as the catch is worth — one catch can be several early levels', () => {
    const g = gainHunterXp(1, 0, 34);
    expect(g.level).toBeGreaterThan(2);
    expect(g.levels).toBe(g.level - 1);
  });

  it('keeps the remainder', () => {
    const g = gainHunterXp(30, 0, 5);
    expect(g.level).toBe(30);
    expect(g.xp).toBe(5);
  });

  it('never passes the cap, and stops banking there', () => {
    const g = gainHunterXp(HUNTER_MAX_LEVEL, 0, 999_999);
    expect(g.level).toBe(HUNTER_MAX_LEVEL);
    expect(g.xp).toBe(0);
    expect(g.levels).toBe(0);
  });

  it('shrugs off nonsense', () => {
    expect(gainHunterXp(0, -5, -10).level).toBe(1);
    expect(gainHunterXp(1, 0, 0)).toEqual({ level: 1, xp: 0, levels: 0 });
  });
});

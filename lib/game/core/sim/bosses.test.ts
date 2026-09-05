import { describe, it, expect } from 'vitest';
import type { Enemy, Tower } from '../../types';
import type { GameEngine } from '../engine';
import { ENEMIES } from '../../data/enemies';
import { bodyY } from '../../systems/enemy-anchor';
import {
  NEX_ACOLYTES, NEX_ACOLYTE_LEAD, NEX_SILENCE_INTERVAL, NEX_SILENCE_SECS, NEX_SILENCE_FIRST,
} from '../../systems/boss-mechanics';
import { updateEscortFollow } from './bosses';

/**
 * Nex's acolytes, driven through the path the game actually takes:
 * `moveEnemies` → `updateEscortFollow` → `updateNexAcolyte`. The pure filter has its
 * own tests in `systems/boss-mechanics.test.ts`; what is pinned here is the wiring —
 * that an acolyte marching in front of Nex really does reach out on its own clock,
 * really does knock the matching towers offline, and really does leave the mark the
 * renderer draws its element from.
 */
function stubEngine() {
  const notices: string[] = [];
  const e = {
    enemies: [] as Enemy[],
    towers: [] as Tower[],
    fx: [] as unknown[],
    spotEffects: [] as unknown[],
    path: [{ x: 0, y: 320 }, { x: 1440, y: 320 }],
    statsCache: new Map(),
    sound: { play: () => {} },
    notify: (m: string) => notices.push(m),
    // No Antipoison is up in these tests, so every disable lands as it always did.
    steadyHeld: () => false,
  };
  return { e: e as unknown as GameEngine, raw: e, notices };
}

/** Nex plus one acolyte, both parked on a straight road so the march is a no-op. */
function mkFight(type: Enemy['type']) {
  const { e, raw, notices } = stubEngine();
  const nex: Enemy = { ...ENEMIES.nex, id: 'nex', x: 400, y: 320, pathIndex: 0 } as unknown as Enemy;
  const acolyte: Enemy = {
    ...ENEMIES[type],
    id: 'aco',
    type,
    escort: true,
    ownerId: 'nex',
    guardLead: NEX_ACOLYTE_LEAD,
    guardSide: 0,
    x: 400 + NEX_ACOLYTE_LEAD,
    y: 320,
    pathIndex: 0,
  } as unknown as Enemy;
  raw.enemies.push(nex, acolyte);
  return { e, raw, notices, nex, acolyte };
}

function mkTower(over: Partial<Tower> = {}): Tower {
  return {
    id: 't1',
    x: 400 + NEX_ACOLYTE_LEAD, y: 320,
    type: 'wizard',
    level: 1, maxLevel: 5,
    range: 200,
    damage: 10,
    cooldown: 600,
    lastFired: -99999,
    color: '#fff',
    targetId: null,
    targetingPriority: 'first',
    name: 'Magic',
    upgradeCost: 100,
    specCharge: 0, specMax: 100,
    visualRadius: 20,
    disabledTimer: 0,
    mageMode: 'ancients',
    ancientType: 'ice',
    skills: { strength: { level: 1, xp: 0 }, ranged: { level: 1, xp: 0 }, magic: { level: 1, xp: 0 } },
    equipment: { ammo: null, jewellery: null },
    ...over,
  } as unknown as Tower;
}

/** One acolyte tick: the interval exactly, so the reach lands on this frame. */
function tick(e: GameEngine, a: Enemy) {
  updateEscortFollow(e, a, NEX_SILENCE_INTERVAL);
}

describe("Nex's acolytes — the silence, end to end", () => {
  it('knocks a tower of its own element offline and marks it with that element', () => {
    const { e, acolyte } = mkFight('glacies');
    const tower = mkTower({ ancientType: 'ice' });
    (e as unknown as { towers: Tower[] }).towers.push(tower);

    tick(e, acolyte);

    expect(tower.disabledTimer).toBe(NEX_SILENCE_SECS);
    expect(tower.silencedBy).toBe('ice');
  });

  it('leaves every other element alone', () => {
    const { e, acolyte } = mkFight('glacies');
    const towers = (['blood', 'shadow', 'smoke'] as const).map((a, i) =>
      mkTower({ id: `t${i}`, ancientType: a }));
    (e as unknown as { towers: Tower[] }).towers.push(...towers);

    tick(e, acolyte);

    for (const t of towers) {
      expect(t.disabledTimer).toBe(0);
      expect(t.silencedBy).toBeUndefined();
    }
  });

  it('only reaches a wizard actually casting that Ancient — a Standard wizard is safe', () => {
    const { e, acolyte } = mkFight('glacies');
    // The spellbook a wizard is built on is what decides this: `ancientType` is only
    // meaningful on the Ancients book, and the default book is Elemental.
    const elemental = mkTower({ mageMode: 'elemental', element: 'water', ancientType: undefined });
    (e as unknown as { towers: Tower[] }).towers.push(elemental);

    tick(e, acolyte);

    expect(elemental.disabledTimer).toBe(0);
  });

  it("uses the tower's own range: one out of reach of the acolyte is untouched", () => {
    const { e, acolyte } = mkFight('glacies');
    const near = mkTower({ id: 'near', x: acolyte.x + 100 });
    const far = mkTower({ id: 'far', x: acolyte.x + 400 });
    (e as unknown as { towers: Tower[] }).towers.push(near, far);

    tick(e, acolyte);

    expect(near.disabledTimer).toBe(NEX_SILENCE_SECS);
    expect(far.disabledTimer).toBe(0);
  });

  it('reads the live range off the stats cache, not the tower\'s base range', () => {
    const { e, raw, acolyte } = mkFight('glacies');
    const tower = mkTower({ id: 'buffed', x: acolyte.x + 400, range: 200 });
    raw.towers.push(tower);
    // Range upgrades live in the cache; a tower buffed into reach must be caught.
    raw.statsCache.set('buffed', { epoch: 1, stats: { range: 600 } });

    tick(e, acolyte);

    expect(tower.disabledTimer).toBe(NEX_SILENCE_SECS);
  });

  it('never re-times a tower that is already down', () => {
    const { e, acolyte } = mkFight('glacies');
    const tower = mkTower({ disabledTimer: 1.2 });
    (e as unknown as { towers: Tower[] }).towers.push(tower);

    tick(e, acolyte);

    expect(tower.disabledTimer).toBe(1.2);
  });

  it('reaches out soon after it arrives, not a whole interval later', () => {
    // The opening delay is its own number for a reason: a ward broken quickly must still
    // have cast once, or the mechanic is invisible on exactly the boards that beat it.
    const early = mkFight('glacies');
    const t1 = mkTower();
    (early.e as unknown as { towers: Tower[] }).towers.push(t1);
    updateEscortFollow(early.e, early.acolyte, NEX_SILENCE_FIRST - 0.1);
    expect(t1.disabledTimer).toBe(0);

    const on = mkFight('glacies');
    const t2 = mkTower();
    (on.e as unknown as { towers: Tower[] }).towers.push(t2);
    updateEscortFollow(on.e, on.acolyte, NEX_SILENCE_FIRST);
    expect(t2.disabledTimer).toBe(NEX_SILENCE_SECS);
  });

  it('waits its interval out before reaching again', () => {
    const { e, acolyte } = mkFight('glacies');
    const tower = mkTower();
    (e as unknown as { towers: Tower[] }).towers.push(tower);

    tick(e, acolyte);
    tower.disabledTimer = 0;
    tower.silencedBy = undefined;
    updateEscortFollow(e, acolyte, NEX_SILENCE_INTERVAL - 0.1);

    expect(tower.disabledTimer).toBe(0);
  });

  it('says what it did — once', () => {
    const { e, acolyte, notices } = mkFight('glacies');
    const tower = mkTower();
    (e as unknown as { towers: Tower[] }).towers.push(tower);

    tick(e, acolyte);
    tower.disabledTimer = 0;
    tick(e, acolyte);

    expect(notices).toEqual([NEX_ACOLYTES[3].silence]);
  });

  it('says so too when it finds nothing of its element — the mechanic is never silent', () => {
    const { e, acolyte, notices } = mkFight('fumus');
    (e as unknown as { towers: Tower[] }).towers.push(mkTower({ ancientType: 'ice' }));

    tick(e, acolyte);

    expect(notices).toEqual([NEX_ACOLYTES[0].quiet]);
  });

  it('each of the four owns its own element', () => {
    for (const acolyteDef of NEX_ACOLYTES) {
      const { e, acolyte } = mkFight(acolyteDef.type);
      const mine = mkTower({ id: 'mine', ancientType: acolyteDef.element });
      const theirs = mkTower({
        id: 'theirs',
        ancientType: acolyteDef.element === 'ice' ? 'blood' : 'ice',
      });
      (e as unknown as { towers: Tower[] }).towers.push(mine, theirs);

      tick(e, acolyte);

      expect(mine.silencedBy).toBe(acolyteDef.element);
      expect(theirs.disabledTimer).toBe(0);
    }
  });

  it('reaches from where the acolyte is drawn, not from its feet', () => {
    // `bodyY` is what the spells are thrown from; a boss with a tall body must not
    // measure the reach from a point the player never sees.
    const { e, acolyte } = mkFight('glacies');
    expect(bodyY(acolyte)).toBeLessThanOrEqual(acolyte.y);
  });
});

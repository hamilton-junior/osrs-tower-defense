import { describe, it, expect } from 'vitest';
import {
  FUSIONS, FUSION_COST, FUSION_UNLOCK_CA, FUSION_BLOCK_TEXT,
  areAdjacent, checkFusion, fusionDef, fusionFor, fusionOffersFor, isFusion,
  isFusionReady, mergeSkills, type FusionContext,
} from './tower-fusion';
import { TOWERS } from '../data/towers';
import type { Tower, TowerType } from '../types';

const GRID = 32;

function tower(id: string, type: TowerType, x: number, y: number, level?: number): Tower {
  const def = TOWERS[type];
  const maxLevel = def.tiers.length;
  return {
    id, x, y, type,
    level: level ?? maxLevel,
    maxLevel,
    range: 200, damage: 10, cooldown: 600, lastFired: 0, color: '#fff',
    targetId: null, targetingPriority: 'first', name: id, upgradeCost: 0,
    specCharge: 0, specMax: 100, visualRadius: 18, disabledTimer: 0,
    skills: { strength: { level: 1, xp: 0 }, ranged: { level: 1, xp: 0 }, magic: { level: 1, xp: 0 } },
    equipment: { ammo: null, jewellery: null },
  };
}

const ctx = (over: Partial<FusionContext> = {}): FusionContext => ({
  grid: GRID,
  money: 10_000,
  completed: new Set([FUSION_UNLOCK_CA]),
  fusedThisLeg: false,
  ...over,
});

describe('fusion table', () => {
  it('every fusion has a tower definition, a single tier and both parents', () => {
    for (const f of FUSIONS) {
      const def = TOWERS[f.type];
      expect(def, f.type).toBeDefined();
      expect(def.tiers.length, `${f.type} is a finished weapon, not a ladder`).toBe(1);
      expect(f.parents[0]).not.toBe(f.parents[1]);
      for (const p of f.parents) expect(isFusion(p), `${p} is a buildable tower`).toBe(false);
    }
  });

  it('no two fusions claim the same pair', () => {
    const keys = FUSIONS.map((f) => [...f.parents].sort().join('+'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lookups are order-independent and typed', () => {
    const f = FUSIONS[0];
    expect(fusionFor(f.parents[0], f.parents[1])?.type).toBe(f.type);
    expect(fusionFor(f.parents[1], f.parents[0])?.type).toBe(f.type);
    expect(fusionFor(f.parents[0], f.parents[0])).toBeNull();
    expect(fusionDef(f.type)?.name).toBe(f.name);
    expect(isFusion(f.type)).toBe(true);
    expect(isFusion('archer')).toBe(false);
  });
});

describe('isFusionReady', () => {
  it('needs a maxed, unfused tower', () => {
    expect(isFusionReady({ type: 'archer', level: 4, maxLevel: 4 })).toBe(true);
    expect(isFusionReady({ type: 'archer', level: 3, maxLevel: 4 })).toBe(false);
    // A fused weapon is level 1 of 1, which would otherwise read as maxed.
    expect(isFusionReady({ type: 'scorching_bow', level: 1, maxLevel: 1 })).toBe(false);
  });
});

describe('areAdjacent', () => {
  it('accepts the eight neighbouring tiles and rejects the tile itself', () => {
    const o = { x: 100, y: 100 };
    for (const [dx, dy] of [[GRID, 0], [-GRID, 0], [0, GRID], [0, -GRID], [GRID, GRID], [-GRID, GRID]]) {
      expect(areAdjacent(o, { x: o.x + dx, y: o.y + dy }, GRID), `${dx},${dy}`).toBe(true);
    }
    expect(areAdjacent(o, { ...o }, GRID)).toBe(false);
  });

  it('rejects a tile two steps away', () => {
    expect(areAdjacent({ x: 0, y: 0 }, { x: 2 * GRID, y: 0 }, GRID)).toBe(false);
    expect(areAdjacent({ x: 0, y: 0 }, { x: 0, y: 2 * GRID }, GRID)).toBe(false);
  });
});

describe('checkFusion', () => {
  const a = () => tower('a', 'archer', 100, 100);
  const b = () => tower('b', 'slayer', 100 + GRID, 100);

  it('passes when everything lines up', () => {
    const res = checkFusion(a(), b(), ctx());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.def.type).toBe('scorching_bow');
      expect(res.cost).toBe(FUSION_COST);
    }
  });

  it('reports the first thing standing in the way, in order', () => {
    const cases: [Tower, Tower, Partial<FusionContext>, string][] = [
      [tower('a', 'archer', 100, 100), tower('b', 'cannon', 132, 100), {}, 'pair'],
      [tower('a', 'archer', 100, 100, 1), b(), {}, 'tier'],
      [a(), tower('b', 'slayer', 400, 400), {}, 'adjacent'],
      [a(), b(), { completed: new Set<string>() }, 'locked'],
      [a(), b(), { fusedThisLeg: true }, 'leg'],
      [a(), b(), { money: 0 }, 'gold'],
    ];
    for (const [x, y, over, reason] of cases) {
      const res = checkFusion(x, y, ctx(over));
      expect(res.ok, reason).toBe(false);
      if (!res.ok) expect(res.reason).toBe(reason);
    }
  });

  it('never fuses a tower with itself', () => {
    const t = a();
    const res = checkFusion(t, t, ctx());
    expect(res.ok).toBe(false);
  });

  it('honours an overridden cost', () => {
    const res = checkFusion(a(), b(), ctx({ cost: 500, money: 500 }));
    expect(res.ok && res.cost).toBe(500);
  });

  it('every block has copy', () => {
    for (const k of ['pair', 'tier', 'adjacent', 'locked', 'leg', 'gold'] as const) {
      expect(FUSION_BLOCK_TEXT[k].length).toBeGreaterThan(0);
    }
  });
});

describe('fusionOffersFor', () => {
  it('lists only towers it makes something with, ready ones first', () => {
    const arch = tower('arch', 'archer', 100, 100);
    const near = tower('near', 'slayer', 100 + GRID, 100);
    const far = tower('far', 'slayer', 500, 500);
    const irrelevant = tower('cannon', 'cannon', 100, 100 + GRID);
    const offers = fusionOffersFor(arch, [arch, near, far, irrelevant], ctx());
    expect(offers.map((o) => o.partnerId)).toEqual(['near', 'far']);
    expect(offers[0].ok).toBe(true);
    expect(offers[1].ok).toBe(false);
    expect(offers[1].reason).toBe('adjacent');
  });

  it('leads with the nearest miss when nothing is ready', () => {
    const arch = tower('arch', 'archer', 100, 100);
    const poor = tower('poor', 'slayer', 100 + GRID, 100);       // blocked on gold only
    const unbuilt = tower('unbuilt', 'slayer', 100, 100 + GRID, 1); // blocked on tier
    const offers = fusionOffersFor(arch, [arch, poor, unbuilt], ctx({ money: 0 }));
    expect(offers[0].partnerId).toBe('poor');
    expect(offers[0].reason).toBe('gold');
  });

  it('returns nothing for a tower with no partner on the board', () => {
    const arch = tower('arch', 'archer', 100, 100);
    expect(fusionOffersFor(arch, [arch], ctx())).toEqual([]);
  });
});

describe('mergeSkills', () => {
  it('keeps the better of each skill, by xp', () => {
    const a = { strength: { level: 5, xp: 500 }, ranged: { level: 1, xp: 0 }, magic: { level: 3, xp: 200 } };
    const b = { strength: { level: 2, xp: 100 }, ranged: { level: 9, xp: 4000 }, magic: { level: 3, xp: 200 } };
    const m = mergeSkills(a, b);
    expect(m.strength.xp).toBe(500);
    expect(m.ranged.level).toBe(9);
    expect(m.magic.xp).toBe(200);
    // Copies, not shared references — the fused tower trains on its own from here.
    m.strength.xp = 1;
    expect(a.strength.xp).toBe(500);
  });
});

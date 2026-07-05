import { describe, it, expect } from 'vitest';
import { CombatStatsSystem, auraDamageSplit, RUN_FX_ID, type TowerIdentity } from './combat-stats';

const ident = (id: string, over: Partial<TowerIdentity> = {}): TowerIdentity => ({
  type: 'archer', style: 'ranged', subcategory: null, subLabel: null,
  name: id, color: '#fff', isUtility: false, ...over,
});

/** A resolver that hands back a fixed identity per id (utility ids marked). */
function makeStats(utilityIds: string[] = []) {
  return new CombatStatsSystem((id) =>
    ident(id, id === RUN_FX_ID
      ? { type: 'run', style: 'run', name: 'Run Effects' }
      : utilityIds.includes(id)
        ? { type: 'wizard', style: 'magic', subcategory: 'utility', subLabel: 'Prayer Ward', isUtility: true }
        : {}));
}

describe('auraDamageSplit', () => {
  it('peels off the part a (1+factor) aura added', () => {
    // 110 dealt under a +10% aura → 100 own, 10 extra.
    const { own, extra } = auraDamageSplit(110, 0.1);
    expect(own).toBeCloseTo(100);
    expect(extra).toBeCloseTo(10);
  });
  it('is a no-op with no aura', () => {
    expect(auraDamageSplit(50, 0)).toEqual({ own: 50, extra: 0 });
    expect(auraDamageSplit(50, -1)).toEqual({ own: 50, extra: 0 });
  });
  it('credits nothing for a zero/negative hit', () => {
    expect(auraDamageSplit(0, 0.1)).toEqual({ own: 0, extra: 0 });
  });
});

describe('CombatStatsSystem attribution', () => {
  it('accumulates direct damage per wave and per enemy', () => {
    const s = makeStats();
    s.recordDamage({ towerId: 'a', tag: 'direct' }, 1, 'goblin', 30);
    s.recordDamage({ towerId: 'a', tag: 'direct' }, 1, 'goblin', 20);
    s.recordDamage({ towerId: 'a', tag: 'direct' }, 2, 'rat', 5);
    const snap = s.snapshot();
    const a = snap.towers.find(t => t.id === 'a')!;
    expect(a.perWave.map(w => w.wave)).toEqual([1, 2]);
    const w1 = a.perWave[0];
    expect(w1.damage).toBe(50);
    expect(w1.byEnemy).toEqual([{ type: 'goblin', damage: 50 }]);
    expect(snap.waves).toEqual([1, 2]);
  });

  it('splits aura extra to the utility tower(s), leaving the firer its own share', () => {
    const s = makeStats(['u1']);
    // 110 dealt under a single +10% aura from u1.
    s.recordDamage(
      { towerId: 'a', tag: 'direct', aura: { factor: 0.1, parts: [{ id: 'u1', share: 1 }] } },
      1, 'goblin', 110,
    );
    const snap = s.snapshot();
    const a = snap.towers.find(t => t.id === 'a')!;
    const u = snap.towers.find(t => t.id === 'u1')!;
    expect(a.perWave[0].damage).toBeCloseTo(100);
    expect(u.perWave[0].damage).toBeCloseTo(10);
    expect(u.isUtility).toBe(true);
  });

  it('splits the aura extra between overlapping utility towers by share', () => {
    const s = makeStats(['u1', 'u2']);
    s.recordDamage(
      { towerId: 'a', tag: 'direct', aura: { factor: 0.2, parts: [{ id: 'u1', share: 0.75 }, { id: 'u2', share: 0.25 }] } },
      1, 'rat', 120,
    );
    const snap = s.snapshot();
    const extra = 120 - 120 / 1.2; // = 20
    expect(snap.towers.find(t => t.id === 'u1')!.perWave[0].damage).toBeCloseTo(extra * 0.75);
    expect(snap.towers.find(t => t.id === 'u2')!.perWave[0].damage).toBeCloseTo(extra * 0.25);
    expect(snap.towers.find(t => t.id === 'a')!.perWave[0].damage).toBeCloseTo(120 / 1.2);
  });

  it('buckets tower-less run FX under the Run Effects row', () => {
    const s = makeStats();
    s.recordDamage({ tag: 'chain' }, 3, 'skeleton', 40);
    const snap = s.snapshot();
    const run = snap.towers.find(t => t.id === RUN_FX_ID)!;
    expect(run.name).toBe('Run Effects');
    expect(run.perWave[0].damage).toBe(40);
  });

  it('merges effect tallies and tracks board combat seconds', () => {
    const s = makeStats();
    s.recordEffect('t', 1, { pushCount: 1, pushTiles: 1.5 });
    s.recordEffect('t', 1, { pushCount: 1, pushTiles: 0.5, stunCount: 1 });
    s.addCombatTime('t', 1, 2);
    s.addWaveCombat(1, 3);
    const snap = s.snapshot();
    const t = snap.towers.find(x => x.id === 't')!;
    expect(t.perWave[0].effects).toMatchObject({ pushCount: 2, pushTiles: 2, stunCount: 1 });
    expect(t.perWave[0].combatSeconds).toBe(2);
    expect(snap.waveCombat[1]).toBe(3);
  });

  it('reset() clears everything', () => {
    const s = makeStats();
    s.recordDamage({ towerId: 'a', tag: 'direct' }, 1, 'goblin', 10);
    s.reset();
    expect(s.snapshot().towers).toHaveLength(0);
  });
});

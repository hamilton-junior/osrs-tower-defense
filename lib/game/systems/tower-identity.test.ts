import { describe, it, expect } from 'vitest';
import {
  archerArrowCount,
  bowAntiTankMult,
  cannonBlastRadius,
  slayerWeaponBonus,
  isSlayerFavoredTarget,
  towerMarkKind,
  venomRamp,
  venomCap,
  noxiousSpread,
  halberdSeedDps,
  HALBERD_SEED_FRAC,
  VENOM_RAMP_HITS,
  venomWaveMult,
  venatorReach,
  venatorMultAt,
  VENATOR_BENDS,
  envenomAura,
  envenomStaffFor,
  ENVENOM_AURA_FRAC,
  type AuraSource,
} from './tower-identity';
import { roadStretches } from './geometry';

describe('archerArrowCount', () => {
  it('looses one arrow until the Dark Bow (tier 3), then two', () => {
    expect(archerArrowCount(1)).toBe(1);
    expect(archerArrowCount(2)).toBe(1);
    expect(archerArrowCount(3)).toBe(2);
    expect(archerArrowCount(4)).toBe(2);
  });
});

describe('bowAntiTankMult', () => {
  it('is a modest, capped anti-tank nudge (no boss-killer role)', () => {
    expect(bowAntiTankMult(40)).toBeCloseTo(1.0); // floor
    expect(bowAntiTankMult(220)).toBeCloseTo(1.1); // halfway
    expect(bowAntiTankMult(400)).toBeCloseTo(1.2); // cap
    expect(bowAntiTankMult(9999)).toBeCloseTo(1.2); // still capped
    expect(bowAntiTankMult(10)).toBeCloseTo(1.0); // below floor clamps
  });
});

describe('cannonBlastRadius', () => {
  it('grows per tier and out-zones the 80px Ancients blast by tier 3', () => {
    expect(cannonBlastRadius(1)).toBe(70);
    expect(cannonBlastRadius(2)).toBe(84);
    expect(cannonBlastRadius(3)).toBe(98);
    expect(cannonBlastRadius(4)).toBe(112);
    expect(cannonBlastRadius(3)).toBeGreaterThan(80);
  });
});

describe('slayerWeaponBonus', () => {
  it('hits the current task target hardest', () => {
    expect(slayerWeaponBonus('goblin', 'goblin', false)).toBeCloseTo(1.5);
  });
  it('hits superiors and bosses harder, but less than the task', () => {
    expect(slayerWeaponBonus('superior_gargoyle', null, false)).toBeCloseTo(1.3);
    expect(slayerWeaponBonus('vorkath', null, true)).toBeCloseTo(1.25);
  });
  it('takes the best applicable bonus rather than stacking', () => {
    // A superior that is also the task gets the task bonus, not 1.5*1.3.
    expect(slayerWeaponBonus('superior_gargoyle', 'superior_gargoyle', false)).toBeCloseTo(1.5);
  });
  it('is neutral against anything uncategorised', () => {
    expect(slayerWeaponBonus('rat', 'goblin', false)).toBe(1);
  });
});

describe('isSlayerFavoredTarget', () => {
  it('favours the current task, superiors and bosses', () => {
    expect(isSlayerFavoredTarget('goblin', 'goblin', false)).toBe(true);
    expect(isSlayerFavoredTarget('superior_gargoyle', null, false)).toBe(true);
    expect(isSlayerFavoredTarget('vorkath', null, true)).toBe(true);
  });
  it('does not favour an off-task, non-superior, non-boss enemy', () => {
    expect(isSlayerFavoredTarget('rat', 'goblin', false)).toBe(false);
  });
  it('tracks slayerWeaponBonus exactly (favoured ⇔ bonus > 1)', () => {
    for (const [type, task, boss] of [
      ['goblin', 'goblin', false], ['rat', 'goblin', false],
      ['superior_gargoyle', null, false], ['vorkath', null, true], ['cow', null, false],
    ] as const) {
      expect(isSlayerFavoredTarget(type, task, boss)).toBe(slayerWeaponBonus(type, task, boss) > 1);
    }
  });
});

describe('towerMarkKind', () => {
  it('maps each tower to the status it spreads', () => {
    expect(towerMarkKind({ type: 'toxic' })).toBe('venom');
    expect(towerMarkKind({ type: 'tzhaar' })).toBe('stun');
    expect(towerMarkKind({ type: 'archer' })).toBe('none');
    expect(towerMarkKind({ type: 'cannon' })).toBe('none');
    expect(towerMarkKind({ type: 'slayer' })).toBe('none');
  });
  it('reads an elemental wizard\'s element (air is a pure knockback → none)', () => {
    expect(towerMarkKind({ type: 'wizard', mageMode: 'elemental', element: 'water' })).toBe('vuln');
    expect(towerMarkKind({ type: 'wizard', mageMode: 'elemental', element: 'earth' })).toBe('stun');
    expect(towerMarkKind({ type: 'wizard', mageMode: 'elemental', element: 'fire' })).toBe('burn');
    expect(towerMarkKind({ type: 'wizard', mageMode: 'elemental', element: 'air' })).toBe('none');
  });
  it('reads an ancient wizard\'s barrage (blood lifesteal → none)', () => {
    expect(towerMarkKind({ type: 'wizard', mageMode: 'ancients', ancientType: 'ice' })).toBe('slow');
    expect(towerMarkKind({ type: 'wizard', mageMode: 'ancients', ancientType: 'shadow' })).toBe('stun');
    expect(towerMarkKind({ type: 'wizard', mageMode: 'ancients', ancientType: 'smoke' })).toBe('poison');
    expect(towerMarkKind({ type: 'wizard', mageMode: 'ancients', ancientType: 'blood' })).toBe('none');
  });
  it('treats a utility wizard as no-mark', () => {
    expect(towerMarkKind({ type: 'wizard', mageMode: 'utility' })).toBe('none');
  });
});

describe('venomRamp', () => {
  it('ramps in steps up to a damage-scaled cap (tower floor dominates early)', () => {
    const { step, cap, dur } = venomRamp(40, 1);
    expect(cap).toBe(24); // floor(40*0.6) beats the wave-1 track
    expect(step).toBe(5); // ceil(24/5)
    expect(dur).toBe(4);
    expect(cap).toBeGreaterThan(step);
  });
  it('keeps a floor so weak early hits still tick', () => {
    const { step, cap } = venomRamp(3, 1);
    expect(step).toBe(2); // ceil(2/5) would be 1 → clamped to 2
    expect(cap).toBe(2); // cap never below step
  });
  it('lets the wave-scaled track raise the cap late-game', () => {
    // At wave 70 a 40-damage hit's own floor (24) is dwarfed by the wave track.
    const { cap } = venomRamp(40, 70);
    expect(cap).toBe(venomCap(70, 40));
    expect(cap).toBeGreaterThan(24);
  });
  it('always reaches the cap within VENOM_RAMP_HITS reapplies, at every wave', () => {
    // The ramp used to be a fraction of the HIT, so on a late wave it needed ~19
    // reapplies — a ceiling no enemy lived long enough to see. It is a fraction of
    // the CAP now, so the climb takes the same handful of shots at wave 1 and 90.
    for (const wave of [1, 10, 30, 50, 70, 90]) {
      for (const hit of [8, 16, 32, 55]) {
        const { step, cap } = venomRamp(hit, wave);
        expect(step * VENOM_RAMP_HITS).toBeGreaterThanOrEqual(cap);
      }
    }
  });
});

describe('venomWaveMult', () => {
  it('always exceeds 1 (venom > poison) and stays under the 1.7 ceiling', () => {
    for (let w = 1; w <= 100; w++) {
      const m = venomWaveMult(w);
      expect(m).toBeGreaterThan(1);
      expect(m).toBeLessThan(1.7);
    }
  });
  it('rises with the wave (single-target pulls ahead of AoE over a run)', () => {
    expect(venomWaveMult(70)).toBeGreaterThan(venomWaveMult(1));
  });
});

describe('venomCap', () => {
  it('strictly beats the Smoke poison (dps = wave) on every wave', () => {
    // Isolate the wave track with a zero-damage hit so only wave*mult counts.
    for (let w = 1; w <= 100; w++) {
      expect(venomCap(w, 0)).toBeGreaterThan(w);
    }
  });
  it('is monotonic non-decreasing in the wave', () => {
    let prev = -1;
    for (let w = 1; w <= 100; w++) {
      const c = venomCap(w, 0);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
  it('widens its lead over poison as the run goes (margin grows)', () => {
    const early = venomCap(5, 0) - 5;
    const late = venomCap(70, 0) - 70;
    expect(late).toBeGreaterThan(early);
  });
  it('never runs away past a sane ceiling (≤ ceil(wave * 1.7))', () => {
    for (let w = 1; w <= 100; w++) {
      expect(venomCap(w, 0)).toBeLessThanOrEqual(Math.ceil(w * 1.7));
    }
  });
});

describe('venatorReach', () => {
  const p = (x: number, y: number) => ({ x, y });
  // A staircase: four straight runs, one segment each, three bends between them.
  const road = roadStretches([p(0, 0), p(100, 0), p(100, 100), p(200, 100), p(200, 200)]);

  it('takes the run the target stands on and the two behind it, shedding a quarter at each bend', () => {
    const reach = venatorReach(road, 3);
    expect(reach.map((r) => r.stretch)).toEqual([3, 2, 1]);
    expect(reach.map((r) => r.mult)).toEqual([1, 0.75, 0.5]);
  });

  it('sweeps back up the road toward the portal, never forward past the target', () => {
    // The pack is always behind the leader, so "behind" is where the shot pays off.
    for (const r of venatorReach(road, 3)) expect(r.from).toBeLessThanOrEqual(3);
  });

  it('stops at the start of the road instead of wrapping', () => {
    const reach = venatorReach(road, 1);
    expect(reach.map((r) => r.stretch)).toEqual([1, 0]);
    expect(reach.map((r) => r.mult)).toEqual([1, 0.75]);
    expect(venatorReach(road, 0).map((r) => r.mult)).toEqual([1]);
  });

  it('carries the run ends so the shot can still be drawn after the road is edited', () => {
    const [first] = venatorReach(road, 3);
    expect(first.a).toEqual(p(200, 100));
    expect(first.b).toEqual(p(200, 200));
  });

  it('reaches nothing from a segment that is not on the road', () => {
    expect(venatorReach(road, 99)).toEqual([]);
    expect(venatorReach([], 0)).toEqual([]);
  });

  it('never covers more runs than the bend limit allows', () => {
    const long = roadStretches([p(0, 0), p(100, 0), p(100, 100), p(200, 100), p(200, 200), p(300, 200), p(300, 300)]);
    for (let seg = 0; seg < 6; seg++) {
      expect(venatorReach(long, seg).length).toBeLessThanOrEqual(VENATOR_BENDS + 1);
    }
  });
});

describe('venatorMultAt', () => {
  const reach = [
    { from: 4, to: 6, mult: 1 },
    { from: 2, to: 3, mult: 0.75 },
  ];

  it('answers with the rate of the run the enemy is standing on', () => {
    expect(venatorMultAt(reach, 4)).toBe(1);
    expect(venatorMultAt(reach, 6)).toBe(1);
    expect(venatorMultAt(reach, 2)).toBe(0.75);
  });

  it('answers zero off the swept road, so the enemy is skipped entirely', () => {
    expect(venatorMultAt(reach, 1)).toBe(0);
    expect(venatorMultAt(reach, 7)).toBe(0);
    expect(venatorMultAt([], 4)).toBe(0);
  });
});

describe('noxiousSpread', () => {
  const seed = { dps: 3, dur: 4 };

  it('levels the swing up to the strongest venom it found', () => {
    expect(noxiousSpread([{ dps: 40, dur: 2 }, { dps: 12, dur: 4 }], seed)).toEqual({ dps: 40, dur: 4 });
  });

  it('falls back to its own weak seed when there is nothing to copy', () => {
    expect(noxiousSpread([], seed)).toEqual(seed);
  });

  it('ignores venoms weaker than the seed rather than spreading a downgrade', () => {
    expect(noxiousSpread([{ dps: 1, dur: 9 }], seed).dps).toBe(3);
  });

  it('keeps the longer of the two durations, so a dying venom is still worth spreading', () => {
    // A big venom with a second left refreshes to the seed's full duration...
    expect(noxiousSpread([{ dps: 90, dur: 1 }], seed)).toEqual({ dps: 90, dur: 4 });
    // ...and a long-running one is never cut short by the swing that copies it.
    expect(noxiousSpread([{ dps: 90, dur: 7 }], seed)).toEqual({ dps: 90, dur: 7 });
  });

  it('cannot ratchet: spreading a level and re-reading it returns the same level', () => {
    const first = noxiousSpread([{ dps: 40, dur: 3 }], seed);
    const second = noxiousSpread([first, first, first], seed);
    expect(second.dps).toBe(first.dps);
  });
});

describe('halberdSeedDps', () => {
  it('is a fraction of the ramp step a Toxic tower would have applied', () => {
    expect(halberdSeedDps(20)).toBe(20 * HALBERD_SEED_FRAC);
    expect(halberdSeedDps(9)).toBe(Math.round(9 * HALBERD_SEED_FRAC));
  });

  it('never rounds away to nothing', () => {
    expect(halberdSeedDps(1)).toBe(1);
    expect(halberdSeedDps(0)).toBe(1);
  });

  it('is always worse than the tower it copies from', () => {
    const { step } = venomRamp(70, 40);
    expect(halberdSeedDps(step)).toBeLessThan(step);
  });
});

describe('envenomAura', () => {
  it('is a fraction of the venom a Toxic tower would ramp for the same damage', () => {
    const ramp = venomRamp(70, 30);
    const aura = envenomAura(70, 30);
    expect(aura.step).toBe(Math.round(ramp.step * ENVENOM_AURA_FRAC));
    expect(aura.step).toBeLessThan(ramp.step);
  });

  it("shares the Toxic tower's ceiling and duration, so it tops a stack up and never past it", () => {
    const ramp = venomRamp(70, 30);
    const aura = envenomAura(70, 30);
    expect(aura.cap).toBe(ramp.cap);
    expect(aura.dur).toBe(ramp.dur);
  });

  it('never rounds away to nothing', () => {
    expect(envenomAura(1, 1).step).toBeGreaterThanOrEqual(1);
  });
});

describe('envenomStaffFor', () => {
  const staff = (over: Partial<AuraSource> = {}): AuraSource => ({
    id: 's1', type: 'toxic_staff_of_the_dead', x: 0, y: 0, range: 200, damage: 70, ...over,
  });

  it('covers a tower inside its range and nothing outside it', () => {
    const towers = [staff()];
    expect(envenomStaffFor({ x: 100, y: 0 }, towers)?.id).toBe('s1');
    expect(envenomStaffFor({ x: 300, y: 0 }, towers)).toBeNull();
  });

  it('covers itself, which is how its own shots get envenomed', () => {
    const s = staff();
    expect(envenomStaffFor(s, [s])).toBe(s);
  });

  it('ignores every tower that is not a staff', () => {
    expect(envenomStaffFor({ x: 0, y: 0 }, [staff({ type: 'toxic' })])).toBeNull();
  });

  it('goes out with the tower: a staff knocked offline covers nothing', () => {
    expect(envenomStaffFor({ x: 0, y: 0 }, [staff({ disabledTimer: 2 })])).toBeNull();
  });

  it('picks the strongest of two overlapping staves, so a second one only ever helps', () => {
    const weak = staff({ id: 'weak', damage: 70 });
    const strong = staff({ id: 'strong', damage: 120, x: 50 });
    expect(envenomStaffFor({ x: 10, y: 0 }, [weak, strong])?.id).toBe('strong');
    expect(envenomStaffFor({ x: 10, y: 0 }, [strong, weak])?.id).toBe('strong');
  });
});

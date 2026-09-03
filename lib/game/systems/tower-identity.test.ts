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
  VENOM_RAMP_HITS,
  venomWaveMult,
  venatorReach,
  venatorMultAt,
  VENATOR_BENDS,
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

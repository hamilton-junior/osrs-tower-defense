import { describe, it, expect } from 'vitest';
import {
  archerArrowCount,
  bowAntiTankMult,
  cannonBlastRadius,
  slayerWeaponBonus,
  venomRamp,
  venomCap,
  venomWaveMult,
} from './tower-identity';

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

describe('venomRamp', () => {
  it('ramps in steps up to a damage-scaled cap (tower floor dominates early)', () => {
    const { step, cap, dur } = venomRamp(40, 1);
    expect(step).toBe(6); // floor(40*0.15)
    expect(cap).toBe(24); // floor(40*0.6) beats the wave-1 track
    expect(dur).toBe(4);
    expect(cap).toBeGreaterThan(step);
  });
  it('keeps a floor so weak early hits still tick', () => {
    const { step, cap } = venomRamp(3, 1);
    expect(step).toBe(2); // floor would be 0 → clamped to 2
    expect(cap).toBe(2); // cap never below step
  });
  it('lets the wave-scaled track raise the cap late-game', () => {
    // At wave 70 a 40-damage hit's own floor (24) is dwarfed by the wave track.
    const { cap } = venomRamp(40, 70);
    expect(cap).toBe(venomCap(70, 40));
    expect(cap).toBeGreaterThan(24);
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

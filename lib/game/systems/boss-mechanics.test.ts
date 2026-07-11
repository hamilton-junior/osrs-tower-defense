import { describe, it, expect } from 'vitest';
import {
  ZULRAH_PHASES,
  ZULRAH_PHASE_SECS,
  ZULRAH_WEAK_BONUS,
  zulrahPhaseIndex,
  zulrahStyleMult,
  recentDamageSum,
  pruneDamageEvents,
  jadHealPerTick,
  freshBossState,
  bossStyleMult,
  JAD_HEAL_FRAC,
  JAD_HEAL_WINDOW_SECS,
  JAD_HEAL_TICK_SECS,
  VORKATH_ICE_INTERVAL,
  HYDRA_PHASES,
  HYDRA_VENT_THRESHOLDS,
  HYDRA_VENT_DAMAGE_MULT,
  HYDRA_VENT_BREAK_FRAC,
  HYDRA_VENT_HEAL_PER_SEC,
  HYDRA_ENRAGE_HP,
  hydraPhase,
  hydraNextThreshold,
  hydraShouldVent,
  hydraBreakTarget,
  hydraVentHeal,
  hydraIsEnraged,
  hydraZapChain,
} from './boss-mechanics';

describe('Zulrah phases', () => {
  it('covers all three combat styles exactly once', () => {
    const weaks = ZULRAH_PHASES.map((p) => p.weak).sort();
    expect(weaks).toEqual(['magic', 'melee', 'ranged']);
  });
  it('rotates by ZULRAH_PHASE_SECS and wraps', () => {
    expect(zulrahPhaseIndex(0)).toBe(0);
    expect(zulrahPhaseIndex(ZULRAH_PHASE_SECS - 0.01)).toBe(0);
    expect(zulrahPhaseIndex(ZULRAH_PHASE_SECS)).toBe(1);
    expect(zulrahPhaseIndex(ZULRAH_PHASE_SECS * 2)).toBe(2);
    expect(zulrahPhaseIndex(ZULRAH_PHASE_SECS * 3)).toBe(0); // wrap
  });
});

describe('zulrahStyleMult', () => {
  it('boosts the weak style and resists the others by the same magnitude', () => {
    expect(zulrahStyleMult('magic', 'magic')).toBeCloseTo(1 + ZULRAH_WEAK_BONUS);
    expect(zulrahStyleMult('magic', 'ranged')).toBeCloseTo(1 - ZULRAH_WEAK_BONUS);
    expect(zulrahStyleMult('magic', 'melee')).toBeCloseTo(1 - ZULRAH_WEAK_BONUS);
  });
  it('is symmetric: the bonus up equals the penalty down', () => {
    const up = zulrahStyleMult('ranged', 'ranged') - 1;
    const down = 1 - zulrahStyleMult('ranged', 'magic');
    expect(up).toBeCloseTo(down);
  });
  it('is neutral for styleless damage (DoT)', () => {
    expect(zulrahStyleMult('melee', undefined)).toBe(1);
  });
});

describe('recent-damage window', () => {
  const events = [
    { t: 0, amount: 100 },
    { t: 3, amount: 50 },
    { t: 7, amount: 30 },
  ];
  it('sums only events within the window', () => {
    expect(recentDamageSum(events, 8, JAD_HEAL_WINDOW_SECS)).toBe(80); // t=3 and t=7 are within 5s of now=8
    expect(recentDamageSum(events, 100, JAD_HEAL_WINDOW_SECS)).toBe(0); // all stale
  });
  it('prunes stale events', () => {
    expect(pruneDamageEvents([...events], 8, JAD_HEAL_WINDOW_SECS)).toEqual([
      { t: 3, amount: 50 },
      { t: 7, amount: 30 },
    ]);
  });
});

describe('jadHealPerTick', () => {
  it('prorates the heal fraction to the tick length', () => {
    expect(jadHealPerTick(1000)).toBe(Math.round(1000 * JAD_HEAL_FRAC * (JAD_HEAL_TICK_SECS / JAD_HEAL_WINDOW_SECS)));
  });
  it('is zero with no recent damage', () => {
    expect(jadHealPerTick(0)).toBe(0);
  });
});

describe('freshBossState / bossStyleMult', () => {
  it('seeds Vorkath with its ice timer', () => {
    expect(freshBossState('vorkath').iceTimer).toBe(VORKATH_ICE_INTERVAL);
  });
  it('seeds Jad with an empty damage window', () => {
    expect(freshBossState('jad').recentDamage).toEqual([]);
  });
  it('applies the Zulrah style bias through bossStyleMult', () => {
    const st = freshBossState('zulrah'); // phase 0 = serpentine, weak to magic
    expect(bossStyleMult(st, 'magic')).toBeCloseTo(1 + ZULRAH_WEAK_BONUS);
    expect(bossStyleMult(st, 'ranged')).toBeCloseTo(1 - ZULRAH_WEAK_BONUS);
  });
  it('returns 0 while immune (Vorkath ice shield)', () => {
    const st = freshBossState('vorkath');
    st.immune = true;
    expect(bossStyleMult(st, 'ranged')).toBe(0);
  });
  it('is neutral with no state', () => {
    expect(bossStyleMult(undefined, 'magic')).toBe(1);
  });
  it('seeds the Hydra unshattered with an empty vent tally', () => {
    const st = freshBossState('hydra');
    expect(st.shattered).toBe(0);
    expect(st.ventDamage).toBe(0);
    expect(st.venting).toBeFalsy();
  });
  it('hardens a venting Hydra against every style, DoT included', () => {
    const st = freshBossState('hydra');
    expect(bossStyleMult(st, 'magic')).toBe(1); // not venting yet
    st.venting = true;
    expect(bossStyleMult(st, 'magic')).toBe(HYDRA_VENT_DAMAGE_MULT);
    expect(bossStyleMult(st, 'melee')).toBe(HYDRA_VENT_DAMAGE_MULT);
    expect(bossStyleMult(st, undefined)).toBe(HYDRA_VENT_DAMAGE_MULT); // burst check, not a style check
  });
});

describe('Hydra phases', () => {
  it('advances with each shattered vent, and clamps at the last', () => {
    expect(hydraPhase(0).id).toBe('serpentine');
    expect(hydraPhase(1).id).toBe('electric');
    expect(hydraPhase(2).id).toBe('flame');
    expect(hydraPhase(99).id).toBe('flame');
  });
  it('has one more phase than it has vents (each vent is a boundary)', () => {
    expect(HYDRA_PHASES.length).toBe(HYDRA_VENT_THRESHOLDS.length + 1);
  });
  it('walks the thresholds in order, then runs out', () => {
    expect(hydraNextThreshold(0)).toBe(HYDRA_VENT_THRESHOLDS[0]);
    expect(hydraNextThreshold(1)).toBe(HYDRA_VENT_THRESHOLDS[1]);
    expect(hydraNextThreshold(2)).toBeNull();
  });
});

describe('hydraShouldVent', () => {
  it('opens once HP crosses the next threshold', () => {
    expect(hydraShouldVent(0.9, 0, false)).toBe(false);
    expect(hydraShouldVent(0.66, 0, false)).toBe(true);
  });
  it('does not re-open while one is already open', () => {
    expect(hydraShouldVent(0.5, 0, true)).toBe(false);
  });
  it('re-opens the same threshold after a failed break — the stall loop', () => {
    // Vent 1 failed: it healed back over 66%, then got knocked down again.
    expect(hydraShouldVent(0.6, 0, false)).toBe(true);
  });
  it('waits for the second threshold once the first is shattered', () => {
    expect(hydraShouldVent(0.5, 1, false)).toBe(false);
    expect(hydraShouldVent(0.33, 1, false)).toBe(true);
  });
  it('never opens again once every vent is shattered', () => {
    expect(hydraShouldVent(0.01, 2, false)).toBe(false);
  });
});

describe('vent break / heal maths', () => {
  it('scales the break target off max HP and never asks for zero', () => {
    expect(hydraBreakTarget(2000)).toBe(Math.round(2000 * HYDRA_VENT_BREAK_FRAC));
    expect(hydraBreakTarget(1)).toBeGreaterThanOrEqual(1);
  });
  it('regenerates a fixed fraction of max HP per second', () => {
    expect(hydraVentHeal(1000, 1)).toBeCloseTo(1000 * HYDRA_VENT_HEAL_PER_SEC);
    expect(hydraVentHeal(1000, 0.5)).toBeCloseTo(1000 * HYDRA_VENT_HEAL_PER_SEC * 0.5);
  });
});

describe('hydraIsEnraged', () => {
  it('flips at the enrage threshold', () => {
    expect(hydraIsEnraged(HYDRA_ENRAGE_HP + 0.01)).toBe(false);
    expect(hydraIsEnraged(HYDRA_ENRAGE_HP)).toBe(true);
    expect(hydraIsEnraged(0)).toBe(true);
  });
});

describe('hydraZapChain', () => {
  const towers = [
    { id: 'a', x: 10, y: 0 },
    { id: 'b', x: 20, y: 0 },
    { id: 'c', x: 400, y: 0 },
    { id: 'd', x: 30, y: 0 },
  ];
  it('strikes the nearest tower, then hops to the nearest unhit one', () => {
    // From the origin: a (10) is nearest; from a the nearest unhit is b (20); from b, d (30).
    expect(hydraZapChain(towers, 0, 0, 3).map((t) => t.id)).toEqual(['a', 'b', 'd']);
  });
  it('hops from the last tower, not from the Hydra', () => {
    // Standing right on c, the chain must walk back down the cluster: c → d → b.
    expect(hydraZapChain(towers, 400, 0, 3).map((t) => t.id)).toEqual(['c', 'd', 'b']);
  });
  it('never hits the same tower twice', () => {
    const ids = hydraZapChain(towers, 0, 0, 4).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('returns what it can when the board holds fewer towers', () => {
    expect(hydraZapChain(towers.slice(0, 2), 0, 0, 3)).toHaveLength(2);
    expect(hydraZapChain([], 0, 0, 3)).toEqual([]);
  });
});

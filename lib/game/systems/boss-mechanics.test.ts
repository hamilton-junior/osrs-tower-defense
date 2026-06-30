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
});

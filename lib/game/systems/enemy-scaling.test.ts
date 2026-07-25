import { describe, it, expect } from 'vitest';
import {
  hpScaleForWave, progressionHpMult, scaleEnemyStats,
  PROGRESSION_ANCHOR_WAVE, PROGRESSION_ANCHOR_MULT,
  endlessHpMult, ENDLESS_HP_BASE,
} from './enemy-scaling';

/** The ramp as it shipped, before the progression buff was layered on. */
const baseHpScale = (wave: number) => (wave <= 10 ? 1 + (wave - 1) * 0.15 : 2.35 + (wave - 10) * 0.4);

describe('progressionHpMult', () => {
  it('leaves wave 1 exactly as it was', () => {
    expect(progressionHpMult(1)).toBe(1);
  });
  it('hits the anchor multiplier on the anchor wave', () => {
    expect(progressionHpMult(PROGRESSION_ANCHOR_WAVE)).toBeCloseTo(PROGRESSION_ANCHOR_MULT);
  });
  it('climbs linearly — the halfway wave is halfway to the anchor', () => {
    const half = 1 + (PROGRESSION_ANCHOR_WAVE - 1) / 2;
    expect(progressionHpMult(half)).toBeCloseTo(1 + (PROGRESSION_ANCHOR_MULT - 1) / 2);
  });
  it('keeps climbing past the anchor — there is no ceiling', () => {
    const past = PROGRESSION_ANCHOR_WAVE * 2 - 1; // twice the anchor's distance from wave 1
    expect(progressionHpMult(past)).toBeCloseTo(1 + (PROGRESSION_ANCHOR_MULT - 1) * 2);
    expect(progressionHpMult(1000)).toBeGreaterThan(progressionHpMult(500));
  });
  it('never shrinks HP below the base ramp', () => {
    expect(progressionHpMult(0)).toBe(1);
    expect(progressionHpMult(-5)).toBe(1);
  });
});

describe('hpScaleForWave', () => {
  it('is 1x on wave 1', () => {
    expect(hpScaleForWave(1)).toBe(1);
  });
  it('doubles the old curve on the anchor wave — the point of the buff', () => {
    expect(hpScaleForWave(PROGRESSION_ANCHOR_WAVE)).toBeCloseTo(
      baseHpScale(PROGRESSION_ANCHOR_WAVE) * PROGRESSION_ANCHOR_MULT,
    );
  });
  it('still uses the gentle ramp through wave 10, only nudged', () => {
    expect(hpScaleForWave(10)).toBeCloseTo(baseHpScale(10) * progressionHpMult(10));
    expect(hpScaleForWave(10) / baseHpScale(10)).toBeLessThan(1.2); // early game barely moves
  });
  it('switches to the steep ramp after wave 10', () => {
    expect(hpScaleForWave(11)).toBeCloseTo(baseHpScale(11) * progressionHpMult(11));
  });
  it('pulls away from the old curve as the run goes on', () => {
    // The whole complaint: the old ramp was linear, so a board that beat it once beat
    // it forever. Each stretch must widen the gap, not hold it.
    const gap = (w: number) => hpScaleForWave(w) / baseHpScale(w);
    expect(gap(30)).toBeGreaterThan(gap(10));
    expect(gap(70)).toBeGreaterThan(gap(30));
    expect(gap(200)).toBeGreaterThan(gap(70));
  });
});

describe('scaleEnemyStats', () => {
  const base = { hp: 100, speed: 50, reward: 10 };

  it('returns the base stats (floored) on wave 1', () => {
    expect(scaleEnemyStats(base, 1)).toEqual({ hp: 100, speed: 50, reward: 10 });
  });

  it('scales hp, speed and reward by wave', () => {
    const r = scaleEnemyStats(base, 11);
    expect(r.hp).toBe(Math.floor(100 * hpScaleForWave(11)));
    expect(r.speed).toBe(Math.floor(50 * (1 + 10 * 0.01)));
    expect(r.reward).toBe(Math.floor(10 * (1 + 10 * 0.15)));
  });

  it('leaves speed and reward on their own curves — only HP takes the buff', () => {
    const r = scaleEnemyStats(base, PROGRESSION_ANCHOR_WAVE);
    expect(r.speed).toBe(Math.floor(50 * (1 + 69 * 0.01)));
    expect(r.reward).toBe(Math.floor(10 * (1 + 69 * 0.15)));
  });
});

describe('endlessHpMult', () => {
  it('is exactly 1 up to and at the victory wave', () => {
    expect(endlessHpMult(50, 90)).toBe(1);
    expect(endlessHpMult(90, 90)).toBe(1);
  });

  it('strictly increases after the victory wave', () => {
    expect(endlessHpMult(91, 90)).toBeGreaterThan(1);
    expect(endlessHpMult(92, 90)).toBeGreaterThan(endlessHpMult(91, 90));
  });

  it('grows as ENDLESS_HP_BASE^(wavesPastVictory)', () => {
    expect(endlessHpMult(93, 90)).toBeCloseTo(ENDLESS_HP_BASE ** 3, 6);
  });

  it('eventually exceeds any constant', () => {
    expect(endlessHpMult(90 + 500, 90)).toBeGreaterThan(1000);
  });
});

describe('scaleEnemyStats endless term', () => {
  const base = { hp: 100, speed: 50, reward: 10 };

  it('defaults to no endless bonus', () => {
    expect(scaleEnemyStats(base, 30)).toEqual(scaleEnemyStats(base, 30, 1));
  });

  it('multiplies hp only, leaving speed and reward untouched', () => {
    const plain = scaleEnemyStats(base, 30, 1);
    const endless = scaleEnemyStats(base, 30, 2);
    expect(endless.hp).toBe(Math.floor(100 * hpScaleForWave(30) * 2));
    expect(endless.speed).toBe(plain.speed);
    expect(endless.reward).toBe(plain.reward);
  });
});

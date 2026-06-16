import { describe, it, expect } from 'vitest';
import { hpScaleForWave, scaleEnemyStats } from './enemy-scaling';

describe('hpScaleForWave', () => {
  it('is 1x on wave 1', () => {
    expect(hpScaleForWave(1)).toBe(1);
  });
  it('uses the gentle ramp through wave 10', () => {
    expect(hpScaleForWave(10)).toBeCloseTo(1 + 9 * 0.15);
  });
  it('switches to the steep ramp after wave 10', () => {
    expect(hpScaleForWave(11)).toBeCloseTo(2.35 + 0.4);
  });
});

describe('scaleEnemyStats', () => {
  const base = { hp: 100, speed: 50, reward: 10 };

  it('returns the base stats (floored) on wave 1', () => {
    expect(scaleEnemyStats(base, 1)).toEqual({ hp: 100, speed: 50, reward: 10 });
  });

  it('scales hp, speed and reward by wave', () => {
    const r = scaleEnemyStats(base, 11);
    expect(r.hp).toBe(Math.floor(100 * (2.35 + 0.4)));
    expect(r.speed).toBe(Math.floor(50 * (1 + 10 * 0.01)));
    expect(r.reward).toBe(Math.floor(10 * (1 + 10 * 0.15)));
  });
});

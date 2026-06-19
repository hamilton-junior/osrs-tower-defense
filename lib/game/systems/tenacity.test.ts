import { describe, it, expect } from 'vitest';
import { debuffTenacity } from './tenacity';

describe('debuffTenacity', () => {
  it('scales normal monsters at wave/2 %, capped at 50%', () => {
    expect(debuffTenacity({ wave: 10 })).toBeCloseTo(0.05);
    expect(debuffTenacity({ wave: 50 })).toBeCloseTo(0.25);
    expect(debuffTenacity({ wave: 100 })).toBeCloseTo(0.5); // cap
    expect(debuffTenacity({ wave: 200 })).toBeCloseTo(0.5); // still capped
  });

  it('caps superior monsters at 75% on the same curve', () => {
    expect(debuffTenacity({ wave: 50, superior: true })).toBeCloseTo(0.25);
    expect(debuffTenacity({ wave: 150, superior: true })).toBeCloseTo(0.75); // cap
    expect(debuffTenacity({ wave: 300, superior: true })).toBeCloseTo(0.75);
  });

  it('builds boss tenacity 1% per debuff hit (no wave base)', () => {
    expect(debuffTenacity({ wave: 50, isBoss: true, debuffHits: 0 })).toBe(0);
    expect(debuffTenacity({ wave: 50, isBoss: true, debuffHits: 30 })).toBeCloseTo(0.3);
  });

  it('caps boss tenacity at min(wave%, 90%)', () => {
    // wave 20 → cap 20%, even with many hits.
    expect(debuffTenacity({ wave: 20, isBoss: true, debuffHits: 999 })).toBeCloseTo(0.2);
    // high wave → cap clamps to 90%.
    expect(debuffTenacity({ wave: 100, isBoss: true, debuffHits: 999 })).toBeCloseTo(0.9);
  });
});

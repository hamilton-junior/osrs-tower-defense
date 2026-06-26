import { describe, it, expect } from 'vitest';
import { debuffTenacity } from './tenacity';

describe('debuffTenacity', () => {
  it('scales normal monsters at wave/2 %, capped at 50%', () => {
    expect(debuffTenacity({ wave: 10 })).toBeCloseTo(0.05);
    expect(debuffTenacity({ wave: 50 })).toBeCloseTo(0.25);
    expect(debuffTenacity({ wave: 100 })).toBeCloseTo(0.5); // cap
    expect(debuffTenacity({ wave: 200 })).toBeCloseTo(0.5); // still capped
  });

  it('starts superiors at 50% and scales them to a 75% cap', () => {
    expect(debuffTenacity({ wave: 0, superior: true })).toBeCloseTo(0.5); // base floor
    expect(debuffTenacity({ wave: 10, superior: true })).toBeCloseTo(0.55);
    expect(debuffTenacity({ wave: 50, superior: true })).toBeCloseTo(0.75); // 0.5 + 0.25 → cap
    expect(debuffTenacity({ wave: 300, superior: true })).toBeCloseTo(0.75);
  });

  it('starts bosses at 50% and scales them by wave to a 90% cap', () => {
    expect(debuffTenacity({ wave: 0, isBoss: true })).toBeCloseTo(0.5); // resistant from hit one
    expect(debuffTenacity({ wave: 40, isBoss: true })).toBeCloseTo(0.7); // 0.5 + 0.2
    expect(debuffTenacity({ wave: 80, isBoss: true })).toBeCloseTo(0.9); // 0.5 + 0.4 → cap
    expect(debuffTenacity({ wave: 200, isBoss: true })).toBeCloseTo(0.9);
  });

  it('ignores debuffHits now that bosses have a wave-based curve', () => {
    expect(debuffTenacity({ wave: 10, isBoss: true, debuffHits: 999 })).toBeCloseTo(0.55);
  });
});

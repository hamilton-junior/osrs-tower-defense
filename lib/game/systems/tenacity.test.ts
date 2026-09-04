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

  it('does not price in debuffHits — the stall-breaker covers that case', () => {
    expect(debuffTenacity({ wave: 10, isBoss: true, debuffHits: 999 })).toBeCloseTo(0.55);
  });

  it('tops a stalled boss up to outright immunity via the bonus', () => {
    // The only route to a fully CC-immune boss, and it opens only for one that is taking
    // no damage — which is precisely the fight where control stops buying time and starts
    // holding the fight open forever.
    expect(debuffTenacity({ wave: 80, isBoss: true, bonus: 0.6 })).toBe(1);
    expect(debuffTenacity({ wave: 80, isBoss: true, bonus: 0 })).toBeCloseTo(0.9);
  });

  it('clamps the bonus into range rather than overshooting', () => {
    expect(debuffTenacity({ wave: 10, bonus: 99 })).toBe(1);
    expect(debuffTenacity({ wave: 10, bonus: -99 })).toBeCloseTo(0.05); // negatives ignored
  });

  it('cuts the curve by the shred an Amulet of the damned lands', () => {
    expect(debuffTenacity({ wave: 80, isBoss: true, shred: 0.5 })).toBeCloseTo(0.45); // half of 0.9
    expect(debuffTenacity({ wave: 50, superior: true, shred: 0.5 })).toBeCloseTo(0.375);
    expect(debuffTenacity({ wave: 100, shred: 1 })).toBe(0); // a full break leaves nothing
    expect(debuffTenacity({ wave: 100, shred: 0 })).toBeCloseTo(0.5); // absent = unchanged
  });

  it('ignores the shred entirely while the stall-breaker is escalating', () => {
    // The escalation exists to close a fight that would otherwise never end. If gear
    // could cut into it, the amulet would re-open exactly the perma-lock it closes.
    expect(debuffTenacity({ wave: 80, isBoss: true, bonus: 0.6, shred: 1 })).toBe(1);
    expect(debuffTenacity({ wave: 80, isBoss: true, bonus: 0.05, shred: 1 })).toBeCloseTo(0.95);
  });

  it('clamps the shred rather than inverting the curve', () => {
    expect(debuffTenacity({ wave: 80, isBoss: true, shred: 99 })).toBe(0);
    expect(debuffTenacity({ wave: 80, isBoss: true, shred: -99 })).toBeCloseTo(0.9); // negatives ignored
  });
});

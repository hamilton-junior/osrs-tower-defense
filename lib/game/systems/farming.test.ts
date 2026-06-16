import { describe, it, expect } from 'vitest';
import { diseaseChance, baseFarmYield } from './farming';

describe('diseaseChance', () => {
  it('is 15% with no compost', () => {
    expect(diseaseChance()).toBe(0.15);
  });
  it('drops with better compost tiers', () => {
    expect(diseaseChance('compost')).toBe(0.08);
    expect(diseaseChance('supercompost')).toBe(0.03);
    expect(diseaseChance('ultracompost')).toBe(0.01);
  });
});

describe('baseFarmYield', () => {
  it('is 3 + 1 per 10 farming levels', () => {
    expect(baseFarmYield(1)).toBe(3);
    expect(baseFarmYield(20)).toBe(5);
  });
  it('adds a compost bonus on top', () => {
    expect(baseFarmYield(1, 'compost')).toBe(4);
    expect(baseFarmYield(1, 'supercompost')).toBe(6);
    expect(baseFarmYield(20, 'ultracompost')).toBe(10); // 5 + 5
  });
});

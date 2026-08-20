import { describe, it, expect } from 'vitest';
import { pickVariant, resetVariantBag, MODEL_VARIANTS, type VariantBag } from './model-variants';
import { ENEMY_ANIMS } from '../data/enemy-anims';
import type { EnemyType } from '../types';

const T = 'barrow_wight' as EnemyType;
const FOUR = { [T]: ['a', 'b', 'c', 'd'] } as Partial<Record<string, readonly string[]>>;

/** Deterministic rng: always draws the first slug left in the bag. */
const first = () => 0;

describe('pickVariant', () => {
  it('returns undefined for a type with no variants', () => {
    const bag: VariantBag = {};
    expect(pickVariant('goblin' as EnemyType, bag, first, FOUR)).toBeUndefined();
  });

  it('uses every look once before repeating any', () => {
    const bag: VariantBag = {};
    const drawn = Array.from({ length: 4 }, () => pickVariant(T, bag, Math.random, FOUR));
    expect(new Set(drawn).size).toBe(4);
    expect([...drawn].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refills once the roster is spent, so a long wave keeps spawning', () => {
    const bag: VariantBag = {};
    const drawn = Array.from({ length: 6 }, () => pickVariant(T, bag, first, FOUR));
    expect(drawn.every((d) => d !== undefined)).toBe(true);
    // First four are the full set; the fifth starts a fresh bag.
    expect(new Set(drawn.slice(0, 4)).size).toBe(4);
  });

  it('starts a new wave from a full bag', () => {
    const bag: VariantBag = {};
    pickVariant(T, bag, first, FOUR);
    pickVariant(T, bag, first, FOUR);
    resetVariantBag(bag);
    const drawn = Array.from({ length: 4 }, () => pickVariant(T, bag, Math.random, FOUR));
    expect(new Set(drawn).size).toBe(4);
  });
});

describe('MODEL_VARIANTS', () => {
  it('only ever offers looks that have baked clips behind them', () => {
    for (const slugs of Object.values(MODEL_VARIANTS)) {
      for (const slug of slugs ?? []) expect(ENEMY_ANIMS[slug]).toBeTruthy();
    }
  });

  it('drops a type that is left with a single look', () => {
    for (const slugs of Object.values(MODEL_VARIANTS)) expect((slugs ?? []).length).toBeGreaterThan(1);
  });
});

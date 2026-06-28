import { describe, it, expect } from 'vitest';
import {
  DRAFT_POOL,
  RARITY_WEIGHT,
  rollDraft,
  type DraftCard,
} from './roguelite-draft';

/** A deterministic RNG that replays a fixed sequence (looping). */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('DRAFT_POOL integrity', () => {
  it('has unique ids', () => {
    const ids = DRAFT_POOL.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every card has a known rarity weight and an icon', () => {
    for (const c of DRAFT_POOL) {
      expect(RARITY_WEIGHT[c.rarity]).toBeGreaterThan(0);
      expect(c.icon).toBeTruthy();
    }
  });
});

describe('rollDraft', () => {
  it('returns the requested number of distinct cards', () => {
    const hand = rollDraft(seq(0.1, 0.4, 0.8, 0.2), 3);
    expect(hand).toHaveLength(3);
    expect(new Set(hand.map(c => c.id)).size).toBe(3);
  });
  it('never returns more cards than the pool holds', () => {
    const hand = rollDraft(Math.random, 999);
    expect(hand).toHaveLength(DRAFT_POOL.length);
    expect(new Set(hand.map(c => c.id)).size).toBe(DRAFT_POOL.length);
  });
  it('rng≈0 always picks the first eligible card of the remaining pool', () => {
    // With roll→0 the cumulative-weight walk lands on index 0 each draw, so the
    // hand is the pool head in order.
    const hand = rollDraft(seq(0), 3);
    expect(hand.map(c => c.id)).toEqual(DRAFT_POOL.slice(0, 3).map(c => c.id));
  });
  it('respects rarity weighting over many rolls', () => {
    let commons = 0;
    let epics = 0;
    const rng = () => Math.random();
    for (let i = 0; i < 4000; i++) {
      const first: DraftCard = rollDraft(rng, 1)[0];
      if (first.rarity === 'common') commons++;
      if (first.rarity === 'epic') epics++;
    }
    // Commons (weight 100×3) should massively outnumber epics (weight 11×3).
    expect(commons).toBeGreaterThan(epics * 3);
  });
});

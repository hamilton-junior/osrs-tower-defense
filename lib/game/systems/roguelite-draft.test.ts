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

/** All leaf effects of a card, flattening `multi` bundles. */
const leafEffects = (card: DraftCard): Exclude<DraftCard['effect'], { kind: 'multi' }>[] => {
  const out: Exclude<DraftCard['effect'], { kind: 'multi' }>[] = [];
  const walk = (e: DraftCard['effect']) => {
    if (e.kind === 'multi') e.effects.forEach(walk);
    else out.push(e);
  };
  walk(card.effect);
  return out;
};

describe('DRAFT_POOL integrity', () => {
  it('offers at least 50 distinct cards', () => {
    expect(DRAFT_POOL.length).toBeGreaterThanOrEqual(50);
  });
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
  it('covers every rarity', () => {
    const rarities = new Set(DRAFT_POOL.map(c => c.rarity));
    expect(rarities).toEqual(new Set(['common', 'uncommon', 'rare', 'ultra']));
  });
  it('styled stat buffs use a valid combat style; general buffs omit it', () => {
    for (const c of DRAFT_POOL) {
      for (const e of leafEffects(c)) {
        if (e.kind === 'damage' || e.kind === 'range' || e.kind === 'fireRate') {
          if (e.style !== undefined) expect(['melee', 'ranged', 'magic']).toContain(e.style);
        }
      }
    }
  });
  it('keeps range/fire-rate multipliers small and >1 (they are game-changers)', () => {
    for (const c of DRAFT_POOL) {
      for (const e of leafEffects(c)) {
        if (e.kind === 'range' || e.kind === 'fireRate') {
          expect(e.mult).toBeGreaterThan(1);
          expect(e.mult).toBeLessThanOrEqual(1.1); // never a runaway single step
        }
        if (e.kind === 'damage') {
          expect(e.mult).toBeGreaterThan(1);
          expect(e.mult).toBeLessThanOrEqual(1.3);
        }
      }
    }
  });
  it('multi cards bundle at least two effects', () => {
    for (const c of DRAFT_POOL) {
      if (c.effect.kind === 'multi') expect(c.effect.effects.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('battlefield effects are well-formed (bounty>0, vuln amp>1, chill slow in (0,1])', () => {
    for (const c of DRAFT_POOL) {
      for (const e of leafEffects(c)) {
        if (e.kind === 'bounty') expect(e.amount).toBeGreaterThan(0);
        if (e.kind === 'vuln') {
          expect(e.mult).toBeGreaterThan(1);
          expect(e.mult).toBeLessThanOrEqual(1.1); // a universal amp stays modest
        }
        if (e.kind === 'chill') {
          expect(e.mult).toBeGreaterThan(0);
          expect(e.mult).toBeLessThanOrEqual(1); // ≤1 = a slow, never a speed-up
          expect(e.mult).toBeGreaterThanOrEqual(0.9); // never a runaway single step
        }
      }
    }
  });
  it('includes the three new battlefield archetypes', () => {
    const kinds = new Set(DRAFT_POOL.flatMap(leafEffects).map(e => e.kind));
    expect(kinds).toContain('bounty');
    expect(kinds).toContain('vuln');
    expect(kinds).toContain('chill');
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
    let ultras = 0;
    const rng = () => Math.random();
    for (let i = 0; i < 4000; i++) {
      const first: DraftCard = rollDraft(rng, 1)[0];
      if (first.rarity === 'common') commons++;
      if (first.rarity === 'ultra') ultras++;
    }
    // Commons (weight 100 each) should massively outnumber ultras (weight 8 each).
    expect(commons).toBeGreaterThan(ultras * 3);
  });
});

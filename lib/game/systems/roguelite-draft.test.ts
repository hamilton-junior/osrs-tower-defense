import { describe, it, expect } from 'vitest';
import {
  DRAFT_POOL,
  RARITY_WEIGHT,
  rollDraft,
  availableCards,
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
  it('offers behavioural cards from all three families', () => {
    const kinds = new Set(DRAFT_POOL.flatMap(leafEffects).map(e => e.kind));
    // on-kill chains
    expect(kinds).toContain('ricochet');
    expect(kinds).toContain('overkill');
    expect(kinds).toContain('soulSplit');
    expect(kinds).toContain('killStreak');
    // risk/reward curses
    expect(kinds).toContain('lastStand');
    expect(kinds).toContain('berserker');
    expect(kinds).toContain('bloodPact');
    expect(kinds).toContain('greed');
    // tower transforms
    expect(kinds).toContain('doubleShot');
    expect(kinds).toContain('venomTips');
    expect(kinds).toContain('chainFreeze');
    expect(kinds).toContain('pierce');
    // placement synergies
    expect(kinds).toContain('packTactics');
    expect(kinds).toContain('trinity');
    expect(kinds).toContain('vanguard');
    expect(kinds).toContain('loneWolf');
  });
  it('offers a magic-subtype (mageBuff) card for each spellbook, ultra + unique', () => {
    const modes = DRAFT_POOL.flatMap(leafEffects).filter(e => e.kind === 'mageBuff').map(e => (e as { mode: string }).mode);
    expect(new Set(modes)).toEqual(new Set(['elemental', 'ancients', 'utility']));
    for (const c of DRAFT_POOL) {
      if (leafEffects(c).some(e => e.kind === 'mageBuff')) {
        expect(c.rarity).toBe('ultra');
        expect(c.unique).toBe(true);
      }
    }
  });
  it('behavioural (unique) cards are all rare or ultra', () => {
    for (const c of DRAFT_POOL) {
      if (c.unique) expect(['rare', 'ultra']).toContain(c.rarity);
    }
  });
  it('every behavioural-kind card is flagged unique', () => {
    const BEHAVIOURAL = new Set([
      'ricochet', 'overkill', 'soulSplit', 'killStreak',
      'lastStand', 'berserker', 'bloodPact', 'greed',
      'doubleShot', 'venomTips', 'chainFreeze', 'pierce',
      'packTactics', 'trinity', 'vanguard', 'loneWolf',
    ]);
    for (const c of DRAFT_POOL) {
      if (leafEffects(c).some(e => BEHAVIOURAL.has(e.kind))) expect(c.unique).toBe(true);
    }
  });
  it('behavioural effects carry sane params', () => {
    for (const c of DRAFT_POOL) {
      for (const e of leafEffects(c)) {
        if (e.kind === 'ricochet') { expect(e.frac).toBeGreaterThan(0); expect(e.frac).toBeLessThanOrEqual(1); expect(e.radius).toBeGreaterThan(0); }
        if (e.kind === 'overkill') expect(e.radius).toBeGreaterThan(0);
        if (e.kind === 'soulSplit') expect(e.every).toBeGreaterThanOrEqual(2);
        if (e.kind === 'killStreak') { expect(e.every).toBeGreaterThanOrEqual(2); expect(e.damage).toBeGreaterThan(0); }
        if (e.kind === 'lastStand') { expect(e.belowLives).toBeGreaterThan(0); expect(e.mult).toBeGreaterThan(1); }
        if (e.kind === 'berserker') expect(e.perMissingLife).toBeGreaterThan(0);
        if (e.kind === 'bloodPact') expect(e.mult).toBeGreaterThan(1);
        if (e.kind === 'greed') { expect(e.hpMult).toBeGreaterThan(1); expect(e.goldMult).toBeGreaterThan(1); }
        if (e.kind === 'venomTips') { expect(e.dps).toBeGreaterThan(0); expect(e.dur).toBeGreaterThan(0); }
        if (e.kind === 'chainFreeze') expect(e.radius).toBeGreaterThan(0);
        if (e.kind === 'pierce') expect(e.radius).toBeGreaterThan(0);
        if (e.kind === 'packTactics') { expect(e.frac).toBeGreaterThan(0); expect(e.radius).toBeGreaterThan(0); expect(e.maxStacks).toBeGreaterThanOrEqual(1); }
        if (e.kind === 'trinity') { expect(e.mult).toBeGreaterThan(1); expect(e.radius).toBeGreaterThan(0); }
        if (e.kind === 'vanguard') expect(e.mult).toBeGreaterThan(1);
        if (e.kind === 'loneWolf') { expect(e.mult).toBeGreaterThan(1); expect(e.radius).toBeGreaterThan(0); }
      }
    }
  });
});

describe('availableCards', () => {
  it('returns the full pool when nothing has been taken', () => {
    expect(availableCards(new Set())).toHaveLength(DRAFT_POOL.length);
  });
  it('drops a taken unique card but keeps everything else', () => {
    const unique = DRAFT_POOL.find(c => c.unique)!;
    const left = availableCards(new Set([unique.id]));
    expect(left).toHaveLength(DRAFT_POOL.length - 1);
    expect(left.some(c => c.id === unique.id)).toBe(false);
  });
  it('never drops a non-unique (stackable) card even if its id is passed', () => {
    const stat = DRAFT_POOL.find(c => !c.unique)!;
    const left = availableCards(new Set([stat.id]));
    expect(left.some(c => c.id === stat.id)).toBe(true);
  });
  it('a hand rolled from the filtered pool excludes taken uniques', () => {
    const taken = new Set(DRAFT_POOL.filter(c => c.unique).map(c => c.id));
    const hand = rollDraft(Math.random, 3, availableCards(taken));
    expect(hand.every(c => !c.unique)).toBe(true);
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
  it('never offers two cards of the same resource group when alternatives exist', () => {
    const gold1 = DRAFT_POOL.find(c => c.id === 'coin_pouch')!;     // gold (currency)
    const gold2 = DRAFT_POOL.find(c => c.id === 'looted_coins')!;   // gold (currency)
    const stat = DRAFT_POOL.find(c => c.id === 'strength_potion')!; // not a resource
    const hand = rollDraft(seq(0), 2, [gold1, gold2, stat]);
    const currency = hand.filter(c => c.effect.kind === 'gold' || c.effect.kind === 'essence');
    expect(currency).toHaveLength(1); // the second gold card is skipped for the stat card
  });
  it('a full 3-card hand never doubles up a currency or a lives reward', () => {
    for (let i = 0; i < 500; i++) {
      const hand = rollDraft(Math.random, 3);
      const currency = hand.filter(c => c.effect.kind === 'gold' || c.effect.kind === 'essence').length;
      const lives = hand.filter(c => c.effect.kind === 'life' || c.effect.kind === 'maxLife').length;
      expect(currency).toBeLessThanOrEqual(1);
      expect(lives).toBeLessThanOrEqual(1);
    }
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

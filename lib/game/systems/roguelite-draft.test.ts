import { describe, it, expect } from 'vitest';
import {
  DRAFT_POOL,
  RARITY_WEIGHT,
  BOOSTED_RARITY_WEIGHT,
  CARD_ROLL_BASE_COST,
  CARD_ROLL_COST_GROWTH,
  cardRollCost,
  rollDraft,
  availableCards,
  lateAffinity,
  lateWeightMult,
  RAMP_START,
  RAMP_FULL,
  FADE_FLOOR,
  RISE_CEIL,
  type DraftCard,
} from './roguelite-draft';
import { SLAYER_ESSENCE_SACK_COST, SLAYER_ESSENCE_SACK_YIELD } from '../data/slayer';

/** A deterministic RNG that replays a fixed sequence (looping). */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

const card = (kind: DraftCard['effect']['kind'], rarity: DraftCard['rarity'] = 'common'): DraftCard =>
  ({ id: `t_${kind}`, name: kind, desc: '', rarity, icon: '', effect: { kind } as DraftCard['effect'] });

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
  it('never offers the same effect twice under two names', () => {
    // Two cards with identical effects are a dead draw dressed up as a choice: the
    // hand looks like it has options and doesn't. Occult Necklace / Eternal Boots and
    // Void Knight / Amulet of Fury were exactly this pair of mistakes.
    const seen = new Map<string, string>();
    for (const c of DRAFT_POOL) {
      const sig = JSON.stringify(c.effect);
      const twin = seen.get(sig);
      expect(twin, `${c.id} has the same effect as ${twin}`).toBeUndefined();
      seen.set(sig, c.id);
    }
  });
  it('keeps every Rune Essence card rare or better — it is meta currency', () => {
    // Essence outlives the run, so a common essence card would pay the player for
    // drafting rather than for playing.
    for (const c of DRAFT_POOL) {
      for (const e of leafEffects(c)) {
        if (e.kind === 'essence') expect(['rare', 'ultra']).toContain(c.rarity);
      }
    }
  });

  it('no Slayer-point card is worth more essence than the best essence card', () => {
    // The Essence Sack converts points to essence at a fixed rate, so EVERY points
    // card is also an essence card at that rate. If a points card ever out-earns
    // the essence cards it sits beside, the essence rarity tiers below become
    // decorative and the meta currency leaks out through Slayer. This is the guard
    // on that: it fails the moment someone raises a points amount (or the sack's
    // yield) without re-checking the other side.
    const perPoint = SLAYER_ESSENCE_SACK_YIELD / SLAYER_ESSENCE_SACK_COST;
    const amounts = (kind: 'essence' | 'slayerPoints') =>
      DRAFT_POOL.flatMap(leafEffects).filter(e => e.kind === kind).map(e => (e as { amount: number }).amount);
    const bestEssence = Math.max(...amounts('essence'));
    const points = amounts('slayerPoints');
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(p * perPoint).toBeLessThanOrEqual(bestEssence);
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
      'ricochet', 'overkill', 'killStreak',
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
    // Slayer points and essence are ONE group: the Essence Sack trades between
    // them, so offering both is offering the same reward twice.
    const cur1 = DRAFT_POOL.find(c => c.id === 'enchanted_gem')!;   // points (currency)
    const cur2 = DRAFT_POOL.find(c => c.id === 'essence_shard')!;   // essence (currency)
    const stat = DRAFT_POOL.find(c => c.id === 'strength_potion')!; // not a resource
    const hand = rollDraft(seq(0), 2, [cur1, cur2, stat]);
    const currency = hand.filter(c => c.effect.kind === 'slayerPoints' || c.effect.kind === 'essence');
    expect(currency).toHaveLength(1); // the second currency card is skipped for the stat card
  });
  it('a full 3-card hand never doubles up a currency or a lives reward', () => {
    for (let i = 0; i < 500; i++) {
      const hand = rollDraft(Math.random, 3);
      const currency = hand.filter(c => c.effect.kind === 'slayerPoints' || c.effect.kind === 'essence').length;
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

describe('cardRollCost', () => {
  it('starts at the base price for the first roll of a run', () => {
    expect(cardRollCost(0)).toBe(CARD_ROLL_BASE_COST);
  });

  it('compounds by the growth factor per roll already bought', () => {
    expect(cardRollCost(1)).toBe(Math.round(CARD_ROLL_BASE_COST * CARD_ROLL_COST_GROWTH));
    expect(cardRollCost(2)).toBe(Math.round(CARD_ROLL_BASE_COST * CARD_ROLL_COST_GROWTH ** 2));
    // The documented curve: 50 -> 75 -> 113 -> 169.
    expect([0, 1, 2, 3].map(cardRollCost)).toEqual([50, 75, 113, 169]);
  });

  it('never charges less than the base, however odd the count', () => {
    expect(cardRollCost(-5)).toBe(CARD_ROLL_BASE_COST);
    expect(cardRollCost(1.9)).toBe(cardRollCost(1)); // floored, not rounded up
  });

  it('stays finite and climbing deep into a long run', () => {
    const late = cardRollCost(30);
    expect(Number.isFinite(late)).toBe(true);
    expect(late).toBeGreaterThan(cardRollCost(29));
  });
});

describe('boosted draft odds', () => {
  it('favours rare/ultra over common, inverting the normal weighting', () => {
    // The whole point of a boss hand: the top end outweighs the backbone.
    expect(BOOSTED_RARITY_WEIGHT.ultra).toBeGreaterThan(BOOSTED_RARITY_WEIGHT.common);
    expect(BOOSTED_RARITY_WEIGHT.rare).toBeGreaterThan(BOOSTED_RARITY_WEIGHT.common);
    expect(RARITY_WEIGHT.ultra).toBeLessThan(RARITY_WEIGHT.common); // the normal roll does not
  });

  it('lifts every above-common tier and cuts commons, versus the normal odds', () => {
    expect(BOOSTED_RARITY_WEIGHT.common).toBeLessThan(RARITY_WEIGHT.common);
    expect(BOOSTED_RARITY_WEIGHT.rare).toBeGreaterThan(RARITY_WEIGHT.rare);
    expect(BOOSTED_RARITY_WEIGHT.ultra).toBeGreaterThan(RARITY_WEIGHT.ultra);
  });

  it('actually deals better hands than the default weights over many rolls', () => {
    // Same RNG stream both ways, so only the weights differ.
    const rng = () => Math.random();
    const good = (w: Record<string, number>, boosted: boolean) => {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        for (const c of rollDraft(rng, 3, DRAFT_POOL, boosted ? BOOSTED_RARITY_WEIGHT : RARITY_WEIGHT)) {
          if (c.rarity === 'rare' || c.rarity === 'ultra') n++;
        }
      }
      return n;
    };
    expect(good(BOOSTED_RARITY_WEIGHT, true)).toBeGreaterThan(good(RARITY_WEIGHT, false));
  });

  it('still respects the pool and hand size', () => {
    const hand = rollDraft(seq(0.1, 0.5, 0.9), 3, DRAFT_POOL, BOOSTED_RARITY_WEIGHT);
    expect(hand).toHaveLength(3);
    expect(new Set(hand.map(c => c.id)).size).toBe(3); // distinct
  });
});

describe('lateAffinity', () => {
  it('fades the capped/late-dead kinds', () => {
    for (const k of ['damage', 'essence', 'slayerPoints'] as const)
      expect(lateAffinity({ kind: k } as DraftCard['effect'])).toBe('fade');
  });
  it('rises range/fireRate and every behavioural/synergy/mage kind', () => {
    for (const k of ['range', 'fireRate', 'ricochet', 'overkill', 'killStreak',
      'lastStand', 'berserker', 'bloodPact', 'greed', 'doubleShot', 'venomTips',
      'chainFreeze', 'pierce', 'packTactics', 'trinity', 'vanguard', 'loneWolf',
      'mageBuff'] as const)
      expect(lateAffinity({ kind: k } as DraftCard['effect'])).toBe('rise');
  });
  it('keeps life/maxLife/multi neutral', () => {
    for (const k of ['life', 'maxLife', 'multi'] as const)
      expect(lateAffinity({ kind: k } as DraftCard['effect'])).toBe('neutral');
  });
  it('classifies every effect kind present in the pool', () => {
    // exhaustiveness in practice: no pool card throws / returns undefined
    for (const c of DRAFT_POOL)
      expect(['fade', 'rise', 'neutral']).toContain(lateAffinity(c.effect));
  });
});

describe('lateWeightMult', () => {
  it('is exactly 1 for every affinity at and below RAMP_START', () => {
    expect(lateWeightMult(card('damage'), RAMP_START)).toBe(1);
    expect(lateWeightMult(card('fireRate'), RAMP_START - 5)).toBe(1);
    expect(lateWeightMult(card('life'), 0)).toBe(1);
  });
  it('slides fade down toward the floor, never reaching zero', () => {
    const mid = lateWeightMult(card('damage'), (RAMP_START + RAMP_FULL) / 2);
    const full = lateWeightMult(card('damage'), RAMP_FULL);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(full);
    expect(full).toBeGreaterThan(0);
    expect(full).toBeCloseTo(FADE_FLOOR, 5);
  });
  it('slides rise up toward the ceiling', () => {
    const mid = lateWeightMult(card('fireRate'), (RAMP_START + RAMP_FULL) / 2);
    const full = lateWeightMult(card('range'), RAMP_FULL);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(full);
    expect(full).toBeCloseTo(RISE_CEIL, 5);
  });
  it('clamps past RAMP_FULL (no overshoot beyond floor/ceiling)', () => {
    expect(lateWeightMult(card('damage'), RAMP_FULL + 999)).toBeCloseTo(FADE_FLOOR, 5);
    expect(lateWeightMult(card('range'), RAMP_FULL + 999)).toBeCloseTo(RISE_CEIL, 5);
  });
  it('holds neutral at exactly 1 at every wave', () => {
    for (const w of [0, RAMP_START, (RAMP_START + RAMP_FULL) / 2, RAMP_FULL, RAMP_FULL + 50])
      expect(lateWeightMult(card('multi'), w)).toBe(1);
  });
  it('is monotone in wave for fade (down) and rise (up)', () => {
    let prevFade = Infinity, prevRise = -Infinity;
    for (let w = RAMP_START; w <= RAMP_FULL; w += 5) {
      const f = lateWeightMult(card('essence'), w);
      const r = lateWeightMult(card('overkill'), w);
      expect(f).toBeLessThanOrEqual(prevFade);
      expect(r).toBeGreaterThanOrEqual(prevRise);
      prevFade = f; prevRise = r;
    }
  });
});

describe('rollDraft late re-weighting', () => {
  // Count how often a full hand of many draws lands on a rise-affinity card,
  // early (wave 0 → all ×1) vs deep-late (>= RAMP_FULL → full skew), same RNG.
  const riseShare = (wave: number): number => {
    const rng = seq(0.05, 0.37, 0.61, 0.83, 0.12, 0.49, 0.71, 0.93, 0.28, 0.55);
    let rise = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      const hand = rollDraft(rng, 3, DRAFT_POOL, RARITY_WEIGHT, wave);
      for (const c of hand) { total++; if (lateAffinity(c.effect) === 'rise') rise++; }
    }
    return rise / total;
  };

  it('draws rise-affinity cards materially more often deep in a run', () => {
    expect(riseShare(RAMP_FULL + 20)).toBeGreaterThan(riseShare(0) + 0.1);
  });

  it("defaults to today's distribution when no wave is passed", () => {
    // Same RNG, same pool: omitting wave must equal passing wave 0 (t = 0, all ×1).
    const rng1 = seq(0.05, 0.37, 0.61, 0.83, 0.12);
    const rng2 = seq(0.05, 0.37, 0.61, 0.83, 0.12);
    const a = rollDraft(rng1, 3, DRAFT_POOL, RARITY_WEIGHT);
    const b = rollDraft(rng2, 3, DRAFT_POOL, RARITY_WEIGHT, 0);
    expect(a.map(c => c.id)).toEqual(b.map(c => c.id));
  });
});

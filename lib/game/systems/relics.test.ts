import { describe, it, expect } from 'vitest';
import {
  RELICS,
  TIER_WEIGHT,
  availableRelics,
  rollRelicChoice,
  shouldExecute,
  interestGain,
  soulStealKills,
  soulStealAddChance,
  SOUL_STEAL_BASE_KILLS,
} from './relics';

/** A deterministic RNG that yields the given sequence, then 0 forever. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
};

describe('RELICS pool', () => {
  it('has unique ids and a known tier for every relic', () => {
    const ids = new Set(RELICS.map(r => r.id));
    expect(ids.size).toBe(RELICS.length);
    for (const r of RELICS) {
      expect(r.name).toBeTruthy();
      expect(r.desc).toBeTruthy();
      expect(r.icon).toMatch(/^(https?:\/\/|\/|\.\/)?\S+\.png$/); // baked local asset (or wiki fallback)
      expect(TIER_WEIGHT[r.tier]).toBeGreaterThan(0);
    }
  });
});

describe('Soul Eater', () => {
  it('heals on a kill, not a schedule: guaranteed on bosses, hundreds of kills otherwise', () => {
    const relic = RELICS.find(r => r.id === 'soul_stealer');
    expect(relic?.effect.kind).toBe('soulSteal'); // a boss-guaranteed on-kill heal, not an every-Nth-kill schedule
    if (relic?.effect.kind === 'soulSteal') {
      expect(relic.effect.bossHeal).toBe(1);
      expect(relic.effect.addKills).toBeGreaterThanOrEqual(100);
    }
  });

  it('is a mythic — it rewrites the run, and used to make every healing card pointless', () => {
    expect(RELICS.find(r => r.id === 'soul_stealer')?.tier).toBe('mythic');
  });

  it('gets hungrier as the waves climb, so bigger hordes do not refund the rarity', () => {
    expect(soulStealKills(SOUL_STEAL_BASE_KILLS, 1)).toBe(SOUL_STEAL_BASE_KILLS);
    expect(soulStealKills(SOUL_STEAL_BASE_KILLS, 100))
      .toBeGreaterThan(soulStealKills(SOUL_STEAL_BASE_KILLS, 20));
    // The old flat 10% is the thing this must never be again.
    expect(soulStealAddChance(SOUL_STEAL_BASE_KILLS, 1)).toBeLessThanOrEqual(0.01);
    expect(soulStealAddChance(SOUL_STEAL_BASE_KILLS, 300))
      .toBeLessThan(soulStealAddChance(SOUL_STEAL_BASE_KILLS, 1));
  });

  it('never divides by zero, however the base is configured', () => {
    expect(soulStealKills(0, 1)).toBeGreaterThan(0);
    expect(Number.isFinite(soulStealAddChance(0, 1))).toBe(true);
  });
});

describe('availableRelics', () => {
  it('drops every owned relic', () => {
    const owned = new Set([RELICS[0].id, RELICS[1].id]);
    const avail = availableRelics(owned);
    expect(avail).toHaveLength(RELICS.length - 2);
    expect(avail.some(r => owned.has(r.id))).toBe(false);
  });
});

describe('rollRelicChoice', () => {
  it('draws distinct, un-owned relics', () => {
    const choice = rollRelicChoice(Math.random, new Set(), 3);
    expect(choice).toHaveLength(3);
    expect(new Set(choice.map(r => r.id)).size).toBe(3);
  });
  it('never offers an already-owned relic', () => {
    const owned = new Set(RELICS.slice(0, RELICS.length - 2).map(r => r.id));
    const choice = rollRelicChoice(Math.random, owned, 3);
    // Only two un-owned remain, so it can offer at most two.
    expect(choice).toHaveLength(2);
    expect(choice.every(r => !owned.has(r.id))).toBe(true);
  });
  it('returns an empty choice when nothing is left', () => {
    const owned = new Set(RELICS.map(r => r.id));
    expect(rollRelicChoice(Math.random, owned, 3)).toEqual([]);
  });
  it('never returns more than the requested count', () => {
    expect(rollRelicChoice(Math.random, new Set(), 2)).toHaveLength(2);
  });
  it('weights the roll by tier (a low roll lands on the first eligible)', () => {
    // roll≈0 always picks index 0 of the remaining list each draw, which is the
    // pool order — deterministic and never a duplicate.
    const choice = rollRelicChoice(seq(0, 0, 0), new Set(), 3);
    expect(choice.map(r => r.id)).toEqual([RELICS[0].id, RELICS[1].id, RELICS[2].id]);
  });
});

describe('shouldExecute', () => {
  it('fires only at/below the threshold when the relic is owned', () => {
    expect(shouldExecute(0.12, 11, 100)).toBe(true);   // below 12%
    expect(shouldExecute(0.12, 12, 100)).toBe(true);   // exactly at
    expect(shouldExecute(0.12, 13, 100)).toBe(false);  // above
  });
  it('is off without the relic, or on an already-dead enemy', () => {
    expect(shouldExecute(0, 5, 100)).toBe(false);
    expect(shouldExecute(0.12, 0, 100)).toBe(false);
    expect(shouldExecute(0.12, -4, 100)).toBe(false);
  });
});

describe('interestGain', () => {
  it('pays the floored rate, capped', () => {
    expect(interestGain(0.06, 80, 1000)).toBe(60);
    expect(interestGain(0.06, 80, 100)).toBe(6);
    expect(interestGain(0.06, 80, 5000)).toBe(80); // capped
    expect(interestGain(0.06, 80, 0)).toBe(0);
    expect(interestGain(0.06, 80, -50)).toBe(0); // never negative
  });
});

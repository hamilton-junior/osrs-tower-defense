import { describe, it, expect } from 'vitest';
import { DAILY_RULES, NO_DAILY_EFFECTS, dailyEffects, dailyEffectsFor, dailyRules, dailyStartLives, type DailyEffects } from './daily-rules';
import { shiftKey } from './daily-seed';
import { MIN_LIVES } from './difficulty';

const DAY = '2026-09-24';
const days = (n: number) => Array.from({ length: n }, (_, i) => shiftKey(DAY, i));

/** Whether an effect helps the player, judged per lever. */
function helps(fx: DailyEffects): boolean {
  return fx.towerCost < 1 || fx.killGold > 1 || fx.startGold > 0 || fx.enemyHp < 1 || fx.enemySpeed < 1
    || fx.towerDamage > 1 || fx.towerRange > 1 || fx.towerFireRate > 1 || fx.livesDelta > 0;
}
function hurts(fx: DailyEffects): boolean {
  return fx.towerCost > 1 || fx.killGold < 1 || fx.startGold < 0 || fx.enemyHp > 1 || fx.enemySpeed > 1
    || fx.towerDamage < 1 || fx.towerRange < 1 || fx.towerFireRate < 1 || fx.livesDelta < 0;
}

describe('DAILY_RULES', () => {
  it('has unique ids', () => {
    expect(new Set(DAILY_RULES.map((r) => r.id)).size).toBe(DAILY_RULES.length);
  });

  it('makes every boon help and every curse hurt, never both', () => {
    for (const r of DAILY_RULES) {
      const fx = dailyEffects([r]);
      expect(helps(fx), r.id).toBe(r.kind === 'boon');
      expect(hurts(fx), r.id).toBe(r.kind === 'curse');
    }
  });

  it('gives every category at least one boon and one curse', () => {
    for (const c of ['economy', 'enemies', 'towers', 'lives'] as const) {
      expect(DAILY_RULES.some((r) => r.category === c && r.kind === 'boon'), c).toBe(true);
      expect(DAILY_RULES.some((r) => r.category === c && r.kind === 'curse'), c).toBe(true);
    }
  });
});

describe('dailyRules', () => {
  it('draws the same pair for the same day', () => {
    expect(dailyRules(DAY)).toEqual(dailyRules(DAY));
  });

  it('draws one boon and one curse from different categories', () => {
    for (const d of days(200)) {
      const { boon, curse } = dailyRules(d);
      expect(boon.kind).toBe('boon');
      expect(curse.kind).toBe('curse');
      expect(boon.category).not.toBe(curse.category);
    }
  });

  it('changes between days and reaches every rule', () => {
    const seen = new Set<string>();
    const pairs = new Set<string>();
    for (const d of days(365)) {
      const { boon, curse } = dailyRules(d);
      seen.add(boon.id).add(curse.id);
      pairs.add(`${boon.id}+${curse.id}`);
    }
    expect(seen.size).toBe(DAILY_RULES.length);
    expect(pairs.size).toBeGreaterThan(20);
  });
});

describe('dailyEffects', () => {
  it('is the identity with no rules', () => {
    expect(dailyEffects([])).toEqual(NO_DAILY_EFFECTS);
  });

  it('multiplies multipliers and adds deltas', () => {
    const fx = dailyEffects([
      { id: 'a', kind: 'boon', category: 'economy', text: '', icon: 'coins_icon', effect: { killGold: 1.25, startGold: 100 } },
      { id: 'b', kind: 'curse', category: 'economy', text: '', icon: 'coins_icon', effect: { killGold: 0.8, startGold: -40 } },
    ]);
    expect(fx.killGold).toBeCloseTo(1);
    expect(fx.startGold).toBe(60);
    expect(fx.towerCost).toBe(1);
  });
});

describe('dailyEffectsFor', () => {
  it('is neutral outside a daily', () => {
    expect(dailyEffectsFor(null)).toEqual(NO_DAILY_EFFECTS);
  });

  it('folds the day pair', () => {
    const { boon, curse } = dailyRules(DAY);
    expect(dailyEffectsFor(DAY)).toEqual(dailyEffects([boon, curse]));
    // A second day refreshes the cache instead of serving the first day's pair.
    const next = shiftKey(DAY, 1);
    const p = dailyRules(next);
    expect(dailyEffectsFor(next)).toEqual(dailyEffects([p.boon, p.curse]));
  });
});

describe('dailyStartLives', () => {
  it('applies the delta and never drops below MIN_LIVES', () => {
    expect(dailyStartLives(20, { ...NO_DAILY_EFFECTS, livesDelta: 5 })).toBe(25);
    expect(dailyStartLives(20, { ...NO_DAILY_EFFECTS, livesDelta: -8 })).toBe(12);
    expect(dailyStartLives(6, { ...NO_DAILY_EFFECTS, livesDelta: -8 })).toBe(MIN_LIVES);
  });
});

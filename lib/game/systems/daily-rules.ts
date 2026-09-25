/**
 * The daily challenge's two house rules: one boon and one curse, drawn from the
 * day's seed so every player fights under the same pair. They only change the
 * game — the score board reads the same way on every day.
 *
 * Pure and unit-tested. The engine reads {@link dailyEffectsFor} at its call
 * sites (tower price, kill gold, start gold and lives, enemy and tower stats);
 * the start screen reads {@link dailyRules} to show the pair before the run.
 */
import type { ASSETS } from '../assets';
import { dailySeed, type DayKey } from './daily-seed';
import { makeRng } from './map-generation';
import { MIN_LIVES } from './difficulty';

export type DailyRuleKind = 'boon' | 'curse';
export type DailyCategory = 'economy' | 'enemies' | 'towers' | 'lives';

/** Every lever a rule can pull. All multipliers are 1 and all deltas 0 when
 *  nothing is pulled, which is what a non-daily run sees. */
export interface DailyEffects {
  /** × on every tower's base price, before the owned-count escalation. */
  towerCost: number;
  /** × on gold per kill. */
  killGold: number;
  /** Added to the starting gold. */
  startGold: number;
  /** × on enemy HP. */
  enemyHp: number;
  /** × on enemy walk speed. */
  enemySpeed: number;
  /** × on every tower's damage. */
  towerDamage: number;
  /** × on every tower's range. */
  towerRange: number;
  /** × on every tower's attack speed (above 1 attacks faster). */
  towerFireRate: number;
  /** Added to starting lives, floored at {@link MIN_LIVES}. */
  livesDelta: number;
}

export const NO_DAILY_EFFECTS: Readonly<DailyEffects> = Object.freeze({
  towerCost: 1, killGold: 1, startGold: 0, enemyHp: 1, enemySpeed: 1,
  towerDamage: 1, towerRange: 1, towerFireRate: 1, livesDelta: 0,
});

export interface DailyRule {
  id: string;
  kind: DailyRuleKind;
  category: DailyCategory;
  /** One short line the player reads on the start screen. */
  text: string;
  /** A key of `ASSETS.misc`, resolved by the UI. */
  icon: keyof typeof ASSETS.misc;
  effect: Partial<DailyEffects>;
}

/** The pool. Numbers are shapes for the user to tune; the tests protect that
 *  every boon helps, every curse hurts and every category has one of each. */
export const DAILY_RULES: readonly DailyRule[] = [
  // Economy
  { id: 'bounty', kind: 'boon', category: 'economy', text: 'Kills pay more gold.', icon: 'coins_icon', effect: { killGold: 1.25 } },
  { id: 'bargain', kind: 'boon', category: 'economy', text: 'Towers cost less.', icon: 'coins_icon', effect: { towerCost: 0.8 } },
  { id: 'purse', kind: 'boon', category: 'economy', text: 'You start with extra gold.', icon: 'coins_icon', effect: { startGold: 150 } },
  { id: 'toll', kind: 'curse', category: 'economy', text: 'Towers cost more.', icon: 'coins_icon', effect: { towerCost: 1.25 } },
  { id: 'lean', kind: 'curse', category: 'economy', text: 'Kills pay less gold.', icon: 'coins_icon', effect: { killGold: 0.8 } },
  // Enemies
  { id: 'frail', kind: 'boon', category: 'enemies', text: 'Enemies have less health.', icon: 'hp_icon', effect: { enemyHp: 0.85 } },
  { id: 'weary', kind: 'boon', category: 'enemies', text: 'Enemies walk slower.', icon: 'orb_run', effect: { enemySpeed: 0.9 } },
  { id: 'tough', kind: 'curse', category: 'enemies', text: 'Enemies have more health.', icon: 'hp_icon', effect: { enemyHp: 1.2 } },
  { id: 'swift', kind: 'curse', category: 'enemies', text: 'Enemies walk faster.', icon: 'orb_run', effect: { enemySpeed: 1.12 } },
  // Towers
  { id: 'keen', kind: 'boon', category: 'towers', text: 'Towers hit harder.', icon: 'strength_icon', effect: { towerDamage: 1.15 } },
  { id: 'eagle', kind: 'boon', category: 'towers', text: 'Towers reach farther.', icon: 'ranged_icon', effect: { towerRange: 1.1 } },
  { id: 'blunt', kind: 'curse', category: 'towers', text: 'Towers hit softer.', icon: 'strength_icon', effect: { towerDamage: 0.87 } },
  { id: 'rusty', kind: 'curse', category: 'towers', text: 'Towers attack slower.', icon: 'attack_icon', effect: { towerFireRate: 0.9 } },
  // Lives
  { id: 'hardy', kind: 'boon', category: 'lives', text: 'You start with more lives.', icon: 'orb_hitpoints', effect: { livesDelta: 5 } },
  { id: 'brittle', kind: 'curse', category: 'lives', text: 'You start with fewer lives.', icon: 'orb_hitpoints', effect: { livesDelta: -8 } },
];

/** Keeps the rule draw off the map generator's stream: the same day seeds both,
 *  and the road must not decide the rules. */
const RULE_SALT = 0x5bd1e995;

/** The day's boon and curse. Deterministic per day; the two never share a
 *  category, so a boon never cancels its own curse. */
export function dailyRules(key: DayKey): { boon: DailyRule; curse: DailyRule } {
  const rng = makeRng((dailySeed(key) ^ RULE_SALT) >>> 0);
  const boons = DAILY_RULES.filter((r) => r.kind === 'boon');
  const boon = boons[Math.floor(rng() * boons.length)];
  const curses = DAILY_RULES.filter((r) => r.kind === 'curse' && r.category !== boon.category);
  const curse = curses[Math.floor(rng() * curses.length)];
  return { boon, curse };
}

/** Folds rules into one effect record: multipliers multiply, deltas add. */
export function dailyEffects(rules: readonly DailyRule[]): DailyEffects {
  const out: DailyEffects = { ...NO_DAILY_EFFECTS };
  for (const r of rules) {
    for (const k of Object.keys(r.effect) as (keyof DailyEffects)[]) {
      const v = r.effect[k]!;
      if (k === 'startGold' || k === 'livesDelta') out[k] += v;
      else out[k] *= v;
    }
  }
  return out;
}

let cache: { key: DayKey; fx: DailyEffects } | null = null;

/** The effects in force for a run: the day's pair on a daily, nothing otherwise.
 *  Cached by day, because the engine asks on every price and every spawn. */
export function dailyEffectsFor(key: DayKey | null): Readonly<DailyEffects> {
  if (!key) return NO_DAILY_EFFECTS;
  if (cache?.key !== key) {
    const { boon, curse } = dailyRules(key);
    cache = { key, fx: dailyEffects([boon, curse]) };
  }
  return cache.fx;
}

/** Starting lives after the daily delta, never below {@link MIN_LIVES}. */
export function dailyStartLives(baseLives: number, fx: Readonly<DailyEffects>): number {
  return Math.max(MIN_LIVES, baseLives + fx.livesDelta);
}

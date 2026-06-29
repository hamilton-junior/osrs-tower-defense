import type { GlobalUpgrades } from '../types';

/**
 * Meta-progression: the between-run upgrade economy. Clearing waves earns Rune
 * Essence (a persistent currency); essence is spent in the Essence Shop on
 * permanent {@link GlobalUpgrades} that seed every future run. This module is the
 * pure, tested core — the catalog plus the reward/cost/clamp maths. The engine's
 * {@link MetaSystem} owns the live state and the React layer persists it.
 *
 * The upgrades object IS the whole save: a purchase just steps one field toward
 * its cap, so the number of times bought (and therefore the next price) is
 * derived from the current value — no separate purchase-count bookkeeping.
 */

/** Baseline upgrades — every multiplier at ×1.0, every additive at 0. A fresh
 *  save starts here; the catalog steps each field up to its cap. */
export const DEFAULT_UPGRADES: GlobalUpgrades = {
  archerRange: 1,
  archerDamage: 1,
  magicDamage: 1,
  cannonSpeed: 1,
  slayerReward: 1,
  prayerEfficiency: 1,
  startingMoney: 0,
  rewardMultiplier: 1,
  waveSpeed: 1,
  towerCostReduction: 1,
  xpGainMultiplier: 1,
  prayerRegen: 0,
};

/** How a row's current value is rendered in the shop. */
export type UpgradeFormat = 'gp' | 'mulBonus' | 'mulReduction' | 'perSec';

export interface UpgradeDef {
  id: keyof GlobalUpgrades;
  name: string;
  desc: string;
  /** Wiki sprite filename (no extension), drawn via `ASSETS.misc.wiki_base`. */
  icon: string;
  /** Essence cost of the FIRST purchase; doubles with each subsequent buy. */
  baseCost: number;
  /** Per-purchase delta on the value (negative for cost reductions). */
  inc: number;
  /** Value at zero purchases (must equal the DEFAULT_UPGRADES entry). */
  baseline: number;
  /** Saturated value — the cap for positive `inc`, the floor for negative. */
  max: number;
  format: UpgradeFormat;
}

/**
 * The MVP Essence Shop catalog. Every entry maps to a field the new core
 * actually applies today (tower-combat upgrades, starting gold, gold rewards,
 * build-cost reduction, prayer regen) — no dead upgrades. Unlock gates from the
 * legacy shop are dropped for now (they keyed off quests/achievements that the
 * new core hasn't reintroduced).
 */
export const GLOBAL_UPGRADE_DEFS: readonly UpgradeDef[] = [
  { id: 'startingMoney', name: 'Starting Gold', desc: 'Begin each run with more gold', icon: 'Coins_detail', baseCost: 50, inc: 50, baseline: 0, max: 500, format: 'gp' },
  { id: 'archerRange', name: 'Eagle Eye', desc: 'Archer towers fire farther', icon: 'Ranged_icon', baseCost: 100, inc: 0.1, baseline: 1, max: 2.0, format: 'mulBonus' },
  { id: 'archerDamage', name: 'Deadshot', desc: 'Archer towers hit harder', icon: 'Ranged_icon', baseCost: 150, inc: 0.1, baseline: 1, max: 2.5, format: 'mulBonus' },
  { id: 'magicDamage', name: 'Mystic Might', desc: 'Wizard towers hit harder', icon: 'Magic_icon', baseCost: 150, inc: 0.1, baseline: 1, max: 2.5, format: 'mulBonus' },
  { id: 'cannonSpeed', name: 'Dwarf Engineering', desc: 'Cannon towers fire faster', icon: 'Cannon_barrels', baseCost: 200, inc: 0.1, baseline: 1, max: 2.0, format: 'mulBonus' },
  { id: 'rewardMultiplier', name: 'Wealthy Drops', desc: 'More gold from kills and wave clears', icon: 'Coins_detail', baseCost: 250, inc: 0.2, baseline: 1, max: 3.0, format: 'mulBonus' },
  { id: 'towerCostReduction', name: 'Bargain Hunter', desc: 'Towers cost less to build', icon: 'Coins_detail', baseCost: 300, inc: -0.05, baseline: 1, max: 0.5, format: 'mulReduction' },
  { id: 'prayerRegen', name: 'Prayer Regeneration', desc: 'Prayer points recover between fights', icon: 'Prayer_icon', baseCost: 200, inc: 0.2, baseline: 0, max: 1.0, format: 'perSec' },
];

/** Essence awarded for clearing `wave` — scales gently so late waves pay more.
 *  Cut to 25% of the original rate so meta upgrades are earned more slowly. */
export function essenceForWave(wave: number): number {
  return Math.floor((5 + Math.max(0, wave) * 1.5) * 0.25);
}

const EPS = 1e-6;

/** Times this upgrade has been bought, derived from its current value. */
export function purchaseCount(def: UpgradeDef, value: number): number {
  return Math.max(0, Math.round((value - def.baseline) / def.inc));
}

/** Essence cost of the NEXT purchase — geometric (doubles each time). */
export function nextCost(def: UpgradeDef, value: number): number {
  return def.baseCost * Math.pow(2, purchaseCount(def, value));
}

/** Total essence sunk into one upgrade at its current value — the geometric sum
 *  of every purchase made so far (baseCost·(2^count − 1)). */
export function spentOn(def: UpgradeDef, value: number): number {
  return def.baseCost * (Math.pow(2, purchaseCount(def, value)) - 1);
}

/** Total essence spent across all bought upgrades — the basis for a refund. */
export function totalEssenceSpent(upgrades: GlobalUpgrades): number {
  return GLOBAL_UPGRADE_DEFS.reduce((sum, def) => sum + spentOn(def, upgrades[def.id]), 0);
}

/** Fraction of spent essence returned by a full refund (the rest is the sink). */
export const REFUND_RATE = 0.9;

/** Essence returned by refunding every upgrade at the current `upgrades` state. */
export function refundValue(upgrades: GlobalUpgrades): number {
  return Math.floor(totalEssenceSpent(upgrades) * REFUND_RATE);
}

/** Whether the upgrade is already saturated (a further step would pass the cap). */
export function isMaxed(def: UpgradeDef, value: number): boolean {
  return def.inc > 0 ? value >= def.max - EPS : value <= def.max + EPS;
}

/** The value after one more purchase, clamped to the cap. */
export function steppedValue(def: UpgradeDef, value: number): number {
  const next = value + def.inc;
  return def.inc > 0 ? Math.min(next, def.max) : Math.max(next, def.max);
}

/** Human-readable current value for a shop row (e.g. "+30%", "-15%", "+250 gp"). */
export function formatUpgradeValue(def: UpgradeDef, value: number): string {
  switch (def.format) {
    case 'gp': return `+${Math.round(value)} gp`;
    case 'mulBonus': return `+${Math.round((value - 1) * 100)}%`;
    case 'mulReduction': return `-${Math.round((1 - value) * 100)}%`;
    case 'perSec': return `+${value.toFixed(1)}/s`;
  }
}

/**
 * Merge a (possibly partial, stale, or out-of-range) saved blob onto the
 * defaults, clamping each catalogued field to its valid range. Unknown/garbage
 * input yields a clean default set, so a corrupt save can never brick a run.
 */
export function sanitizeUpgrades(raw: unknown): GlobalUpgrades {
  const out: GlobalUpgrades = { ...DEFAULT_UPGRADES };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const def of GLOBAL_UPGRADE_DEFS) {
      const v = obj[def.id];
      if (typeof v === 'number' && Number.isFinite(v)) {
        const lo = Math.min(def.baseline, def.max);
        const hi = Math.max(def.baseline, def.max);
        out[def.id] = Math.min(hi, Math.max(lo, v));
      }
    }
  }
  return out;
}

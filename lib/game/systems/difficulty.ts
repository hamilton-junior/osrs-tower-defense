/**
 * The vertical difficulty ladder (New Game+). Winning a tier unlocks the next.
 * Tiers are named after the real OSRS Combat Achievement tiers. Tier 0 (Normal)
 * is the identity — byte-for-byte today's game — so the whole ladder is opt-in.
 *
 * Pure and unit-tested: the engine reads {@link tierMods} at run start and the UI
 * reads the unlock helpers. Every number here is the user's to tune, in one place.
 */

export type DifficultyTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TierMods {
  /** × on base enemy HP (≥ 1). Stacks with the per-wave and Endless HP terms. */
  enemyHp: number;
  /** × on base enemy speed (≥ 1). */
  enemySpeed: number;
  /** × on gold per kill (≤ 1) — a tighter economy, never inflated. */
  gold: number;
  /** Added to START_LIVES / maxLives at run start (≤ 0), floored at MIN_LIVES. */
  livesDelta: number;
}

/** Effective starting lives never drop below this — a tier is hard, never
 *  structurally unwinnable. Chosen against START_LIVES = 20. */
export const MIN_LIVES = 5;

export const MAX_TIER: DifficultyTier = 6;

/** The ladder. Numbers are illustrative shapes — tune freely; the monotonicity
 *  and identity invariants are what the tests protect. */
export const DIFFICULTY_TIERS: readonly { id: DifficultyTier; name: string; mods: TierMods }[] = [
  { id: 0, name: 'Normal',      mods: { enemyHp: 1.00, enemySpeed: 1.00, gold: 1.00, livesDelta: 0 } },
  { id: 1, name: 'Easy',        mods: { enemyHp: 1.15, enemySpeed: 1.00, gold: 0.95, livesDelta: 0 } },
  { id: 2, name: 'Medium',      mods: { enemyHp: 1.35, enemySpeed: 1.03, gold: 0.90, livesDelta: 0 } },
  { id: 3, name: 'Hard',        mods: { enemyHp: 1.60, enemySpeed: 1.05, gold: 0.85, livesDelta: -5 } },
  { id: 4, name: 'Elite',       mods: { enemyHp: 1.90, enemySpeed: 1.08, gold: 0.80, livesDelta: -10 } },
  { id: 5, name: 'Master',      mods: { enemyHp: 2.30, enemySpeed: 1.10, gold: 0.75, livesDelta: -15 } },
  { id: 6, name: 'Grandmaster', mods: { enemyHp: 2.80, enemySpeed: 1.12, gold: 0.70, livesDelta: -20 } },
] as const;

/** Coerce any number to a valid tier id (defence for stored / injected values). */
export function clampTier(n: number): DifficultyTier {
  const i = Math.max(0, Math.min(MAX_TIER, Math.floor(n)));
  return i as DifficultyTier;
}

/** Mods for a tier (tier 0 = identity). */
export function tierMods(tier: DifficultyTier): TierMods {
  return DIFFICULTY_TIERS[clampTier(tier)].mods;
}

/** The highest tier a player may select for a mode, given the highest they have
 *  cleared (-1 = nothing cleared): cleared + 1, capped at Grandmaster. */
export function highestUnlockedTier(highestCleared: number): DifficultyTier {
  return clampTier(highestCleared + 1);
}

/** Guard: is `tier` selectable given `highestCleared`? */
export function isTierUnlocked(tier: DifficultyTier, highestCleared: number): boolean {
  return tier <= highestUnlockedTier(highestCleared);
}

/** Starting lives for a run at `tier`, given the game's base START_LIVES. The
 *  floor lives here (one tested place) so the raw table can cut aggressively
 *  without ever making a tier unwinnable by construction. The engine calls this
 *  rather than inlining the clamp. */
export function effectiveStartLives(baseLives: number, tier: DifficultyTier): number {
  return Math.max(MIN_LIVES, baseLives + tierMods(tier).livesDelta);
}

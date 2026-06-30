import { ASSETS } from '../assets';
import type { CombatStyle } from '../types';

/**
 * Enemy affixes: per-instance modifiers that change how a *normal* enemy behaves
 * (never bosses — those carry their own mechanics). From {@link AFFIX_UNLOCK_WAVE}
 * onward a fraction of spawned enemies roll one (or, very late, two) affixes that
 * force the player to *adapt* the build rather than stack a single tower —
 * shields punish fast chip damage, armour forces style diversity, wards punish
 * crowd-control builds, and so on.
 *
 * This module is **pure** (RNG injected, no `this`/DOM): the roll and every stat
 * helper are unit-testable. The engine owns spawning the rolled affixes onto an
 * {@link Enemy}, applying their combat hooks, and drawing their auras.
 */

export type EnemyAffix =
  | 'shielded'      // absorbs a flat shield pool before HP — punishes chip DPS
  | 'armored'       // −50% damage from ONE rolled style — forces style diversity
  | 'regenerating'  // regenerates HP/s — punishes slow, dribbled damage
  | 'swarm'         // spawns as a trio of weaker copies — saturates single-target
  | 'hasted'        // moves faster — punishes thin coverage
  | 'warded'        // immune to slow / stun / freeze — punishes CC-reliant builds
  | 'volatile'      // on death, stuns the nearest tower — punishes tight clusters
  | 'colossal';     // one big, slow, tanky leaker that costs an extra life

export interface AffixDef {
  id: EnemyAffix;
  name: string;
  /** One-line, OSRS-flavoured explanation for the enemy hover panel / tutorial. */
  desc: string;
  /** Aura tint the renderer draws around an enemy carrying this affix. */
  color: string;
  /** Icon URL (wiki item art, hot-linked like the draft cards; degrades away). */
  icon: string;
}

const W = ASSETS.misc.wiki_base;

export const AFFIX_DEFS: Record<EnemyAffix, AffixDef> = {
  shielded:     { id: 'shielded',     name: 'Shielded',     desc: 'Absorbs a shield of damage before its health is touched.', color: '#7fd0ff', icon: `${W}Rune_kiteshield.png` },
  armored:      { id: 'armored',      name: 'Armored',      desc: 'Takes half damage from one combat style — bring another.', color: '#9aa0a8', icon: `${W}Dragon_platebody.png` },
  regenerating: { id: 'regenerating', name: 'Regenerating', desc: 'Heals over time — finish it fast or it claws health back.', color: '#57d957', icon: `${W}Regen_bracelet.png` },
  swarm:        { id: 'swarm',        name: 'Swarm',        desc: 'Arrives as a pack of weaker copies — bring area damage.', color: '#b6d957', icon: `${W}Kalphite_larva.png` },
  hasted:       { id: 'hasted',       name: 'Hasted',       desc: 'Moves much faster — your coverage gaps will show.', color: '#cfe8ff', icon: `${W}Graceful_boots.png` },
  warded:       { id: 'warded',       name: 'Warded',       desc: 'Immune to slows, stuns and freezes.', color: '#b07cff', icon: `${W}Spirit_shield.png` },
  volatile:     { id: 'volatile',     name: 'Volatile',     desc: 'Detonates on death, briefly disabling the nearest tower.', color: '#ff7a3c', icon: `${W}Volatile_orb.png` },
  colossal:     { id: 'colossal',     name: 'Colossal',     desc: 'A hulking straggler — extra health, but costs two lives if it leaks.', color: '#d9a957', icon: `${W}Granite_maul.png` },
};

export const ALL_AFFIXES: readonly EnemyAffix[] = Object.keys(AFFIX_DEFS) as EnemyAffix[];

// ───────────────────────────── tuning constants ────────────────────────────
/** No affixes before this wave — the early game stays a clean teaching ground. */
export const AFFIX_UNLOCK_WAVE = 5;
/** Per-wave step and ceiling for the chance a given enemy rolls any affix. */
export const ELITE_CHANCE_STEP = 0.03;
export const ELITE_CHANCE_CAP = 0.35;
/**
 * Multi-affix stacking. Once an enemy is elite it always gets one affix; each
 * *additional* affix is an independent roll whose chance ramps with the wave and
 * decays per affix already granted, with NO hard ceiling on the count — late
 * waves can (rarely) pile several on. The ramp is deliberately 0 at
 * {@link AFFIX_UNLOCK_WAVE}: on the very wave affixes unlock an elite is
 * guaranteed *exactly one*, so the player can never be blindsided by a fully
 * stacked enemy the moment the mechanic appears.
 */
export const EXTRA_AFFIX_MAX = 0.5;        // first-extra chance at full ramp
export const EXTRA_AFFIX_RAMP_WAVES = 25;  // waves from unlock → full ramp
export const EXTRA_AFFIX_DECAY = 0.5;      // each further extra half as likely

/**
 * Boss modifiers. A boss only rolls these once it has been *seen at least once*
 * (the engine gates the call); the pool is the subset of affixes that read
 * cleanly on a single large target (no swarm/colossal/volatile). A seen boss has
 * {@link BOSS_AFFIX_CHANCE} to get one, then {@link BOSS_EXTRA_AFFIX_CHANCE} for
 * a second — at most two, so its own phase mechanics stay the headline act.
 */
export const BOSS_AFFIX_POOL: readonly EnemyAffix[] = ['shielded', 'armored', 'regenerating', 'hasted', 'warded'];
export const BOSS_AFFIX_CHANCE = 0.6;
export const BOSS_EXTRA_AFFIX_CHANCE = 0.25;

/** Shield pool = this fraction of the enemy's (already wave-scaled) max HP. */
export const SHIELD_HP_FRAC = 0.12;
/** Damage multiplier applied to the armored enemy's resisted style. */
export const ARMORED_RESIST = 0.5;
/** Regen per second = this fraction of max HP. */
export const REGEN_FRAC_PER_SEC = 0.02;
/** A swarm enemy spawns SWARM_COUNT copies, each at SWARM_HP_MULT health. */
export const SWARM_COUNT = 3;
export const SWARM_HP_MULT = 0.5;
/** Hasted speed multiplier. */
export const HASTE_SPEED_MULT = 1.35;
/** Colossal: tankier, slower, larger, and a heavier leak. */
export const COLOSSAL_HP_MULT = 1.6;
export const COLOSSAL_SPEED_MULT = 0.8;
export const COLOSSAL_RENDER_SCALE = 1.4;
/** Seconds the nearest tower is disabled by a Volatile enemy's death. */
export const VOLATILE_STUN_SECS = 1.5;

const ARMOR_STYLES: readonly CombatStyle[] = ['ranged', 'magic', 'melee'];

/** Chance (0–1) that an enemy on `wave` rolls any affix at all. */
export function eliteChanceForWave(wave: number): number {
  if (wave < AFFIX_UNLOCK_WAVE) return 0;
  return Math.min(ELITE_CHANCE_CAP, (wave - AFFIX_UNLOCK_WAVE + 1) * ELITE_CHANCE_STEP);
}

/**
 * Chance (0–1) of granting one *more* affix when `granted` are already on the
 * enemy. Ramps linearly from 0 at the unlock wave to {@link EXTRA_AFFIX_MAX}
 * over {@link EXTRA_AFFIX_RAMP_WAVES} waves, then halves for every affix already
 * granted ({@link EXTRA_AFFIX_DECAY}). 0 on the unlock wave → guaranteed single.
 */
export function extraAffixChance(wave: number, granted: number): number {
  const ramp = Math.max(0, Math.min(1, (wave - AFFIX_UNLOCK_WAVE) / EXTRA_AFFIX_RAMP_WAVES));
  return EXTRA_AFFIX_MAX * ramp * Math.pow(EXTRA_AFFIX_DECAY, Math.max(0, granted - 1));
}

/** Pick the style an `armored` enemy resists. */
export function rollArmoredStyle(rng: () => number): CombatStyle {
  return ARMOR_STYLES[Math.floor(rng() * ARMOR_STYLES.length)] ?? 'melee';
}

export interface AffixRoll {
  affixes: EnemyAffix[];
  /** Present only when `armored` is rolled — the style it takes reduced damage from. */
  armoredStyle?: CombatStyle;
}

/** Draw one guaranteed affix from `pool`, then keep drawing extras while the
 *  per-extra `extraChance(granted)` roll succeeds and the pool isn't empty.
 *  Attaches an `armoredStyle` if `armored` came out. Mutates (consumes) `pool`. */
function drawAffixes(pool: EnemyAffix[], rng: () => number, extraChance: (granted: number) => number): AffixRoll {
  const take = () => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const affixes: EnemyAffix[] = [take()];
  while (pool.length && rng() < extraChance(affixes.length)) affixes.push(take());
  const roll: AffixRoll = { affixes };
  if (affixes.includes('armored')) roll.armoredStyle = rollArmoredStyle(rng);
  return roll;
}

/**
 * Roll the affixes for one freshly-spawned *normal* enemy. Bosses and pre-unlock
 * waves always return an empty roll (bosses go through {@link rollBossAffixes}).
 * `rng` is injected (`Math.random` in the engine) so the result is deterministic
 * under test. An elite always gets one affix and may stack more — see
 * {@link extraAffixChance}.
 */
export function rollAffixes(wave: number, isBoss: boolean, rng: () => number): AffixRoll {
  if (isBoss) return { affixes: [] };
  const chance = eliteChanceForWave(wave);
  if (chance <= 0 || rng() >= chance) return { affixes: [] };
  return drawAffixes([...ALL_AFFIXES], rng, (granted) => extraAffixChance(wave, granted));
}

/**
 * Roll modifiers for a boss that has already been seen at least once (the engine
 * only calls this when that's true). Returns an empty roll most of the time;
 * otherwise one affix from {@link BOSS_AFFIX_POOL}, rarely two. Pure / injected
 * RNG like {@link rollAffixes}.
 */
export function rollBossAffixes(rng: () => number): AffixRoll {
  if (rng() >= BOSS_AFFIX_CHANCE) return { affixes: [] };
  return drawAffixes([...BOSS_AFFIX_POOL], rng, () => BOSS_EXTRA_AFFIX_CHANCE);
}

// ──────────────────────── pure runtime stat helpers ────────────────────────
// Each reads the rolled affix list (and, where needed, the enemy's max HP) and
// returns the value the engine applies. All side-effect-free.

const has = (affixes: readonly EnemyAffix[], a: EnemyAffix) => affixes.includes(a);

/** Movement-speed multiplier from affixes (hasted speeds up, colossal slows). */
export function affixSpeedMult(affixes: readonly EnemyAffix[]): number {
  let m = 1;
  if (has(affixes, 'hasted')) m *= HASTE_SPEED_MULT;
  if (has(affixes, 'colossal')) m *= COLOSSAL_SPEED_MULT;
  return m;
}

/** Spawn-time HP multiplier (swarm copies are frail, colossals are tanky). */
export function affixSpawnHpMult(affixes: readonly EnemyAffix[]): number {
  let m = 1;
  if (has(affixes, 'swarm')) m *= SWARM_HP_MULT;
  if (has(affixes, 'colossal')) m *= COLOSSAL_HP_MULT;
  return m;
}

/** Draw-scale multiplier (colossals read bigger on the field). */
export function affixRenderScaleMult(affixes: readonly EnemyAffix[]): number {
  return has(affixes, 'colossal') ? COLOSSAL_RENDER_SCALE : 1;
}

/** Initial shield pool for a shielded enemy (0 when not shielded). */
export function shieldHpFor(affixes: readonly EnemyAffix[], maxHp: number): number {
  return has(affixes, 'shielded') ? Math.round(maxHp * SHIELD_HP_FRAC) : 0;
}

/** HP regenerated per second (0 when not regenerating). */
export function regenPerSec(affixes: readonly EnemyAffix[], maxHp: number): number {
  return has(affixes, 'regenerating') ? maxHp * REGEN_FRAC_PER_SEC : 0;
}

/** Lives lost when this enemy leaks (colossals cost two). */
export function leakLifeCost(affixes: readonly EnemyAffix[]): number {
  return has(affixes, 'colossal') ? 2 : 1;
}

/** Lives lost when an elite / superior monster leaks. */
export const SUPERIOR_LEAK_COST = 3;
/** Base lives a boss costs on a leak, before the per-sighting ramp. */
export const BOSS_LEAK_BASE = 5;
/** Hard cap on a boss leak, no matter how many times it has been seen. */
export const BOSS_LEAK_MAX = 10;

/**
 * Lives lost when a boss leaks: {@link BOSS_LEAK_BASE} plus one per *prior*
 * sighting (each repeat appearance ups the stakes), capped at
 * {@link BOSS_LEAK_MAX}. `priorSightings` excludes the current appearance, so a
 * boss's first leak costs exactly the base.
 */
export function bossLeakCost(priorSightings: number): number {
  return Math.min(BOSS_LEAK_MAX, BOSS_LEAK_BASE + Math.max(0, Math.floor(priorSightings)));
}

/** Whether this enemy ignores slow / stun / freeze. */
export function isCcImmune(affixes: readonly EnemyAffix[]): boolean {
  return has(affixes, 'warded');
}

/** Damage multiplier for an incoming `style` against an enemy's `armoredStyle`. */
export function styleDamageMult(armoredStyle: CombatStyle | undefined, style: CombatStyle | undefined): number {
  return armoredStyle && style && armoredStyle === style ? ARMORED_RESIST : 1;
}

/**
 * Subtract incoming `dmg` from a `shieldHp` pool first. Returns the shield left
 * and the damage that spills over to the enemy's HP. Pure — the engine writes
 * the new shield back onto the enemy and applies `dmg` to its health.
 */
export function absorbWithShield(shieldHp: number, dmg: number): { shield: number; dmg: number } {
  if (shieldHp <= 0) return { shield: 0, dmg };
  const absorbed = Math.min(shieldHp, dmg);
  return { shield: shieldHp - absorbed, dmg: dmg - absorbed };
}

import { ASSETS, itemIcon, npcModel } from '../assets';
import type { CombatStyle, StyleWeakness } from '../types';

/**
 * Enemy affixes: per-instance modifiers that change how a *normal* enemy behaves
 * (never bosses — those carry their own mechanics). From {@link AFFIX_UNLOCK_WAVE}
 * onward a fraction of spawned enemies roll affixes that force the player to
 * *adapt* the build rather than stack a single tower. Enemies spawn with a hard
 * maximum of 1 affix before wave 30, then up to {@link MAX_AFFIXES} after. Certain
 * affix pairs are banned to avoid unkillable-feeling combos. Shields punish fast
 * chip damage, armour forces style diversity, wards punish crowd-control builds, etc.
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
  | 'colossal'      // one big, slow, tanky leaker that costs an extra life
  | 'protected';    // prays against ONE style — near-immune to it (see PROTECTED_MULT)

export interface AffixDef {
  id: EnemyAffix;
  name: string;
  /** One-line, OSRS-flavoured explanation for the enemy hover panel / tutorial. */
  desc: string;
  /** Aura tint the renderer draws around an enemy carrying this affix. */
  color: string;
  /** Icon URL (cache-baked item/NPC art; broken loads degrade away). */
  icon: string;
}

export const AFFIX_DEFS: Record<EnemyAffix, AffixDef> = {
  shielded:     { id: 'shielded',     name: 'Shielded',     desc: 'Soaks a shield of damage before anything reaches its health.', color: '#7fd0ff', icon: itemIcon('rune_kiteshield') },
  armored:      { id: 'armored',      name: 'Armored',      desc: 'Takes half damage from one combat style. Bring another.', color: '#9aa0a8', icon: itemIcon('dragon_platebody') },
  regenerating: { id: 'regenerating', name: 'Regenerating', desc: 'Heals over time, so finish it fast or it claws the health back.', color: '#57d957', icon: itemIcon('regen_bracelet') },
  swarm:        { id: 'swarm',        name: 'Swarm',        desc: 'Arrives as a pack of weaker copies. Bring area damage.', color: '#b6d957', icon: npcModel('kalphite_larva') },
  hasted:       { id: 'hasted',       name: 'Hasted',       desc: 'Moves much faster, so your coverage gaps will show.', color: '#cfe8ff', icon: ASSETS.misc.orb_run },
  warded:       { id: 'warded',       name: 'Warded',       desc: 'Immune to slows, stuns and freezes.', color: '#b07cff', icon: itemIcon('spirit_shield') },
  volatile:     { id: 'volatile',     name: 'Volatile',     desc: 'Detonates on death, knocking every tower in the blast offline for a few seconds.', color: '#ff7a3c', icon: itemIcon('volatile_orb') },
  colossal:     { id: 'colossal',     name: 'Colossal',     desc: 'A hulking straggler with extra health, and it costs two lives if it leaks.', color: '#d9a957', icon: itemIcon('granite_maul') },
  protected:    { id: 'protected',    name: 'Protected',    desc: 'Prays against one combat style, and attacks of that style barely scratch it.', color: '#e8d48a', icon: ASSETS.prayers.protect_from_melee },
};

/**
 * Affixes that never come up in a random roll — they exist as a mechanic
 * (combat hooks + renderer aura) but are attached deliberately, not by chance.
 * `protected` is dormant: the plumbing is ready, but no enemy rolls it — it is
 * reserved for specific future monsters that declare it on their {@link EnemyDef}.
 */
export const DORMANT_AFFIXES: readonly EnemyAffix[] = ['protected'];

export const ALL_AFFIXES: readonly EnemyAffix[] =
  (Object.keys(AFFIX_DEFS) as EnemyAffix[]).filter((a) => !DORMANT_AFFIXES.includes(a));

// ───────────────────────────── tuning constants ────────────────────────────
/** No affixes before this wave — the early game stays a clean teaching ground. */
export const AFFIX_UNLOCK_WAVE = 5;
/** Per-wave step and ceiling for the chance a given enemy rolls any affix. */
export const ELITE_CHANCE_STEP = 0.03;
export const ELITE_CHANCE_CAP = 0.35;
/** Second affix unlocks here; before it every elite is exactly one affix. */
export const EXTRA_AFFIX_UNLOCK_WAVE = 30;
/** Hard ceiling on affixes per enemy (normal AND boss rolls). */
export const MAX_AFFIXES = 2;
/**
 * Multi-affix stacking. Once an enemy is elite it always gets one affix; each
 * *additional* affix is an independent roll whose chance ramps with the wave and
 * decays per affix already granted, but is capped at {@link MAX_AFFIXES} total.
 * The ramp is deliberately 0 before {@link EXTRA_AFFIX_UNLOCK_WAVE}: on that
 * wave an elite is guaranteed *exactly one*, and the chance ramps thereafter so
 * the player has time to adapt before facing multi-affix enemies.
 */
export const EXTRA_AFFIX_MAX = 0.5;        // extra-affix chance at full ramp
export const EXTRA_AFFIX_RAMP_WAVES = 25;  // waves from extra-unlock → full ramp
export const EXTRA_AFFIX_DECAY = 0.5;      // kept for tuning symmetry

/** Pairs that must never co-occur (unkillable-feeling combos). */
export const BANNED_PAIRS: readonly [EnemyAffix, EnemyAffix][] = [
  ['regenerating', 'warded'],
  ['regenerating', 'shielded'],
  // Both cut damage from a combat style — stacking them just double-punishes one
  // style rather than forcing variety, and reads as one wall on the enemy.
  ['protected', 'armored'],
];

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

/**
 * Affixes a **superior** (`superior_*`) never rolls, for the same reason
 * {@link BOSS_AFFIX_POOL} is a subset: a superior is already the elite spawn —
 * its own art, its own name, and three lives on a leak instead of one.
 *
 * `colossal` and `swarm` are the two affixes that change *what a spawn is* rather
 * than how it behaves, and both compound with a tier that is already the fattest
 * thing on the board short of a boss. Colossal is a flat ×{@link COLOSSAL_HP_MULT}
 * on top of an already-quadratic wave curve, so it grows with whatever it lands on:
 * harmless on a goblin, and on a wave-50 superior it was three quarters of that
 * wave's *boss*. Swarm is the same problem read as lives — three superiors at
 * {@link SUPERIOR_LEAK_COST} apiece is a worse leak than the boss.
 *
 * The behavioural half of the pool (shields, armour, regen, haste, wards, volatile)
 * still rolls: a superior can absolutely be a puzzle, it just can't be a boss.
 */
export const SUPERIOR_BARRED_AFFIXES: readonly EnemyAffix[] = ['colossal', 'swarm'];

/** Shield pool = this fraction of the enemy's (already wave-scaled) max HP. */
export const SHIELD_HP_FRAC = 0.12;
/** Damage multiplier applied to the armored enemy's resisted style. */
export const ARMORED_RESIST = 0.5;
/** Damage multiplier applied to a `protected` enemy's prayed-against style. A
 *  protection prayer in OSRS blocks a style outright; here it is left a sliver
 *  (×0.15) so a mono-style build still chips it rather than hitting a hard wall,
 *  while the message — "bring another style" — stays loud. */
export const PROTECTED_MULT = 0.15;
/** Damage multiplier when a hit's style matches the monster's innate
 *  {@link StyleWeakness}. Deliberately the same 1.5 as the elemental
 *  `WEAKNESS_BONUS` in systems/magic: the two are the same promise ("you brought
 *  the right answer") on two different axes, and a species carries only one of
 *  them, so one number is the honest way to say it. */
export const STYLE_WEAKNESS_BONUS = 1.5;
/** Regenerating never appears before this wave — early DPS can't outpace it. */
export const REGEN_UNLOCK_WAVE = 12;
/** Regen ramps from MIN %/s at its unlock wave to MAX %/s at the ramp end. */
export const REGEN_FRAC_MIN = 0.01;
export const REGEN_FRAC_MAX = 0.02;
export const REGEN_RAMP_END_WAVE = 30;
/**
 * Regenerating reads very differently on a boss. A boss already has the deepest HP
 * pool on the board and the mechanics to stall on it, so the same %/s that merely
 * annoys on a normal enemy turns a boss into a wall — the complaint players filed.
 *
 * So a boss sheds {@link BOSS_REGEN_DECAY_PER_WAVE} of its regen for every wave
 * reached, down to a floor of {@link BOSS_REGEN_MIN_MULT}. The affix keeps ramping
 * up by wave for everything else; on a boss the two curves pull against each other,
 * which is the point — later bosses are bigger, not more unkillable.
 */
export const BOSS_REGEN_DECAY_PER_WAVE = 0.01;
export const BOSS_REGEN_MIN_MULT = 0.5;
/** A swarm enemy spawns SWARM_COUNT copies, each at SWARM_HP_MULT health. */
export const SWARM_COUNT = 3;
export const SWARM_HP_MULT = 0.5;
/** Hasted speed multiplier. */
export const HASTE_SPEED_MULT = 1.35;
/** Colossal: tankier, slower, larger, and a heavier leak. */
export const COLOSSAL_HP_MULT = 1.6;
export const COLOSSAL_SPEED_MULT = 0.8;
export const COLOSSAL_RENDER_SCALE = 1.4;
/**
 * Volatile's death blast: every tower **inside {@link VOLATILE_BLAST_RADIUS}** of the
 * corpse goes offline for {@link VOLATILE_STUN_SECS}.
 *
 * It used to clip exactly one tower — the single nearest — for a beat and a half, which
 * on a real board was indistinguishable from nothing: whatever killed it blinked once
 * and carried on. An affix nobody notices is an affix that isn't there.
 *
 * The radius is what makes it a *positioning* threat rather than a die roll: it is wide
 * enough (three tiles) to swallow a stacked killbox and narrow enough that a spread line
 * loses one tower, so where you built decides what it costs you. The blast is drawn at
 * exactly this radius, so the shape is learnable from one detonation.
 *
 * **The anti-frustration rule lives at the call site, not here:** a tower that is already
 * down is skipped rather than refreshed. Volatile rolls on ordinary enemies, so a pack of
 * them can die on the same spot in a second — refreshing would let them chain a tower off
 * the board indefinitely. Skipping means a disabled tower always comes back after these
 * seconds, no matter how many blasts land on it, and the cost stays legible.
 */
export const VOLATILE_STUN_SECS = 2.5;
export const VOLATILE_BLAST_RADIUS = 96;

const ARMOR_STYLES: readonly CombatStyle[] = ['ranged', 'magic', 'melee'];

/** Wave-scaled regen fraction (of max HP, per second). */
export function regenFracForWave(wave: number): number {
  const t = Math.max(0, Math.min(1, (wave - REGEN_UNLOCK_WAVE) / (REGEN_RAMP_END_WAVE - REGEN_UNLOCK_WAVE)));
  return REGEN_FRAC_MIN + (REGEN_FRAC_MAX - REGEN_FRAC_MIN) * t;
}

/** The affix pool for a given wave (regenerating is gated late). */
function poolForWave(base: readonly EnemyAffix[], wave: number): EnemyAffix[] {
  return base.filter((a) => a !== 'regenerating' || wave >= REGEN_UNLOCK_WAVE);
}

/** The affixes a normal enemy could roll on `wave`. Public so the Lumbridge
 *  Guide can warn about what is in the pool without spawning anything. */
export function affixPoolForWave(wave: number): EnemyAffix[] {
  return poolForWave(ALL_AFFIXES, wave);
}

/** Chance (0–1) that an enemy on `wave` rolls any affix at all. */
export function eliteChanceForWave(wave: number): number {
  if (wave < AFFIX_UNLOCK_WAVE) return 0;
  return Math.min(ELITE_CHANCE_CAP, (wave - AFFIX_UNLOCK_WAVE + 1) * ELITE_CHANCE_STEP);
}

/**
 * Chance (0–1) of granting one *more* affix when `granted` are already on the
 * enemy. Returns 0 if the cap is reached. Otherwise ramps linearly from 0 at
 * {@link EXTRA_AFFIX_UNLOCK_WAVE} to {@link EXTRA_AFFIX_MAX} over
 * {@link EXTRA_AFFIX_RAMP_WAVES} waves, then halves for every affix already
 * granted beyond the first ({@link EXTRA_AFFIX_DECAY}).
 *
 * That decay term is dormant while {@link MAX_AFFIXES} is 2 — the only reachable
 * call has `granted === 1`, so the exponent is 0. It is kept so raising the cap
 * needs no formula change.
 */
export function extraAffixChance(wave: number, granted: number): number {
  if (granted >= MAX_AFFIXES) return 0;
  const ramp = Math.max(0, Math.min(1, (wave - EXTRA_AFFIX_UNLOCK_WAVE) / EXTRA_AFFIX_RAMP_WAVES));
  return EXTRA_AFFIX_MAX * ramp * Math.pow(EXTRA_AFFIX_DECAY, Math.max(0, granted - 1));
}

/** Pick the style an `armored` enemy resists. */
export function rollArmoredStyle(rng: () => number): CombatStyle {
  return ARMOR_STYLES[Math.floor(rng() * ARMOR_STYLES.length)] ?? 'melee';
}

/** Pick the style a `protected` enemy prays against (shares the style set). */
export function rollProtectedStyle(rng: () => number): CombatStyle {
  return ARMOR_STYLES[Math.floor(rng() * ARMOR_STYLES.length)] ?? 'melee';
}

export interface AffixRoll {
  affixes: EnemyAffix[];
  /** Present only when `armored` is rolled — the style it takes reduced damage from. */
  armoredStyle?: CombatStyle;
  /** Present only when `protected` is rolled — the style it prays against. */
  protectedStyle?: CombatStyle;
}

/** Draws 1..{@link MAX_AFFIXES} affixes, splicing each out of `pool` — this
 *  **mutates `pool`**, so callers must hand it a throwaway array. */
function drawAffixes(pool: EnemyAffix[], rng: () => number, extraChance: (granted: number) => number): AffixRoll {
  const take = () => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const affixes: EnemyAffix[] = [take()];
  // Prune anything banned alongside what's already granted.
  const prune = () => {
    for (let i = pool.length - 1; i >= 0; i--) {
      const c = pool[i];
      if (BANNED_PAIRS.some(([a, b]) => (affixes.includes(a) && c === b) || (affixes.includes(b) && c === a))) pool.splice(i, 1);
    }
  };
  prune();
  while (pool.length && affixes.length < MAX_AFFIXES && rng() < extraChance(affixes.length)) {
    affixes.push(take());
    prune();
  }
  const roll: AffixRoll = { affixes };
  if (affixes.includes('armored')) roll.armoredStyle = rollArmoredStyle(rng);
  if (affixes.includes('protected')) roll.protectedStyle = rollProtectedStyle(rng);
  return roll;
}

/**
 * Roll the affixes for one freshly-spawned *normal* enemy. Bosses and pre-unlock
 * waves always return an empty roll (bosses go through {@link rollBossAffixes}).
 * `rng` is injected (`Math.random` in the engine) so the result is deterministic
 * under test. An elite always gets one affix and may stack more — see
 * {@link extraAffixChance}.
 *
 * `isSuperior` narrows the pool by {@link SUPERIOR_BARRED_AFFIXES} — the elite tier
 * carries its own weight already.
 */
export function rollAffixes(wave: number, isBoss: boolean, rng: () => number, isSuperior = false): AffixRoll {
  if (isBoss) return { affixes: [] };
  const chance = eliteChanceForWave(wave);
  if (chance <= 0 || rng() >= chance) return { affixes: [] };
  const base = isSuperior ? ALL_AFFIXES.filter((a) => !SUPERIOR_BARRED_AFFIXES.includes(a)) : ALL_AFFIXES;
  return drawAffixes(poolForWave(base, wave), rng, (granted) => extraAffixChance(wave, granted));
}

/**
 * Roll modifiers for a boss that has already been seen at least once (the engine
 * only calls this when that's true). Returns an empty roll most of the time;
 * otherwise one affix from {@link BOSS_AFFIX_POOL}, rarely two. Pure / injected
 * RNG like {@link rollAffixes}.
 */
export function rollBossAffixes(rng: () => number, wave: number): AffixRoll {
  if (rng() >= BOSS_AFFIX_CHANCE) return { affixes: [] };
  return drawAffixes(poolForWave(BOSS_AFFIX_POOL, wave), rng, () => BOSS_EXTRA_AFFIX_CHANCE);
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

/** The wave-decayed share of its regen a boss keeps (1 → {@link BOSS_REGEN_MIN_MULT}). */
export function bossRegenWaveMult(wave: number): number {
  return Math.max(BOSS_REGEN_MIN_MULT, 1 - BOSS_REGEN_DECAY_PER_WAVE * wave);
}

/** HP regenerated per second (0 when not regenerating). Bosses regen less the
 *  deeper the run goes — see {@link bossRegenWaveMult}. */
export function regenPerSec(
  affixes: readonly EnemyAffix[], maxHp: number, wave: number, isBoss = false,
): number {
  if (!has(affixes, 'regenerating')) return 0;
  return maxHp * regenFracForWave(wave) * (isBoss ? bossRegenWaveMult(wave) : 1);
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

/**
 * The towers caught in a Volatile death blast: everything whose centre is within
 * {@link VOLATILE_BLAST_RADIUS} of the corpse, *excluding any that are already offline*.
 *
 * The exclusion is the anti-frustration guarantee, and it belongs here rather than at the
 * call site so it cannot be forgotten by the next caller: a tower knocked out by one
 * blast is never re-timed by the next, so it always recovers on schedule however many
 * volatiles die on top of it. Measured centre-to-centre, so the drawn ring is the
 * literal blast — a player can read the threat off one detonation.
 */
export function volatileBlastTowers<T extends { x: number; y: number; disabledTimer: number }>(
  towers: readonly T[], x: number, y: number,
): T[] {
  const r2 = VOLATILE_BLAST_RADIUS * VOLATILE_BLAST_RADIUS;
  return towers.filter((t) => {
    if (t.disabledTimer > 0) return false;
    const dx = t.x - x;
    const dy = t.y - y;
    return dx * dx + dy * dy <= r2;
  });
}

/** Whether this enemy ignores slow / stun / freeze. */
export function isCcImmune(affixes: readonly EnemyAffix[]): boolean {
  return has(affixes, 'warded');
}

/**
 * The question every piece of crowd control actually asks: does this hold land on this
 * enemy at all? Three sources answer no — the Warded affix, which is permanent; a timed
 * immunity granted by a boss (General Graardor's slam), which is not; and a body that is
 * simply built that way (`ccImmune` — the Corporeal Beast's dark energy core, which is
 * not a body at all but a jumping mote of him). One predicate for all three, so a new
 * source of any kind is honoured everywhere holds are applied.
 */
export function ignoresCc(
  e: { affixes?: readonly EnemyAffix[]; ccImmuneTimer?: number; ccImmune?: boolean },
): boolean {
  return !!e.ccImmune || isCcImmune(e.affixes ?? []) || (e.ccImmuneTimer ?? 0) > 0;
}

/** Damage multiplier for an incoming `style` against an enemy's `armoredStyle`. */
export function styleDamageMult(armoredStyle: CombatStyle | undefined, style: CombatStyle | undefined): number {
  return armoredStyle && style && armoredStyle === style ? ARMORED_RESIST : 1;
}

/** Damage multiplier for an incoming `style` against a `protected` enemy's
 *  prayed-against style ({@link PROTECTED_MULT} when it matches, else 1). A hit
 *  with no style (DoT ticks) is never prayed against. */
export function protectedDamageMult(protectedStyle: CombatStyle | undefined, style: CombatStyle | undefined): number {
  return protectedStyle && style && protectedStyle === style ? PROTECTED_MULT : 1;
}

/**
 * Damage multiplier for an incoming `style` against a monster's innate
 * {@link StyleWeakness} ({@link STYLE_WEAKNESS_BONUS} when it matches, else 1).
 *
 * Styleless damage (a DoT tick, an unattributed hit) never earns the bonus, for
 * the same reason `armored` never bites it: the bonus is a reward for *aiming* the
 * right weapon at the thing, and a poison cloud aims nothing. This is the
 * melee/ranged mirror of `weaknessMultiplier` in systems/magic — a species has one
 * axis or the other, never both.
 */
export function styleWeaknessMult(weak: StyleWeakness | undefined, style: CombatStyle | undefined): number {
  return weak && style && weak === style ? STYLE_WEAKNESS_BONUS : 1;
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

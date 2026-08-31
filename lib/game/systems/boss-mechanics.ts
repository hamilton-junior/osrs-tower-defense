import type { CombatStyle, EnemyType, Point } from '../types';
import type { DamageTag } from './combat-stats';
import { pathTotalLength, remainingPathDistance, advanceAlongPath, inSquareRange } from './geometry';

/**
 * Boss mechanics (#4B): per-boss phase logic for the three signature bosses.
 * This module is **pure** — phase selection, the style/immunity multipliers, and
 * the Jad recent-damage maths are side-effect-free helpers the engine drives
 * each frame. The engine owns the mutable {@link BossState} it stores on the boss
 * {@link import('../types').Enemy}, the healer entities Jad summons, and the
 * telegraph VFX; everything here is unit-testable in isolation.
 *
 *  - **Zulrah** rotates through three phases, each *weak* to one combat style and
 *    *equally resistant* to the other two (a clean rock-paper-scissors), themed
 *    with the OSRS form colours so the player reads the tint and switches styles.
 *  - **Vorkath** periodically raises an ice shield: immune to all damage for a short
 *    window. It has to be weathered, not out-damaged.
 *  - **Jad** summons Yt-HurKot healers below half health; while they live he
 *    regenerates a fraction of the damage dealt to him over the last few seconds.
 *  - **Alchemical Hydra** opens a chemical vent at each HP threshold: it hardens and
 *    regenerates until the player bursts through a break target. Shattering a vent
 *    advances its phase and leaves it briefly vulnerable. Below a tenth of its health
 *    it enrages.
 *
 *  - **Brutus** charges: provoked by damage, he plants his feet, turns into Demonic
 *    Brutus, runs *off* the road straight at the nearest tower, then walks back to the
 *    exact spot he left. He gains no ground — but whatever he ploughs through on the way
 *    out is knocked offline for a few seconds, so the charge costs you a damage window
 *    *and* a hole in your board.
 *
 *  - **Giant Mole** burrows: it drops underground — untouchable, invisible — and
 *    surfaces further along the path, skipping the stretch you fortified. It will not
 *    dig on the final approach, so the last stretch is always fought honestly.
 *
 *  - **Grotesque Guardians** arrive as a linked pair (Dawn & Dusk). While both stand
 *    they share their stone and each takes halved damage; kill one and the survivor
 *    enrages — and drags its twin back up unless it dies too, inside the window.
 *  - **Cerberus** summons three Summoned Souls, each locking one combat style against
 *    him. Which soul you must kill first depends on the board you built.
 *
 * Each boss owns one idea: Zulrah tests style coverage, Vorkath tests patience, Jad
 * tests target priority, the Hydra tests burst, the Mole tests *where* you built, Brutus
 * tests whether your damage survives the target stepping out of it, the Guardians test
 * the *order* you kill in, and Cerberus tests whether your board has an answer at all.
 * A boss whose idea duplicates another's is a reskin — see `docs/boss-design.md` for the
 * ledger of which ideas are taken and which are still open.
 */

export type BossId = 'zulrah' | 'vorkath' | 'jad' | 'hydra' | 'giant_mole' | 'dusk' | 'dawn' | 'cerberus' | 'brutus' | 'scurrius' | 'kbd' | 'corporeal_beast' | 'graardor' | 'nex';

/** The bosses that carry phase mechanics: they get a {@link BossState} on spawn and
 *  roll boss modifiers once seen. The engine and the save sanitiser read this to decide
 *  who has state. */
export const MECHANIC_BOSSES: readonly BossId[] = [
  'jad', 'vorkath', 'zulrah', 'hydra', 'giant_mole', 'dusk', 'dawn', 'cerberus', 'brutus', 'scurrius', 'kbd',
  'corporeal_beast', 'graardor', 'nex',
];

/**
 * The bosses a wave may *draw* — what `rollWaveBosses` picks from and what the debug
 * panel offers. **Order is the introduction order**: a fresh account meets one per boss
 * wave in this sequence, so the ladder runs gentlest (Brutus) → hardest (the Hydra).
 *
 * Deliberately a separate list from {@link MECHANIC_BOSSES}, because the two answer
 * different questions. Every schedulable boss has state, but not every boss with state
 * may be scheduled: one that only ever arrives as another boss's companion needs a
 * `BossState` and has no business being drawn on its own.
 */
export const SCHEDULABLE_BOSSES: readonly BossId[] = [
  'brutus', 'scurrius', 'giant_mole', 'kbd', 'jad', 'vorkath', 'zulrah', 'graardor', 'dusk', 'cerberus',
  'corporeal_beast', 'hydra', 'nex',
];

// ─────────────────────────────────── Zulrah ────────────────────────────────
/** One Zulrah form: weak to `weak`, resistant to the other two, drawn in `color`. */
export interface ZulrahPhase {
  id: string;
  name: string;
  /** The single combat style this form is vulnerable to. */
  weak: CombatStyle;
  /** OSRS form tint (serpentine green / tanzanite blue / magma red). */
  color: string;
}

/**
 * The three forms, one per combat style. Colours follow the wiki's forms:
 * Serpentine (green) is the ranged-attacking snake you answer with magic;
 * Tanzanite (blue) you answer with ranged; Magma (red) we map to melee so the
 * rotation covers all three tower styles cleanly.
 */
export const ZULRAH_PHASES: readonly ZulrahPhase[] = [
  { id: 'serpentine', name: 'Serpentine', weak: 'magic',  color: '#3fbf57' },
  { id: 'tanzanite',  name: 'Tanzanite',  weak: 'ranged', color: '#4a86e8' },
  { id: 'magma',      name: 'Magma',      weak: 'melee',  color: '#d4452f' },
];

/** Seconds Zulrah holds each form before rotating to the next. */
export const ZULRAH_PHASE_SECS = 7;
/**
 * Magnitude of the phase's style bias. The weak style deals ×(1 + bonus); the
 * two resisted styles deal ×(1 − bonus) — same value up as down, per design.
 * At 0.9 the resisted styles are cut 90% (×0.1) while the weakness hits ×1.9,
 * so Zulrah only melts when answered with the right style.
 */
export const ZULRAH_WEAK_BONUS = 0.9;

/** Which phase Zulrah is in after `elapsed` seconds alive. */
export function zulrahPhaseIndex(elapsed: number): number {
  const n = ZULRAH_PHASES.length;
  return ((Math.floor(elapsed / ZULRAH_PHASE_SECS) % n) + n) % n;
}

/**
 * Damage multiplier for an incoming `style` against the form weak to `weak`.
 * Weak style → 1 + {@link ZULRAH_WEAK_BONUS}; the other two → 1 − bonus.
 * Styleless damage (DoT / unattributed) is neutral so it can't be cheesed or
 * over-punished by the phase.
 */
export function zulrahStyleMult(weak: CombatStyle, style: CombatStyle | undefined): number {
  if (!style) return 1;
  return style === weak ? 1 + ZULRAH_WEAK_BONUS : 1 - ZULRAH_WEAK_BONUS;
}

// ─────────────────────────────────── Vorkath ───────────────────────────────
/** Seconds between Vorkath ice phases (measured shield-end → next shield-up). */
export const VORKATH_ICE_INTERVAL = 11;
/** Seconds the ice shield lasts: Vorkath is immune and a tower stays frozen. */
export const VORKATH_ICE_DURATION = 3;

// ──────────────────────────────────── Jad ──────────────────────────────────
/**
 * What a boss escort (a Yt-HurKot healer, a Summoned Soul) takes from an *area* hit —
 * splash and chain — as a fraction. Focused single-target fire is untouched.
 *
 * Adds were dying to fire that was never aimed at them, which quietly deleted the
 * mechanic they exist for: a barrage or a cannon shell aimed at the boss clears its
 * whole escort as a side effect, so the player never has to answer the heal (Jad) or
 * the style lock (Cerberus). Raising their HP would not fix that — it slows *focused*
 * fire by the same factor, so spraying stays the correct answer, just later.
 *
 * The maths, in "how much of the boss's max HP must an area attack chew through to
 * clear one add incidentally" (add HP fraction ÷ that source's splash falloff ÷ this
 * multiplier). A cannon splashes at full damage; a barrage at
 * {@link BARRAGE_SPLASH_FALLOFF} (0.5):
 *
 * | add (HP frac)          | source  | before | at 0.4 |
 * |------------------------|---------|--------|--------|
 * | Jad healer (0.12)      | cannon  |  12%   |  30%   |
 * | Jad healer (0.12)      | barrage |  24%   |  60%   |
 * | Cerberus soul (0.08)   | cannon  |   8%   |  20%   |
 * | Cerberus soul (0.08)   | barrage |  16%   |  40%   |
 *
 * Healers arrive at half HP and souls hold a 33%-wide phase, so before this the adds
 * evaporated inside their own window; at 0.4 they outlive it against a barrage and
 * only just fall to a cannon — which is the Cannon's declared crowd-clear niche, kept
 * intact. Focused fire still ends a healer inside 12% of Jad's HP, so "focus them"
 * (or a `weakest` tower, which picks adds automatically) is now the fast answer and
 * spraying is not. Relevant, not impossible.
 */
export const ESCORT_AOE_DAMAGE_MULT = 0.4;

/** Area tags — hits that land on an escort without being aimed at it. */
const AOE_TAGS: readonly DamageTag[] = ['splash', 'chain'];

/**
 * Damage multiplier for one hit landing on `isEscort`, by the hit's source tag.
 * Area hits are cut to {@link ESCORT_AOE_DAMAGE_MULT}; everything else — direct fire
 * and the DoTs already ticking on it — lands in full.
 */
export function escortDamageMult(isEscort: boolean, tag: DamageTag | undefined): number {
  if (!isEscort || tag === undefined) return 1;
  return AOE_TAGS.includes(tag) ? ESCORT_AOE_DAMAGE_MULT : 1;
}

/** Jad summons healers the first time he drops to/below this HP fraction. */
export const JAD_HEAL_THRESHOLD = 0.5;
/** Healers summoned per wave of adds. */
export const JAD_HEALER_COUNT = 3;
/** Each healer's HP as a fraction of Jad's max HP. Scaling off Jad keeps them
 *  relevant at every wave: high enough that stray splash doesn't one-shot them
 *  the moment they spawn (3.5% did, on late waves), low enough that focused
 *  fire still cuts them down well before Jad. OSRS ratio is 90/250 ≈ 36% —
 *  far too tanky with 3 of them in a TD, so we sit in between. */
export const JAD_HEALER_HP_FRAC = 0.12;
/** Rolling window (s) of damage-to-Jad that the heal is computed from. */
export const JAD_HEAL_WINDOW_SECS = 5;
/** Fraction of the windowed damage Jad claws back over the full window. */
export const JAD_HEAL_FRAC = 0.6;
/** Heal cadence (s) while at least one healer is alive. */
export const JAD_HEAL_TICK_SECS = 1;
/** Cooldown (s) before Jad re-summons after his current healers are wiped. */
export const JAD_RESUMMON_COOLDOWN = 6;

/** One recorded chunk of damage dealt to a boss at simulated time `t`. */
export interface DamageEvent { t: number; amount: number; }

/** Sum the damage events that fall within `window` seconds of `now`. */
export function recentDamageSum(events: readonly DamageEvent[], now: number, window: number): number {
  let sum = 0;
  for (const e of events) if (now - e.t <= window) sum += e.amount;
  return sum;
}

/** Drop damage events older than `window` seconds (keeps the list bounded). */
export function pruneDamageEvents(events: DamageEvent[], now: number, window: number): DamageEvent[] {
  return events.filter((e) => now - e.t <= window);
}

/**
 * Heal applied on one tick: a slice of {@link JAD_HEAL_FRAC} of the windowed
 * damage, prorated to the tick length so that — if healers survive a whole
 * window — Jad recovers about that fraction of the damage. Killing the healers
 * fast is what denies the heal.
 */
export function jadHealPerTick(recentDamage: number): number {
  return Math.round(recentDamage * JAD_HEAL_FRAC * (JAD_HEAL_TICK_SECS / JAD_HEAL_WINDOW_SECS));
}

// ─────────────────────────── Alchemical Hydra ──────────────────────────────
/** One Hydra chemical phase. Purely cosmetic identity — the phase does not bias
 *  damage (that is Zulrah's job); it reads out how many vents you have broken. */
export interface HydraPhase {
  id: string;
  name: string;
  /** Body tint — the OSRS chemical colours. */
  color: string;
}

/** The three chemical phases, advanced by *shattering a vent*, not by HP alone. */
export const HYDRA_PHASES: readonly HydraPhase[] = [
  { id: 'serpentine', name: 'Serpentine', color: '#3fbf57' },
  { id: 'electric',   name: 'Electric',   color: '#4a86e8' },
  { id: 'flame',      name: 'Flame',      color: '#d4452f' },
];

/** HP fractions at which a vent opens — one per phase boundary. */
export const HYDRA_VENT_THRESHOLDS: readonly number[] = [0.66, 0.33];
/** How long a vent stays open before it closes (and the heal it banked stands). */
export const HYDRA_VENT_SECS = 5;
/**
 * Seconds the Hydra must stay open — unhardened, taking full damage — after a vent
 * seals unbroken, before it may vent again.
 *
 * Without it a failed vent re-opens on the very next frame, because the re-open test
 * is just "HP is under the threshold" and a failed vent leaves it there. Once the
 * stall-breaker throttles the heal to nothing, HP can never climb back over the
 * threshold either, so the Hydra sits permanently hardened at
 * {@link HYDRA_VENT_DAMAGE_MULT} with no full-damage window — unkillable, which is
 * exactly what players hit. The cooldown guarantees the board always gets its turn.
 */
export const HYDRA_VENT_COOLDOWN_SECS = 6;
/** Damage taken while hardened — a vent cuts incoming damage to a fifth. Note it
 *  is not zero: a player who out-paces the heal still grinds through, so the
 *  fight can stall but never hard-locks. */
export const HYDRA_VENT_DAMAGE_MULT = 0.2;
/** Fraction of max HP regenerated per second while a vent is open. */
export const HYDRA_VENT_HEAL_PER_SEC = 0.03;
/** Perfect Hydra's allowance, as a fraction of max HP. A vent that flickers open and
 *  is shattered in the same breath has not *healed* the Hydra, and a board fast enough
 *  to do that is exactly the one the task is for — so the achievement only breaks once
 *  the regen adds up to real HP (this is about two thirds of a second of an open vent). */
export const HYDRA_PERFECT_HEAL_ALLOWANCE = 0.02;
/** Damage that must be dealt during the window, as a fraction of max HP, to shatter
 *  the vent — counted *before* the hardening cut (see {@link hydraVentCredit}), so
 *  this is the raw output the player's board has to muster in {@link HYDRA_VENT_SECS}. */
export const HYDRA_VENT_BREAK_FRAC = 0.08;
/** Seconds of ×1.25 vulnerability granted for shattering a vent — the burst reward. */
export const HYDRA_SHATTER_VULN_SECS = 2;
/** HP fraction at or below which the Hydra enrages. */
export const HYDRA_ENRAGE_HP = 0.1;
/** Speed multiplier applied to `baseSpeed` on enrage. */
export const HYDRA_ENRAGE_SPEED_MULT = 1.35;

/** The phase a Hydra that has shattered `shattered` vents is in. Clamped, so a
 *  boss that somehow over-shatters still reads as the last phase. */
export function hydraPhase(shattered: number): HydraPhase {
  const i = Math.max(0, Math.min(shattered, HYDRA_PHASES.length - 1));
  return HYDRA_PHASES[i];
}

/** The HP fraction of the next vent, or null once every vent has been shattered. */
export function hydraNextThreshold(shattered: number): number | null {
  return shattered < HYDRA_VENT_THRESHOLDS.length ? HYDRA_VENT_THRESHOLDS[shattered] : null;
}

/** Whether a vent should open now: HP has crossed the next threshold, no vent is
 *  already open, and the post-failure cooldown ({@link HYDRA_VENT_COOLDOWN_SECS}) has
 *  run out. A failed vent re-opens once that window passes — a stall, not a wipe. */
export function hydraShouldVent(hpFrac: number, shattered: number, venting: boolean, ventCooldown = 0): boolean {
  if (venting || ventCooldown > 0) return false;
  const next = hydraNextThreshold(shattered);
  return next !== null && hpFrac <= next;
}

/** Damage needed to shatter an open vent, measured before the hardening cut —
 *  pair it with {@link hydraVentCredit}, never with a landed figure. */
export function hydraBreakTarget(maxHp: number): number {
  return Math.max(1, Math.round(maxHp * HYDRA_VENT_BREAK_FRAC));
}

/**
 * What a hit that *landed* for `dealt` is worth against the break target.
 *
 * The hardening ({@link HYDRA_VENT_DAMAGE_MULT}) is a cut to the Hydra's HP bar,
 * not to the player's effort: it exists to stop the vent being chewed through
 * incidentally, so counting the post-cut figure toward the break would charge the
 * player for it twice and demand `1 / HYDRA_VENT_DAMAGE_MULT` times the advertised
 * bar (8% of max HP became 40% of raw damage in five seconds, which no real board
 * musters — the vent simply never broke). Undo the cut, so the break target is the
 * damage the player's towers actually put out.
 */
export function hydraVentCredit(dealt: number): number {
  return Math.max(0, dealt) / HYDRA_VENT_DAMAGE_MULT;
}

/** HP regenerated over `dt` seconds of an open vent. */
export function hydraVentHeal(maxHp: number, dt: number): number {
  return maxHp * HYDRA_VENT_HEAL_PER_SEC * dt;
}

/** Whether the HP the Hydra has regenerated at its vents is enough to spoil Perfect
 *  Hydra — see {@link HYDRA_PERFECT_HEAL_ALLOWANCE}. */
export function hydraHealSpoilsPerfect(healed: number, maxHp: number): boolean {
  return healed > maxHp * HYDRA_PERFECT_HEAL_ALLOWANCE;
}

/** Whether the Hydra is in its final, enraged phase. */
export function hydraIsEnraged(hpFrac: number): boolean {
  return hpFrac <= HYDRA_ENRAGE_HP;
}

// ────────────────────────────── Giant Mole ─────────────────────────────────
/**
 * The Mole's burrow cycle. `above` is the only phase it walks in; the other three
 * hold it in place while the real OSRS dig/surface animations play.
 *
 *   above ──(interval elapses)──▶ dig ──▶ under ──▶ emerge ──▶ above
 *                                         │
 *                        untargetable, immune, and it moves down the path
 */
export type MolePhase = 'above' | 'dig' | 'under' | 'emerge';

/** Seconds the Mole walks between digs. Loosened from 9s: back-to-back burrows read
 *  as "it is never on the board", and the fight is more legible with longer windows
 *  where the towers actually get to work. */
export const MOLE_BURROW_INTERVAL = 11;
/** HP fraction at or below which the Mole digs more often (its late-fight pressure). */
export const MOLE_FRENZY_HP = 0.25;
/** The interval's multiplier once frenzied. */
export const MOLE_FRENZY_INTERVAL_MULT = 0.6;
/** Seconds of the dig animation (OSRS anim 3314 runs ~1.94s) — still hittable. */
export const MOLE_DIG_SECS = 1.9;
/** Seconds underground: invisible, untargetable, immune. Short, because the churning
 *  mound telegraphs where it will surface — the player gets this long to react. */
export const MOLE_UNDER_SECS = 1;
/** Seconds of the surfacing animation (OSRS anim 3315 runs ~0.9s) — hittable again. */
export const MOLE_EMERGE_SECS = 0.9;
/**
 * How much road a burrow skips, as a fraction of the road's total length.
 *
 * Measured in *distance*, not waypoints, and that is not a detail: the maps are
 * procedural and come out anywhere from ~7 to ~20 waypoints, so "skip three waypoints"
 * is a shrug on one board and a third of the map on another. A tenth of the road is a
 * tenth of the road everywhere.
 */
export const MOLE_BURROW_FRAC = 0.1;
/**
 * The final approach, as a fraction of the road: the Mole may never surface inside it.
 * This is the guardrail that makes the mechanic fair rather than cheap — it cannot dig
 * its way onto the doorstep, so the last stretch is always a fight, never a teleport.
 */
export const MOLE_MIN_TAIL_FRAC = 0.2;
/** A burrow that would gain less than this fraction of the road isn't worth the dig —
 *  the Mole would spend its whole cycle to shuffle forward, which reads as a bug. */
export const MOLE_MIN_GAIN_FRAC = 0.03;

/** How long the Mole stays above ground before its next dig, given its HP fraction. */
export function moleBurrowInterval(hpFrac: number): number {
  return hpFrac <= MOLE_FRENZY_HP
    ? MOLE_BURROW_INTERVAL * MOLE_FRENZY_INTERVAL_MULT
    : MOLE_BURROW_INTERVAL;
}

/**
 * Where a Mole standing at `(x, y)` on segment `pathIndex` would surface — or `null`
 * when it must not dig at all: it is already on the final approach, or the burrow would
 * gain it too little to be worth the animation.
 *
 * The skip is clamped so the Mole never surfaces inside the final
 * {@link MOLE_MIN_TAIL_FRAC} of the road, and it lands *between* waypoints rather than
 * on one, so the reposition is a real slide up the road rather than a snap.
 */
export function moleBurrowTarget(
  path: readonly Point[], pathIndex: number, x: number, y: number,
): { pathIndex: number; x: number; y: number } | null {
  const total = pathTotalLength(path);
  if (total <= 0) return null;
  const remaining = remainingPathDistance(path, pathIndex, x, y);
  const tail = total * MOLE_MIN_TAIL_FRAC;
  if (remaining <= tail) return null; // already inside the final approach
  // Never dig past the tail: the burrow is capped by whatever room is left before it.
  const dist = Math.min(total * MOLE_BURROW_FRAC, remaining - tail);
  if (dist < total * MOLE_MIN_GAIN_FRAC) return null;
  return advanceAlongPath(path, pathIndex, x, y, dist);
}

/** Underground: invisible, untargetable, damage-immune. */
export function moleIsHidden(state: BossState | undefined): boolean {
  return state?.kind === 'giant_mole' && state.molePhase === 'under';
}

/** Anywhere in the burrow cycle — the Mole holds still for all of it. */
export function moleIsBurrowing(state: BossState | undefined): boolean {
  return state?.kind === 'giant_mole' && !!state.molePhase && state.molePhase !== 'above';
}

// ─────────────────────────────────── Brutus ────────────────────────────────
/**
 * Brutus: the mobility check from the *other* direction. Where the Mole skips road you
 * fortified, Brutus refuses to stay on it.
 *
 * He is a bull. Hurt him enough and he plants his feet, turns into **Demonic Brutus**,
 * charges sideways off the road, calms back into livestock, and walks back to the exact
 * spot he left. He never gains ground — the rampage costs him time — so what he actually
 * takes from the player is the *damage window*: every tower that had him locked loses him
 * for a few seconds.
 *
 * That is deliberately the gentlest thing a boss can do, which is why he is the first
 * one a fresh account meets. He teaches "bosses do things" without ever bypassing the
 * defence.
 *
 * He is also the reference implementation of the **visual-state rule**: every phase of
 * this cycle is legible from the model itself (see {@link bossAnimVariant}). A mechanic
 * the player cannot see is a bug.
 *
 * **Fidelity to the real fight.** In OSRS, Brutus is the Lumbridge cow-field boss from
 * *The Ides of Milk* — the deliberately-accessible one that teaches new players to dodge
 * telegraphed attacks. His Charge is exactly this: he exclaims `*growls*`, gives a **3
 * tick** window, then runs *through* where the player was standing. That tell, that
 * window and that overhead are reproduced verbatim here. What is ours, not OSRS's, is the
 * Demonic Brutus skin: in game that is the post-DT2 hard-mode variant, not a rage form —
 * we borrow the model because a boss needs its mechanic to be visible, and Brutus happens
 * to ship with a perfect angry version of himself.
 *
 * His other OSRS special, the ground **Slam** (`*snorts*`, 4-tick window, three times),
 * is left unbuilt: it is an attack on tiles, and the natural way to translate it is as an
 * attack on *towers* — which is a different boss's idea (see `docs/boss-design.md`).
 *
 * NPC ids in the cache: 15626 (Brutus) and 15628 (Demonic Brutus).
 */
export type BrutusPhase = 'calm' | 'brace' | 'dash' | 'settle' | 'return';

/** Seconds after a rampage before he can be provoked into another one. */
export const BRUTUS_RAGE_COOLDOWN = 8;
/**
 * How much damage (as a fraction of max HP) he must have taken since the last rampage
 * before he flinches. Pairing this with the cooldown is what makes the cycle something
 * the *player* causes: a Brutus nobody is shooting simply walks the road.
 */
export const BRUTUS_RAGE_DAMAGE_FRAC = 0.08;
/**
 * The telegraph: feet planted, enraged model, overhead growl. **Three game ticks (1.8s)**
 * — the exact window OSRS gives a player to step out of his charge, kept so the tell
 * feels like the real fight rather than an approximation of it.
 */
export const BRUTUS_BRACE_SECS = 1.8;
/** The charge itself — one tick, which is what keeps it a *mini* dash. */
export const BRUTUS_DASH_SECS = 0.6;
/** He stops and the rage drains: one tick back as plain Brutus before he turns around. */
export const BRUTUS_SETTLE_SECS = 0.6;
/** Charge speed, relative to his walk. At 3.6× for 0.6s he covers ~2–3 tiles. */
export const BRUTUS_DASH_SPEED_MULT = 3.6;
/** He trots back a little quicker than he walks — sheepish, not punishing. */
export const BRUTUS_RETURN_SPEED_MULT = 1.15;
/**
 * What he says while bracing — **his real OSRS overhead for the charge**, verbatim.
 * (`*snorts*` is the other special's tell and `*huff*` is him pathing around an obstacle;
 * neither is this mechanic.) In-game strings are English.
 */
export const BRUTUS_SAY = '*growls*';
/** The enraged model swapped in for the brace + dash. */
export const BRUTUS_DEMONIC_SLUG = 'brutus_demonic';
/** Logic pixels of board kept clear on a lunge. A dash at the edge must not park him
 *  outside the board, where no tower could reach him and he could never walk back. */
export const BRUTUS_EDGE_MARGIN = 26;
/**
 * Seconds a tower he ploughs into is knocked offline. Long enough that losing it is felt
 * — a killbox missing a tower for five seconds leaks — but short enough that it reads as
 * being *knocked over and getting back up*, not as the tower being destroyed.
 */
export const BRUTUS_TRAMPLE_DISABLE_SECS = 5;

/**
 * The towers his charge ploughs through: every tower whose body overlaps his, tested as
 * two circles.
 *
 * Only ever called for the `dash` phase. The walk home crosses the same ground, and
 * disabling on the way back would silently double the advertised five seconds (the tower
 * would be re-touched and its timer refreshed just as it recovered) — so contact is the
 * *charge*, not mere proximity to Brutus. Pure, so the geometry is testable without a board.
 */
export function brutusTrampled<T extends { x: number; y: number }>(
  towers: readonly T[], x: number, y: number, bossRadius: number, towerRadius: number,
): T[] {
  const reach = bossRadius + towerRadius;
  return towers.filter((t) => {
    const dx = t.x - x;
    const dy = t.y - y;
    return dx * dx + dy * dy <= reach * reach;
  });
}

/**
 * Has he been hurt enough, recently enough, to rampage? Both conditions matter: the
 * cooldown stops a burst tower from locking him in a permanent tantrum, and the damage
 * floor stops an unattended Brutus from rampaging at nobody.
 */
export function brutusShouldRage(cooldown: number, rageDamage: number, maxHp: number): boolean {
  return cooldown <= 0 && rageDamage >= maxHp * BRUTUS_RAGE_DAMAGE_FRAC;
}

/**
 * Which way he lunges: **straight at `target`**, the tower he has picked out.
 *
 * He used to flinch *away* from whatever was hurting him, which was legible as an animal
 * recoiling but left the charge aimed at empty ground most of the time — the trample it
 * exists to deliver almost never landed, and a mechanic that rarely fires is a mechanic
 * the player never learns. Charging the tower makes the threat concrete: the bull picks
 * something on your board and runs at it, and you either built with room to spare or you
 * watch a tower go down.
 *
 * `from`/`to` are the stretch of road he is standing on, used only for the fallback: with
 * no tower on the board he lunges along the segment's left-hand normal, so a Brutus
 * nobody has built against still steps off the road deterministically instead of nowhere.
 */
export function brutusDashDirection(
  from: Point,
  to: Point,
  self: Point,
  target?: Point | null,
): Point {
  if (target) {
    const dx = target.x - self.x;
    const dy = target.y - self.y;
    const d = Math.hypot(dx, dy);
    // A tower directly under him has no direction to offer; fall through to the normal.
    if (d > 0) return { x: dx / d, y: dy / d };
  }
  const sx = to.x - from.x;
  const sy = to.y - from.y;
  const len = Math.hypot(sx, sy) || 1;
  return { x: -sy / len, y: sx / len };
}

/** Anywhere in the rampage — normal path movement is suspended for all of it, because
 *  every phase either holds him still or drives him somewhere the road does not go. */
export function brutusIsRampaging(state: BossState | undefined): boolean {
  return state?.kind === 'brutus' && !!state.brutusPhase && state.brutusPhase !== 'calm';
}

/** Scurrius: is he standing still to squeak? See {@link SCURRIUS_SQUEAK_STOP}. */
export function scurriusIsSqueaking(state: BossState | undefined): boolean {
  return state?.kind === 'scurrius' && (state.squeakStop ?? 0) > 0;
}

/**
 * The **visual-state rule**, generalised: the anim slug a boss's *current mechanic phase*
 * should be drawn with, or `undefined` to use its own. The engine assigns this to
 * `Enemy.animType` each frame, which overrides the sprite lookup without touching `type`
 * — so stats, drops and the Collection Log entry are all unaffected.
 *
 * Brutus is the first user (calm bull ↔ enraged demon) and the template: any boss state
 * that changes how the boss must be fought should be readable off the model. Add a case
 * here rather than reaching into the renderer.
 */
export function bossAnimVariant(state: BossState | undefined): string | undefined {
  if (state?.kind !== 'brutus') return undefined;
  const phase = state.brutusPhase;
  return phase === 'brace' || phase === 'dash' ? BRUTUS_DEMONIC_SLUG : undefined;
}

/**
 * The other half of the visual-state rule: the **mechanic clip** a boss's current phase
 * should be playing instead of its walk loop, plus how far into that clip it is.
 *
 * Some mechanics *are* an animation — the Mole's dig is not "the Mole, stationary", it is
 * the real OSRS burrow; Brutus bracing is him pawing the ground. Those clips outrank both
 * the walk loop and the hurt flinch, because a flinch that interrupted the telegraph
 * would break the one thing the mechanic is trying to communicate.
 *
 * `elapsed` counts up from 0 across the phase, which is why each phase's duration and its
 * clip are declared together here: the clip is sized to the phase, not the other way
 * round. Returns `null` for a boss that is simply walking.
 */
export function bossPhaseClip(state: BossState | undefined): { name: string; elapsed: number } | null {
  if (!state) return null;
  if (state.kind === 'giant_mole') {
    const left = state.moleTimer ?? 0;
    if (state.molePhase === 'dig') return { name: 'burrow', elapsed: MOLE_DIG_SECS - left };
    if (state.molePhase === 'emerge') return { name: 'emerge', elapsed: MOLE_EMERGE_SECS - left };
    return null;
  }
  if (state.kind === 'brutus') {
    const left = state.brutusTimer ?? 0;
    if (state.brutusPhase === 'brace') return { name: 'rage', elapsed: BRUTUS_BRACE_SECS - left };
    if (state.brutusPhase === 'dash') return { name: 'charge', elapsed: BRUTUS_DASH_SECS - left };
    return null;
  }
  if (state.kind === 'kbd') {
    // One clip (OSRS sequence 81) across two phases, cut at the frame he spits.
    // The rear-up is *stretched* over the tell — a long, deliberate inhale — and the
    // settle plays at its own speed afterwards, so the fire leaves him on exactly the
    // frame his head comes forward rather than at some arbitrary point in the animation.
    const left = state.kbdTimer ?? 0;
    if (state.kbdPhase === 'inhale') {
      const progress = Math.min(1, Math.max(0, (KBD_INHALE_SECS - left) / KBD_INHALE_SECS));
      return { name: 'breath', elapsed: KBD_BREATH_RELEASE * progress };
    }
    if (state.kbdPhase === 'recover') {
      return { name: 'breath', elapsed: KBD_BREATH_RELEASE + (KBD_RECOVER_SECS - left) };
    }
    return null;
  }
  return null;
}

// ─────────────────────────────────── Scurrius ──────────────────────────────
/**
 * The swarm axis. A heavy hit **shears a Giant rat off his own health bar**: the rat
 * carries HP taken *from him*, so the encounter total never grows — it only changes
 * shape, from one fat target into several small moving ones.
 *
 * That is the whole fairness argument. Burst is not punished, it is *redistributed*:
 * a board with AoE takes the shape change for free, a pure single-target board
 * manufactures its own problem, and it does so by a visible choice rather than a roll.
 *
 * The question he asks: **does your board handle HP that has been redistributed, or
 * only HP that is stacked?** The Mole asks about space, Cerberus about composition;
 * this is the third axis and nobody else owns it.
 */

/** A single hit must be this fraction of his max HP to shear a rat. Big hits shear;
 *  chip damage never does, which is what makes the mechanic a consequence of how the
 *  player built rather than a tax on time. */
export const SCURRIUS_SHEAR_FRAC = 0.05;
/** HP a sheared rat carries, as a fraction of his max — taken from him, never added. */
export const SCURRIUS_RAT_HP_FRAC = 0.06;
/** Seconds before he may shear again. Without it a single AoE volley landing on him
 *  in one frame would produce the whole litter at once. */
export const SCURRIUS_SHEAR_COOLDOWN = 0.8;
/** Live rats at once. The anti-frustration cap — it binds the squeak as well as the
 *  shear, so no combination of triggers can bury the board. */
export const SCURRIUS_MAX_RATS = 5;
/** He stops shearing at or below this HP fraction, so the end of the fight is a clean
 *  kill rather than an endless stream of adds off a boss that will not die. */
export const SCURRIUS_SHEAR_FLOOR = 0.12;
/** Seconds between guaranteed squeaks. The floor: a pure chip-damage board never
 *  triggers a shear, and a boss whose mechanic never fires teaches nothing (the exact
 *  failure that made the first two tower-disables read as bugs). */
export const SCURRIUS_SQUEAK_INTERVAL = 8;
/** Rat speed as a multiple of his. Rats are quick; they get clear of him at once. */
export const SCURRIUS_RAT_SPEED_MULT = 1.6;
/** Seconds a rat wanders before it turns and heads home. */
export const SCURRIUS_WANDER_SECS = 5;
/** How far from the shear point a rat may roam (≈4 tiles). Keeps the distraction in
 *  the same stretch of board as the fight it came out of. */
export const SCURRIUS_WANDER_LEASH = 128;
/** How close a returning rat must get to be absorbed. */
export const SCURRIUS_REFUND_RADIUS = 26;
/** His overhead on the guaranteed squeak — the OSRS convention of announcing it. */
export const SCURRIUS_SAY = '*squeaks*';
/**
 * Seconds he stands still to squeak — **the price he pays.**
 *
 * Every other boss here gives something up for its mechanic (the Mole loses the ground it
 * skipped, Brutus spends the walk back). His shear costs him nothing on its own — it only
 * redistributes HP he already had — so the guaranteed squeak is where he pays, in the one
 * currency a tower-defense enemy has: distance not travelled. It doubles as the mechanic's
 * loudest tell, since a boss that halts reads from anywhere on the board while an overhead
 * on a moving sprite does not.
 */
export const SCURRIUS_SQUEAK_STOP = 1.4;

/** Where a sheared rat is in its short life. */
export type RatPhase = 'wander' | 'return';

/**
 * Does this hit shear a rat off him?
 *
 * Every guard that keeps the mechanic from becoming an avalanche lives here rather
 * than at the call site, so a future caller cannot forget one: the cooldown, the live
 * cap and the HP floor are all part of the answer.
 */
export function scurriusShouldShear(
  hit: number, maxHp: number, hpFrac: number, cooldown: number, liveRats: number,
): boolean {
  if (cooldown > 0) return false;
  if (liveRats >= SCURRIUS_MAX_RATS) return false;
  if (hpFrac <= SCURRIUS_SHEAR_FLOOR) return false;
  return hit >= maxHp * SCURRIUS_SHEAR_FRAC;
}

/**
 * HP the rat takes with it — and therefore the HP he loses in the same frame.
 *
 * Clamped so the shear can never carry him below {@link SCURRIUS_SHEAR_FLOOR}. Without
 * that clamp a shear at low health could kill him, and "HP is conserved" would stop
 * being true at the exact moment the player is watching the bar.
 */
export function scurriusRatHp(maxHp: number, currentHp: number): number {
  const want = Math.max(1, Math.round(maxHp * SCURRIUS_RAT_HP_FRAC));
  const spare = Math.max(0, Math.floor(currentHp - maxHp * SCURRIUS_SHEAR_FLOOR));
  return Math.min(want, spare);
}

/**
 * The next point a wandering rat skitters to: **uniform random inside the leash**, and
 * deliberately unbiased.
 *
 * A rat that homed in on towers would read as a guided missile; an aimless one reads as
 * vermin, which is what makes it a *distraction*. Towers get visited plenty anyway,
 * because towers sit near the road and the road is where the rat was born.
 *
 * `rand` is injected so the walk is testable; the engine passes `Math.random`.
 */
export function ratWanderTarget(
  originX: number, originY: number, rand: () => number,
  width: number, height: number, margin = 26,
): Point {
  const ang = rand() * Math.PI * 2;
  const dist = SCURRIUS_WANDER_LEASH * (0.35 + 0.65 * rand());
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    x: clamp(originX + Math.cos(ang) * dist, margin, width - margin),
    y: clamp(originY + Math.sin(ang) * dist, margin, height - margin),
  };
}

/**
 * HP the king actually regains when a rat makes it home — whatever the rat still holds,
 * capped at full. Ignoring the rats therefore *undoes* the burst that created them,
 * which is the price of ignoring them, and it is a price paid in time rather than lives.
 */
export function ratRefund(ratHp: number, kingHp: number, kingMaxHp: number): number {
  return Math.min(kingMaxHp, kingHp + Math.max(0, ratHp)) - kingHp;
}

// ─────────────────────── Grotesque Guardians (Dawn & Dusk) ─────────────────
/**
 * The linked pair. Dusk is the one a wave draws; Dawn only ever arrives with him.
 *
 * While both live they share their stone: each takes {@link GUARDIAN_LINK_DAMAGE_MULT}
 * damage. Kill one and the survivor breaks the link — it takes full damage and speeds
 * up — but it also starts hauling its twin back, and if it is still standing when
 * {@link GUARDIAN_REVIVE_SECS} runs out, the twin returns on
 * {@link GUARDIAN_REVIVE_HP_FRAC} of its health and the mitigation comes back with it.
 *
 * So killing one early is a *trap*: it trades a halved-damage fight for a race. The
 * intended play is to bleed both down together and converge at the end. No other boss
 * cares about the **order** you kill things in.
 */
export const GUARDIAN_LINK_DAMAGE_MULT = 0.5;
/** Seconds the survivor needs to drag its twin back up. The pair is two-bosses-in-one,
 *  so the revive is deliberately slow — bumped 10% (rounded up) over the old 12s so a
 *  botched "kill one early" costs a little more of the clock. */
export const GUARDIAN_REVIVE_SECS = Math.ceil(12 * 1.1); // 14
/** A Grotesque Guardian leaks for this fraction of a normal boss's life cost. Each
 *  twin is only "half" a boss, so an individual leak stings less — though both leaking
 *  (2 × 0.75 = 1.5×) still out-costs a single boss, keeping the pair the bigger threat. */
export const GUARDIAN_LEAK_MULT = 0.75;

/** Apply the Guardian discount to a boss leak cost — never below 1 life. */
export function guardianLeakCost(baseBossCost: number): number {
  return Math.max(1, Math.round(baseBossCost * GUARDIAN_LEAK_MULT));
}
/** The health a resurrected twin returns on, as a fraction of its max. */
export const GUARDIAN_REVIVE_HP_FRAC = 0.5;
/** Speed the survivor gains while enraged (applied to `baseSpeed`). */
export const GUARDIAN_ENRAGE_SPEED_MULT = 1.4;
/** How far apart the pair walk, in logic pixels — Dawn flies off to Dusk's side. */
export const GUARDIAN_PAIR_OFFSET = 82;

/** Is this one of the Grotesque Guardians? */
export function isGuardian(kind: BossId | undefined): boolean {
  return kind === 'dawn' || kind === 'dusk';
}

/** The twin of a Guardian — who it arrives with, and who it will drag back up. */
export function guardianTwin(kind: BossId): BossId | undefined {
  if (kind === 'dusk') return 'dawn';
  if (kind === 'dawn') return 'dusk';
  return undefined;
}

/** The health a twin comes back on. Never zero, however small the boss. */
export function guardianReviveHp(maxHp: number): number {
  return Math.max(1, Math.round(maxHp * GUARDIAN_REVIVE_HP_FRAC));
}

/**
 * Form a pair: point two Guardians' states at each other, switch the shared stone
 * back on, and close the opening move on **both**.
 *
 * That last part is what stops the pair from multiplying. Only Dusk opens the fight
 * (see {@link guardianShouldSummonTwin}) and he asks his own state whether he has
 * done it yet — but a *revived* Dusk is a new enemy carrying a fresh {@link BossState},
 * so without this he reads "not yet" on his first frame and summons a second Dawn,
 * leaving the survivor, the revived Dusk and a brand-new Dawn standing at once. Recording
 * it at the moment of pairing makes it true however the pair came to be: Dusk's opening
 * summon, or a resurrection.
 */
export function linkGuardianStates(
  a: { id: string; state: BossState },
  b: { id: string; state: BossState },
) {
  a.state.partnerId = b.id;
  b.state.partnerId = a.id;
  a.state.linked = true;
  b.state.linked = true;
  a.state.summonedTwin = true;
  b.state.summonedTwin = true;
}

/**
 * May the survivor drag its twin back up?
 *
 * The absence of the twin is the only signal the survivor gets, and absence has two
 * causes that are not the same thing: the towers *killed* it, or it walked off the end
 * of the road. Reviving in the second case charged the player twice for one Guardian —
 * it leaked, took its lives, came back on half health and could leak again. A twin that
 * escaped is gone; only a killed one is owed a resurrection.
 */
export function guardianCanRevive(state: BossState): boolean {
  return !state.twinEscaped;
}

/** Does this Guardian still owe the fight its twin? Only Dusk brings one in, and only
 *  once — having been paired, by his own summon or by a revival, settles it for good. */
export function guardianShouldSummonTwin(kind: BossId, state: BossState): boolean {
  return kind === 'dusk' && !state.summonedTwin;
}

// ────────────────────────────────── Cerberus ───────────────────────────────
/**
 * The style lock. At each HP threshold Cerberus summons his three Summoned Souls, and
 * **each soul locks one combat style**: while the melee soul lives, melee towers barely
 * scratch him, and likewise ranged and magic. With all three up he is armoured against
 * everything, and the only way forward is through them.
 *
 * The question that creates is *which soul to kill first*, and the answer depends on the
 * board you actually built — a mono-style board has exactly one soul that matters. That
 * is not Jad's "kill the adds" (his healers are interchangeable): these are not.
 *
 * Styleless damage (DoT) is deliberately **not** locked. A soul locks a *style*, and a
 * burn has none — the same escape valve Zulrah's phases leave open, and a slow one: it
 * chips, it does not carry the fight.
 */
export const SOUL_STYLES: readonly CombatStyle[] = ['melee', 'ranged', 'magic'];
/** HP fractions at which the trio is (re)summoned. */
export const CERBERUS_SOUL_THRESHOLDS: readonly number[] = [0.66, 0.33];
/** Damage a locked style deals to Cerberus while its soul lives. Not zero: a board with
 *  no answer still grinds, it just grinds badly. */
export const CERBERUS_SOUL_LOCK_MULT = 0.15;
/** Each soul's HP as a fraction of Cerberus's max — enough to need real focus, little
 *  enough that focus is *enough*. */
export const CERBERUS_SOUL_HP_FRAC = 0.08;
/** Radius (px) the souls orbit him at. Wider than Jad's healers: three of them plus a
 *  big dog needs room, and they must be clickable/targetable apart from him. */
export const CERBERUS_SOUL_ORBIT = 104;
/** HP fraction at or below which Cerberus enrages. */
export const CERBERUS_ENRAGE_HP = 0.25;
/** Speed multiplier applied to `baseSpeed` on enrage. */
export const CERBERUS_ENRAGE_SPEED_MULT = 1.3;

/** The baked clip slug for a soul of `style` (`soul_melee` / `soul_ranged` / …). Each is
 *  a different NPC in the cache, carrying that style's weapon — bow, staff or blade. */
export function soulAnimSlug(style: CombatStyle): string {
  return `soul_${style}`;
}

/** Whether Cerberus should summon his trio now: HP has crossed the next threshold and he
 *  has not already summoned for it. `summons` is how many batches he has sent. */
export function cerberusShouldSummon(hpFrac: number, summons: number): boolean {
  return summons < CERBERUS_SOUL_THRESHOLDS.length && hpFrac <= CERBERUS_SOUL_THRESHOLDS[summons];
}

/** Whether Cerberus is in his final, enraged phase. */
export function cerberusIsEnraged(hpFrac: number): boolean {
  return hpFrac <= CERBERUS_ENRAGE_HP;
}

/** Damage multiplier a `style` suffers against the styles the live souls have locked. */
export function soulLockMult(locked: readonly CombatStyle[] | undefined, style: CombatStyle | undefined): number {
  if (!style || !locked?.length) return 1;
  return locked.includes(style) ? CERBERUS_SOUL_LOCK_MULT : 1;
}

// ───────────────────────────── the stall breaker ───────────────────────────
/**
 * Every fight needs a clock, because several can otherwise settle into a loop that never
 * resolves: the Hydra's vent heals back more than a thin board can strip, Cerberus's
 * souls cut a mono-style board to a fifth, the Regenerating affix claws HP back on its
 * own. Pair any of those with enough crowd control to keep the enemy off the base and the
 * run reaches a state with **no terminal condition** — the player cannot kill it, it
 * cannot kill them, the wave never ends, and (since gold only arrives on a kill or a wave
 * clear) no income ever comes in to build out of it. Losing is a fine outcome; being
 * stuck is not.
 *
 * So an enemy that is *making no progress towards death* starts breaking free. The clock
 * measures the only thing that matters — has it been driven to a new low HP? — so a
 * player who is slowly winning never sees it, and one who is netting zero is escalated
 * until the fight resolves one way or the other. Each stack hardens it against control
 * (see `debuffTenacity`'s `bonus`) and dries up its healing; at full stacks the healing is
 * gone outright, so any damage at all now sticks, and the control holding it is cut to the
 * point of immunity — it dies or it walks, and walking costs lives and ends the wave.
 *
 * It lives in this file because bosses are what it was written for, but **it is not
 * boss-only**: a rank-and-file Regenerating enemy parked in a stun tower's range deadlocks
 * a run exactly the same way, and that is the bug the naming here once hid. The engine
 * runs this for every enemy (`GameEngine.stepStallClock`).
 */
/** Seconds an enemy may go without reaching a new low HP before it starts breaking free. */
export const STALL_GRACE = 20;
/** Seconds between escalation stacks once it is stalling. */
export const STALL_STEP = 5;
/** Fraction of max HP that counts as real progress — chip damage inside the noise of a
 *  heal cycle must not reset the clock, or a healing enemy would hold it at zero forever. */
export const STALL_PROGRESS = 0.01;
/** Stacks the escalation tops out at. */
export const STALL_MAX_STACKS = 6;
/** Tenacity added per stack, on top of what the enemy has already built. */
export const STALL_TENACITY_PER_STACK = 0.1;
/** Fraction of an enemy's self-heal (or regeneration) removed per stack, so it dries up
 *  entirely at 4. */
export const STALL_HEAL_PER_STACK = 0.25;
/** Seconds since the last hit within which an enemy still counts as *being fought*. The
 *  clock only runs while it is engaged, so it cannot start ticking at the spawn portal
 *  while the enemy is still walking into range of anything. */
export const STALL_ENGAGE_WINDOW = 5;

/** The stall clock's persistent fields. A boss keeps them inside its {@link BossState};
 *  every other enemy carries a bare one of these (`Enemy.stall`). */
export interface StallState {
  /** The lowest HP fraction the enemy has been driven to — the bar it must beat. */
  hpFloor: number;
  /** Seconds since it last beat that bar. */
  stallTimer: number;
  /** Escalation stacks, derived from the timer. */
  stallStacks: number;
  /** Seconds since the enemy last took damage. `Infinity` until it is hit at all, which is
   *  what keeps one that has only just spawned off the clock entirely. */
  sinceHit?: number;
  /** The escalation's **high-water mark**: stacks this enemy has earned and now keeps for
   *  good. Progress resets the clock, never this — see {@link stepStall}. */
  stallFloor?: number;
}

/** Is the enemy actually being fought right now? Only then does the stall clock run. */
export function stallIsEngaged(sinceHit: number | undefined): boolean {
  return (sinceHit ?? Infinity) <= STALL_ENGAGE_WINDOW;
}

/** Stacks an enemy stalled for `stallTimer` seconds has earned. */
export function stallStacksFor(stallTimer: number): number {
  if (stallTimer <= STALL_GRACE) return 0;
  const over = stallTimer - STALL_GRACE;
  return Math.min(STALL_MAX_STACKS, 1 + Math.floor(over / STALL_STEP));
}

/**
 * Advance the stall clock one frame.
 *
 * Reaching a new low HP (by at least {@link STALL_PROGRESS}) is *progress*: it resets the
 * clock, so a board that is genuinely grinding the enemy down never sees the escalation
 * climb. What it does **not** do is hand the escalation back. The stacks already earned
 * are a floor (`stallFloor`), and the next stalemate starts counting from there rather
 * than from zero.
 *
 * That is the whole fix for the loop this was written against. A control build does not
 * hold an enemy at a flat HP — it holds it in a *cycle*: stun, chip, stun, chip. Every
 * chip counted as progress, wiped six stacks of tenacity, and handed the build another
 * twenty seconds of grace to re-lock the enemy in; the escalation could never finish, and
 * a boss that had already fought its way to 4/6 of breaking free was put back at 0/6 for
 * one point of damage. Monotonic stacks close it: the enemy keeps every step it has
 * taken toward walking free, so the cycle can be entered any number of times and still
 * only ever ends one way.
 *
 * The clock only runs while the enemy is **engaged** — hit inside the last
 * {@link STALL_ENGAGE_WINDOW} seconds. One nobody is shooting is not in a
 * stalemate, it is just walking, and it will reach the base on its own; starting the
 * countdown at its spawn only meant it arrived pre-hardened. While disengaged the timer
 * *freezes* rather than resetting, so the escalation cannot be wiped by holding fire.
 */
export function stepStall(prev: StallState, hpFrac: number, dt: number): StallState {
  const sinceHit = (prev.sinceHit ?? Infinity) + dt;
  // The floor only ever moves on a progress reset. Reading it back off the live stacks
  // every frame would compound — each frame's total becoming the next frame's baseline —
  // and the escalation would reach its cap in six frames rather than six stalled steps.
  const floor = prev.stallFloor ?? 0;
  if (hpFrac <= prev.hpFloor - STALL_PROGRESS) {
    const kept = Math.max(floor, prev.stallStacks ?? 0);
    return { hpFloor: hpFrac, stallTimer: 0, stallStacks: kept, sinceHit, stallFloor: kept };
  }
  if (!stallIsEngaged(sinceHit)) return { ...prev, sinceHit, stallFloor: floor };
  const stallTimer = prev.stallTimer + dt;
  // Escalation resumes *from* the floor, so an enemy that reached 4/6 needs one more
  // grace-plus-step to reach 5/6 — not seven of them to get back to where it was.
  const stallStacks = Math.min(STALL_MAX_STACKS, floor + stallStacksFor(stallTimer));
  return { hpFloor: prev.hpFloor, stallTimer, stallStacks, sinceHit, stallFloor: floor };
}

/** Extra tenacity from the escalation — pushes a stalled enemy past the CC-built cap to
 *  outright immunity, which is what guarantees it eventually walks. */
export function stallTenacityBonus(stacks: number): number {
  return Math.max(0, stacks) * STALL_TENACITY_PER_STACK;
}

/** Multiplier on a stalled enemy's healing — its boss self-heal or its Regenerating
 *  affix alike. Zero once it is thoroughly stuck, so a board that is *nearly* strong
 *  enough is handed the fight rather than the stalemate. */
export function stallHealMult(stacks: number): number {
  return Math.max(0, 1 - Math.max(0, stacks) * STALL_HEAL_PER_STACK);
}

// ────────────────────────── King Black Dragon ──────────────────────────────
/**
 * The King Black Dragon: the first boss that attacks the **board** instead of the
 * player's attention.
 *
 * Every boss before him answers "can your damage reach me?" — Brutus steps out of it,
 * the Mole ducks under it, Scurrius splits it up. The King Black Dragon leaves the
 * damage alone and sets the ground on fire: he rears back, and a stretch of road
 * catches. Every tower whose range covers the burning stretch hits for half while it
 * burns.
 *
 * That makes the *shape* of the defence the answer. A killbox — six towers stacked
 * around one bend, the strongest thing a player can build against everything else — is
 * exactly what he picks, because the breath lands on whichever stretch the most towers
 * are covering. A long, thin line down the road loses two towers to a breath instead of
 * the whole board. Punishing tight clustering is the idea this boss owns
 * (`docs/boss-design.md`, axis B).
 *
 * It is deliberately **not** a disable: a scorched tower still fires, still tracks,
 * still feeds the DPS meter — it just hits softly. Disables already have an owner
 * (Brutus's trample) and a fixed look, and a second source stacked onto it would read as
 * the same mechanic twice. What the player loses here is the *value* of having built
 * everything in one place, which is a different loss from losing the tower.
 *
 * Fidelity: KBD's dragonfire in OSRS is exactly this — a wide, unavoidable breath that
 * scorches whoever failed to prepare for it, and the counter is preparation, not
 * dodging. The three-tick tell before it lands is ours, borrowed from the game's own
 * convention for telegraphed specials, because a mechanic the player cannot see coming
 * is a bug.
 *
 * NPC 239 in the cache.
 */
export type KbdPhase = 'fly' | 'inhale' | 'recover';

/** Seconds after he arrives before the first breath — long enough that the player sees a
 *  dragon walking the road before the board catches fire. */
export const KBD_FIRST_BREATH = 6;
/** Seconds between breaths, measured from one landing to the next tell. The burn lasts
 *  six of them, so the board spends roughly half the fight scorched somewhere. */
export const KBD_BREATH_INTERVAL = 13;
/** The tell: he plants, rears back, and the stretch he picked starts smouldering.
 *  **Three game ticks** — the window every telegraphed special in this game gives. */
export const KBD_INHALE_SECS = 1.8;
/** Seconds into his baked `breath` clip (OSRS sequence 81) at which his head snaps
 *  forward and the fire actually leaves him. The inhale is stretched to end exactly here,
 *  so the gouts appear on the frame he spits them — the tell is him drawing the breath,
 *  not a countdown played over an unrelated animation. */
export const KBD_BREATH_RELEASE = 0.82;
/** The rest of that clip: him dropping back onto all fours after the breath. He stays
 *  planted through it, so the whole gesture — rear, spit, settle — reads as one action
 *  and the halt is visibly what it cost him. */
export const KBD_RECOVER_SECS = 0.96;
/** How long the road burns once the breath lands. */
export const KBD_BURN_SECS = 6;
/** Logic pixels of road set alight — about five tiles, wide enough that a killbox cannot
 *  simply be rebuilt one tile to the left of it. */
export const KBD_SCORCH_LENGTH = 170;
/** What a scorched tower's damage is multiplied by. Half: felt immediately, and still
 *  worth having built. */
export const KBD_SCORCH_MULT = 0.5;
/** How finely the burning stretch is sampled — for the coverage test and for the flames
 *  the renderer draws along it. */
export const KBD_SCORCH_STEP = 22;
/** His tell. In-game strings stay English. */
export const KBD_SAY = '*inhales*';
/** How fast a gout of dragonfire crosses the board (logic px/s). Fast enough to read as
 *  fire being *thrown*, slow enough that the eye can follow it from his mouth to the
 *  road and connect the two. */
export const KBD_BREATH_SPEED = 620;
/** Floor on a gout's flight, so the near end of the stretch still shows a projectile
 *  rather than igniting on the same frame it was fired. */
export const KBD_BREATH_MIN_FLIGHT = 0.12;
/** Ceiling on it, so a breath fired from the far corner of the board still lands inside
 *  the burn it belongs to. */
export const KBD_BREATH_MAX_FLIGHT = 0.75;
/**
 * How far a gout bows off the straight line to its patch, as a fraction of that line's
 * length — the flattest and the most arced gout of a volley.
 *
 * Two jobs, one number. Fire is *lobbed*: a gout that travels the straight line between
 * two points reads as a laser, not as something thrown. And a volley is one gout per
 * patch of road, all leaving the same mouth on the same frame at the same speed — on a
 * straight line they overlap into what looks like two or three projectiles, no matter how
 * many were actually fired. Giving each its own bow fans them apart, so the count the
 * player sees in the air is the count that lands on the ground.
 */
export const KBD_BREATH_BOW_MIN = 0.12;
export const KBD_BREATH_BOW_MAX = 0.46;

/** The four breaths he carries, in the order he cycles them — his own cache GFX
 *  (spotanims 393-396: fire, poison, ice, shock), so a second breath reads as a second
 *  breath rather than a repeat of the first. */
export const KBD_BREATH_SLUGS = [
  'proj_dragonfire', 'proj_dragonfire_poison', 'proj_dragonfire_ice', 'proj_dragonfire_shock',
] as const;

/** Which breath the `n`th one of the fight is. Cycles, so a long fight shows all four. */
export function breathSlug(index: number): string {
  const n = KBD_BREATH_SLUGS.length;
  return KBD_BREATH_SLUGS[((index % n) + n) % n];
}

/**
 * The bow of each gout in a volley of `n` — spread evenly from the flattest to the most
 * arced, so no two gouts of one breath fly the same curve.
 *
 * All of them lift (positive, i.e. off the chord towards the top of the board) rather
 * than fanning to both sides: crossing arcs read as a mess, a spray that all rises and
 * comes down reads as one breath.
 */
export function breathBows(
  n: number, min = KBD_BREATH_BOW_MIN, max = KBD_BREATH_BOW_MAX,
): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(min + max) / 2];
  return Array.from({ length: n }, (_, i) => min + (max - min) * (i / (n - 1)));
}

/**
 * The quadratic Bézier control point for a bowed gout: the midpoint of the chord, pushed
 * off it along the perpendicular by `bow` × the chord's length.
 *
 * The normal is always chosen to point *up* the board (negative y), so a breath aimed
 * left and a breath aimed right arc the same way instead of mirroring into a dive.
 */
export function breathArcControl(from: Point, to: Point, bow: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Unit perpendicular, flipped so it always lifts.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const lift = bow * len;
  return { x: (from.x + to.x) / 2 + nx * lift, y: (from.y + to.y) / 2 + ny * lift };
}

/** A point on that arc at `u` ∈ [0,1]. `u` is arc parameter, not time — the caller eases
 *  it, so the fire still accelerates out of his mouth. */
export function breathArcPoint(from: Point, to: Point, bow: number, u: number): Point {
  const c = breathArcControl(from, to, bow);
  const k = 1 - u;
  return {
    x: k * k * from.x + 2 * k * u * c.x + u * u * to.x,
    y: k * k * from.y + 2 * k * u * c.y + u * u * to.y,
  };
}

/** The heading along that arc at `u` — the Bézier's tangent, so the sprite points where
 *  it is actually going rather than at where it will end up. */
export function breathArcAngle(from: Point, to: Point, bow: number, u: number): number {
  const c = breathArcControl(from, to, bow);
  const k = 1 - u;
  const dx = 2 * k * (c.x - from.x) + 2 * u * (to.x - c.x);
  const dy = 2 * k * (c.y - from.y) + 2 * u * (to.y - c.y);
  return Math.atan2(dy, dx);
}


/** A tower as the scorch cares about it: where it stands and its range half-width in
 *  logic pixels (`squareRange(stats.range, GRID)`), so this maths never needs the stat
 *  pipeline. */
export interface ScorchTower {
  x: number;
  y: number;
  half: number;
}

/**
 * The centre-line of a burning stretch: the road sampled from `start` for `length`
 * pixels. Points rather than a from/to pair, because roads bend — a straight line
 * between the ends would cut the corner and burn grass nobody built along.
 */
export function scorchSpan(
  path: readonly Point[], start: number, length = KBD_SCORCH_LENGTH, step = KBD_SCORCH_STEP,
): Point[] {
  const pts: Point[] = [];
  if (path.length < 2) return pts;
  const head = path[0];
  for (let d = start; d <= start + length; d += step) {
    const p = advanceAlongPath(path, 0, head.x, head.y, Math.max(0, d));
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
}

/** The towers whose range square covers any part of the burning stretch — the ones that
 *  hit for {@link KBD_SCORCH_MULT} while it burns. */
export function scorchedTowers<T extends ScorchTower>(
  towers: readonly T[], span: readonly Point[],
): T[] {
  return towers.filter((t) => span.some((p) => inSquareRange(p.x, p.y, t.x, t.y, t.half)));
}

/**
 * Where the breath lands: the stretch of road the *most* towers are covering.
 *
 * This is the whole mechanic. He does not breathe at the player, or ahead of himself, or
 * at random — he breathes at whatever the board has been concentrated on, so the price of
 * stacking every tower around one bend is that one breath halves all of them. Ties go to
 * the earliest stretch, which keeps the pick deterministic (and testable).
 *
 * With nothing built, or nothing in reach of the road, every stretch scores zero and the
 * first one wins: the road still burns, harmlessly. That is the right reading — the
 * dragon breathes either way.
 */
export function pickScorchStart<T extends ScorchTower>(
  path: readonly Point[], towers: readonly T[],
  length = KBD_SCORCH_LENGTH, step = KBD_SCORCH_STEP,
): number {
  const last = Math.max(0, pathTotalLength(path) - length);
  let bestStart = 0;
  let bestScore = -1;
  for (let start = 0; start <= last; start += step) {
    const score = scorchedTowers(towers, scorchSpan(path, start, length, step)).length;
    if (score > bestScore) { bestScore = score; bestStart = start; }
  }
  return bestStart;
}

/**
 * When each patch of the stretch catches, in seconds after the breath is fired: how long
 * its own gout of dragonfire takes to fly there from his mouth.
 *
 * Time, not just distance, because the fire has to *arrive*. Deriving the ignition from
 * the flight is what keeps the two halves honest — the projectile the player watches and
 * the flame that halves their damage are the same event, and no patch can burn before
 * something visibly set it on fire.
 */
export function breathFlightTimes(
  from: Point, points: readonly Point[],
  speed = KBD_BREATH_SPEED, min = KBD_BREATH_MIN_FLIGHT, max = KBD_BREATH_MAX_FLIGHT,
): number[] {
  return points.map((p) => {
    const t = Math.hypot(p.x - from.x, p.y - from.y) / speed;
    return Math.min(max, Math.max(min, t));
  });
}

/** The patches of a scorch that are already alight at `timer` seconds — everything whose
 *  gout has landed. A scorch with no `lit` times (the telegraph) is lit all at once. */
export function litScorchPoints(
  points: readonly Point[], lit: readonly number[] | undefined, timer: number,
): Point[] {
  if (!lit) return [...points];
  return points.filter((_, i) => timer >= (lit[i] ?? 0));
}

/** True while he is rearing back mid-breath. He stops walking for the tell — that halt is
 *  what the breath costs him, and what makes the telegraph readable. */
export function kbdIsInhaling(state: BossState | undefined): boolean {
  return state?.kind === 'kbd' && state.kbdPhase === 'inhale';
}

/** True for the whole planted gesture — the inhale *and* the settle back down afterwards.
 *  This is what stops him walking; {@link kbdIsInhaling} is only the tell itself, which is
 *  the half the boss bar and the smoulder are about. */
export function kbdIsHalted(state: BossState | undefined): boolean {
  return state?.kind === 'kbd' && (state.kbdPhase === 'inhale' || state.kbdPhase === 'recover');
}

// ────────────────────────── Corporeal Beast ──────────────────────────
/**
 * The Corporeal Beast: the check on whether your board covers *itself*.
 *
 * He spits a **Dark energy core** at the single best tower you own. The core leaves the
 * road, flies to that tower and latches on; while it lives there, the tower stops
 * shooting the wave — every shot it would have fired is siphoned into the Beast as
 * healing instead — and the Beast himself is armoured, taking half damage while the
 * link holds. Kill the core and the tower comes straight back, the armour with it.
 *
 * The idea is not "a tower is disabled" (KBD already scorches, Vorkath already froze).
 * It is: **your best tower is now a liability, and the answer has to come from somewhere
 * else.** A board built around one star tower with nothing overlapping it turns its own
 * damage against itself the moment the core lands; a board of mutually covering pairs
 * answers it in a couple of seconds. KBD punishes six towers stacked in one killbox; the
 * Beast punishes one tower standing alone. Between them they teach the same lesson from
 * both ends.
 *
 * Fidelity: this is his real fight. The Corporeal Beast spawns dark energy cores that
 * drain the team, and the room's whole job is to kill the core before it does its work.
 * OSRS also gives him a huge stab hole (dstab 25 against 200 everywhere else), which is
 * why every team that ever fought him brought a Zamorakian spear — we have no weapon
 * classes, so that lives in `STYLE_WEAKNESSES` as a plain melee weakness instead.
 *
 * NPC 319 in the cache; the core is NPC 320.
 */
/** Seconds after he arrives before the first core — long enough to see the thing walking
 *  the road before it reaches across the board at you. */
export const CORP_FIRST_CORE = 7;
/** Seconds between cores, measured spit to spit. */
export const CORP_CORE_INTERVAL = 15;
/** How many cores may hold towers at once. A ceiling, not a target: the timer keeps
 *  running, so a player who never kills one still only ever loses three towers — a boss
 *  that could eventually take the whole board is not a mechanic, it is a wall. */
export const CORP_MAX_CORES = 3;
/** A core's health as a fraction of the Beast's, so it stays killable-but-not-free at
 *  every wave the fight can appear on. */
export const CORP_CORE_HP_FRAC = 0.06;
/** Floor under that, for the sandbox and for any future scaling that shrinks him. */
export const CORP_CORE_MIN_HP = 40;
/** What the Beast's incoming damage is multiplied by while any core holds a link.
 *  Styleless, like the Guardians' shared stone: the answer is "kill the core", and
 *  letting a DoT chip past it would answer the mechanic for free. */
export const CORP_ARMOUR_MULT = 0.5;
/** The fraction of a siphoned shot that comes back as healing. Half, not all: feeding the
 *  full amount back would make one core worth two towers, and with the armour on top of
 *  it the fight would stop moving entirely. */
export const CORP_SIPHON_HEAL_FRAC = 0.5;
/** Logic pixels: how close the core must get to its tower before it latches. */
export const CORP_CORE_LATCH_DIST = 8;
/** His tell. In-game strings stay English. */
export const CORP_SAY = '*spits*';

/** One tower, as the core-pick sees it: what it is worth and whether a core already has
 *  it. `dps` is the caller's own damage-per-second estimate — the sim reads the live,
 *  cache-warm stats, the tests pass plain numbers. */
export interface SiphonCandidate {
  id: string;
  dps: number;
  /** True if some other core is already latched onto it, or on its way there. */
  taken?: boolean;
}

/**
 * Which tower the next core is spat at: **the best one still free**.
 *
 * Deliberately not the nearest. Nearest would make the mechanic a positioning puzzle the
 * player solves once by building away from the road — and since the Beast walks the road,
 * he would pick the same front-line tower every time. Picking the highest damage instead
 * aims the mechanic at exactly the board it is meant to test: the one carrying a single
 * star tower. Ties break on id, so the same board always answers the same way.
 */
export function pickSiphonTarget(candidates: readonly SiphonCandidate[]): string | null {
  let best: SiphonCandidate | null = null;
  for (const c of candidates) {
    if (c.taken) continue;
    if (!best || c.dps > best.dps || (c.dps === best.dps && c.id < best.id)) best = c;
  }
  return best ? best.id : null;
}

/** A core's health, from the Beast that spat it. */
export function corpCoreHp(bossMaxHp: number): number {
  return Math.max(CORP_CORE_MIN_HP, Math.round(bossMaxHp * CORP_CORE_HP_FRAC));
}

/**
 * What a siphoned shot heals the Beast for. Runs through {@link stallHealMult} like every
 * other boss heal, so a player who has stopped making progress cannot be held there
 * forever by a core they are not killing.
 */
export function corpSiphonHeal(damage: number, stallStacks = 0): number {
  if (damage <= 0) return 0;
  return Math.max(1, Math.floor(damage * CORP_SIPHON_HEAL_FRAC * stallHealMult(stallStacks)));
}

/** True while at least one core holds a link — the half the armour and the boss bar are
 *  about. The sim recounts `coresLatched` from the live cores each frame, so the guard
 *  drops on the frame the last one dies. */
export function corpIsArmoured(state: BossState | undefined): boolean {
  return state?.kind === 'corporeal_beast' && (state.coresLatched ?? 0) > 0;
}

// ──────────────────────────── General Graardor ─────────────────────────────
/**
 * **General Graardor — the body-block.**
 *
 * His three sergeants march *ahead of him on the road*, and while any of them is still
 * further along than he is, he is armoured almost to nothing. That is the whole idea, and
 * it is built the only way this game can build an "adds first" fight: the player's aim
 * vocabulary is a per-tower priority, not a click-to-focus, so a mechanic that needs a
 * specific tower pointed at a specific add is unbuildable here. **Geometry does the target
 * selection instead** — the default `first` priority already shoots whatever is furthest
 * along the road, which is exactly the guards, so a board that never touches its priority
 * dropdown solves the fight correctly, and a board that has switched everything to
 * `strongest` finds out why the General is not dying.
 *
 * The other half is the slam: he stops, roars, and *shatters your prayers* — the only
 * attack in the game aimed at the player's own interface rather than at their board.
 *
 * Fidelity: NPC 2215 in the cache, with Sergeants Strongstack (2216), Steelwill (2217) and
 * Grimspike (2218). In OSRS the bodyguards are the fight — a team that ignores them dies to
 * them, not to him — and the sergeants really do outrun the General, who is the slowest
 * thing in the room. The prayer-shatter stands in for his signature ranged slam, the attack
 * that punishes a team praying the wrong overhead.
 */
/** The three sergeants, in the order they are summoned. `lead` is how many logic pixels
 *  ahead of the General each one marches, `side` its offset from the road's centreline —
 *  together they read as a wedge with Strongstack at the point. Strongstack leads because
 *  he is the meleer: the one your towers meet first is the one with no style weakness. */
export const GRAARDOR_GUARDS: readonly { type: EnemyType; lead: number; side: number }[] = [
  { type: 'strongstack', lead: 96, side: 0 },
  { type: 'steelwill', lead: 58, side: -22 },
  { type: 'grimspike', lead: 58, side: 22 },
];

/** What the General's incoming damage is multiplied by while a guard is still in front of
 *  him. Harder than the Beast's armour (0.5) because his has an off switch that is *not* a
 *  style switch and not a timer — three killable bodies — and because his own bar is
 *  deliberately small. Styleless, like every other boss guard: letting a DoT chip through
 *  would answer the mechanic without killing anything. */
export const GRAARDOR_ARMOUR_MULT = 0.2;
/** A sergeant's health as a fraction of the General's, so the trio carries about 42% of the
 *  encounter's HP *outside* the boss bar and stays killable at every wave he can appear
 *  on. */
export const GRAARDOR_GUARD_HP_FRAC = 0.14;
/** Floor under that, for the sandbox and for any future scaling that shrinks him. */
export const GRAARDOR_GUARD_MIN_HP = 60;
/** Seconds after he arrives before the first slam — long enough to have started killing
 *  guards before the interface goes dark. */
export const GRAARDOR_SLAM_FIRST = 12;
/** Seconds between slams, measured roar to roar. */
export const GRAARDOR_SLAM_INTERVAL = 22;
/** How long he stands still winding one up. He is halted for the whole windup, which is the
 *  tell: the ground he gives up is the price of the attack. */
export const GRAARDOR_SLAM_WINDUP = 1.2;
/**
 * How far the slam actually reaches. Deliberately **small** — a few tiles around him
 * rather than the shockwave the ring used to suggest — because what it does inside that
 * circle is hand out crowd-control immunity, and an area that covered half the board
 * would mean every wave he is in walks straight through the player's control.
 */
export const GRAARDOR_SLAM_RADIUS = 96;
/** Seconds of crowd-control immunity the slam grants everything standing in it. Brief:
 *  it is a window his line gets to move in, not a state. */
export const GRAARDOR_SLAM_CC_SECS = 3;
/** How long your prayers stay shattered. Long enough to be felt at the exact moment you
 *  most want an overhead, short enough that it is a window and not a phase. */
export const GRAARDOR_PRAYER_LOCK = 6;
/** His tell. In-game strings stay English. */
export const GRAARDOR_SAY = 'For the glory of Bandos!';

/** A sergeant's health, from the General who brought him. */
export function graardorGuardHp(bossMaxHp: number): number {
  return Math.max(GRAARDOR_GUARD_MIN_HP, Math.round(bossMaxHp * GRAARDOR_GUARD_HP_FRAC));
}

/** True while at least one sergeant is still further along the road than he is. The sim
 *  recounts `guardsAhead` from the live guards every frame, so the armour drops on the
 *  frame the last one dies — and drops on its own at the road's end, where the lead clamps
 *  to the final waypoint and the General walks out from behind his own wedge. */
export function graardorIsArmoured(state: BossState | undefined): boolean {
  return state?.kind === 'graardor' && (state.guardsAhead ?? 0) > 0;
}

/** True while he is planted, winding up a slam. `moveEnemies` reads this to halt him. */
export function graardorIsSlamming(state: BossState | undefined): boolean {
  return state?.kind === 'graardor' && (state.slamWindup ?? 0) > 0;
}


// ───────────────────────────────── Nex ─────────────────────────────────────
/**
 * **Nex: the four wards.**
 *
 * She never walks in alone. One acolyte marches on the road in front of her, and while
 * that acolyte stands she is *shielded*: untargetable and immune. Kill it and she opens
 * up — until her health crosses the next threshold, when the next acolyte arrives and the
 * wall goes back up. Four acolytes, four gates, and after the last one she is exposed for
 * the rest of the fight.
 *
 * It is built out of the same two pieces General Graardor is, for the same reason: the
 * player's aim vocabulary is a per-tower priority, never a click-to-focus, so the fight
 * has to *aim itself*. Here it does that twice over — the acolyte carries a real, higher
 * road position (so `first` finds it), it carries a small fraction of the encounter's
 * health (so `weakest` finds it too), and Nex herself is dropped out of every tower's
 * reach while shielded, so a board on `strongest` or `last` is redirected onto the ward
 * whether it meant to be or not. There is no priority setting that gets this fight wrong.
 *
 * And it can never deadlock: {@link NEX_WARD_MAX_SECS} after a ward goes up the shield
 * falls off on its own, acolyte alive or not. A board that cannot kill the ward is then
 * simply fighting Nex with an escort — slower, but a fight, not a wall.
 *
 * Fidelity: NPC 11278 in the cache, with Fumus (11283), Umbra (11284), Cruor (11285) and
 * Glacies (11286). In OSRS those four really are the phase gates — smoke, shadow, blood,
 * ice, in that order — and Nex really is invulnerable until the phase's acolyte is dead.
 */
/** Her four acolytes, in the order she calls them: smoke, shadow, blood, ice — the same
 *  order the God Wars fight runs in. Index 0 arrives with her; the rest come at
 *  {@link NEX_PHASE_THRESHOLDS}. `say` is the line she calls each one in with; in-game
 *  strings stay English. */
export const NEX_ACOLYTES: readonly { type: EnemyType; name: string; say: string }[] = [
  { type: 'fumus', name: 'Fumus', say: 'Fumus, don your mask!' },
  { type: 'umbra', name: 'Umbra', say: 'Umbra, embrace darkness!' },
  { type: 'cruor', name: 'Cruor', say: 'Cruor, spill their blood!' },
  { type: 'glacies', name: 'Glacies', say: 'Glacies, freeze them where they stand!' },
];

/** The HP fractions she raises the next ward at — one per acolyte after the first, so the
 *  fight is four roughly equal quarters with a gate between each. */
export const NEX_PHASE_THRESHOLDS: readonly number[] = [0.75, 0.5, 0.25];

/** An acolyte's health as a fraction of hers. Deliberately *small*: a ward is a gate, not
 *  a second health bar, and it has to sit below the pack around it so a `weakest`-priority
 *  tower picks it out as readily as a `first` one does. */
export const NEX_ACOLYTE_HP_FRAC = 0.11;
/** Floor under that, for the sandbox and for any scaling that shrinks her. */
export const NEX_ACOLYTE_MIN_HP = 70;
/** How many logic pixels ahead of her the ward marches. Far enough that a tower reaching
 *  Nex reaches the acolyte first, close enough that it still reads as *her* escort. */
export const NEX_ACOLYTE_LEAD = 62;
/** The fail-safe. Seconds a ward may hold before the shield falls off by itself, acolyte
 *  dead or not — the guarantee that a board which cannot break the gate is still in a
 *  fight rather than in a deadlock. */
export const NEX_WARD_MAX_SECS = 22;
/** Her opening line. In-game strings stay English. */
export const NEX_SAY = 'There is no escape!';

/** An acolyte's health, from the Nex who called it. */
export function nexAcolyteHp(bossMaxHp: number): number {
  return Math.max(NEX_ACOLYTE_MIN_HP, Math.round(bossMaxHp * NEX_ACOLYTE_HP_FRAC));
}

/** True while a ward is up: she is untargetable (`inReach` drops her) *and* immune
 *  (`bossStyleMult` returns 0). Both, on purpose — the first redirects aimed fire onto the
 *  acolyte, the second stops splash and DoT chipping her from behind it. */
export function nexIsShielded(state: BossState | undefined): boolean {
  return state?.kind === 'nex' && !!state.nexWarded;
}

/** The acolyte holding the current gate, or `undefined` before the first one arrives and
 *  after the last is spent. */
export function nexWard(
  state: BossState | undefined,
): { type: EnemyType; name: string; say: string } | undefined {
  if (state?.kind !== 'nex' || !state.nexWarded) return undefined;
  return NEX_ACOLYTES[(state.nexPhase ?? 0) - 1];
}

/** Whether she owes the board another ward yet: her health has crossed the threshold for
 *  the next acolyte and she still has one left to call. Returns the acolyte's index, or
 *  `-1` for "not yet" — which is also the answer once all four are spent, and that is the
 *  final phase: she stands exposed for the rest of the fight. */
export function nexNextWardIndex(state: BossState | undefined, hpFrac: number): number {
  if (state?.kind !== 'nex') return -1;
  const called = state.nexPhase ?? 0;
  if (called === 0) return 0; // she arrives behind Fumus, before a shot is fired
  if (called >= NEX_ACOLYTES.length) return -1;
  return hpFrac <= NEX_PHASE_THRESHOLDS[called - 1] ? called : -1;
}

// ───────────────────────────── shared boss state ───────────────────────────
/** Mutable per-boss runtime state the engine stores on the boss enemy. */
export interface BossState {
  kind: BossId;
  /** Seconds alive — drives Zulrah's phase rotation. */
  timer: number;
  /** Zulrah's current form index. */
  phaseIndex: number;
  /** Vorkath: true while the ice shield is up (damage-immune). */
  immune?: boolean;
  /** Vorkath: counts down to the next shield-up, or to shield-end while immune. */
  iceTimer?: number;
  /** Jad: rolling record of recent damage taken, for the heal calc. */
  recentDamage?: DamageEvent[];
  /** Jad: accumulates toward the next heal tick. */
  healTickTimer?: number;
  /** Jad: true once he has summoned the current batch of healers. */
  healSummoned?: boolean;
  /** Jad: counts down before he may re-summon after a wipe. */
  resummonTimer?: number;
  /** Hydra: true while a chemical vent is open (hardened + regenerating). */
  venting?: boolean;
  /** Hydra: seconds left in the open vent window. */
  ventTimer?: number;
  /** Hydra: damage dealt since the vent opened (pre-hardening, via {@link hydraVentCredit}),
   *  against {@link hydraBreakTarget}. */
  ventDamage?: number;
  /** Hydra: HP regenerated at vents so far this fight, against Perfect Hydra's
   *  allowance (see {@link hydraHealSpoilsPerfect}). */
  ventHealed?: number;
  /** Hydra: seconds before a sealed vent may open again — the board's full-damage window. */
  ventCooldown?: number;
  /** Hydra: vents shattered so far — this, not HP, drives the phase. */
  shattered?: number;
  /** Hydra: true once it has entered its final enraged phase. */
  enraged?: boolean;
  /** Hydra: counts down to the next chain lightning while enraged. */
  /** Giant Mole: where it is in the burrow cycle. */
  molePhase?: MolePhase;
  /** Giant Mole: seconds left in the current {@link molePhase} — above ground, this is
   *  the countdown to the next dig. */
  moleTimer?: number;
  /** Giant Mole: burrows completed, read out on the boss bar. */
  burrows?: number;
  /** Guardians: the live twin's enemy id. Stale once the twin dies — the engine looks
   *  it up each frame and a failed lookup *is* the "my twin is down" signal. */
  partnerId?: string;
  /** Guardians: which boss my twin is, so a survivor knows what to drag back up. */
  twinType?: BossId;
  /** Guardians: true while both stand — the shared-stone damage mitigation is on. */
  linked?: boolean;
  /** Guardians: counts down to the twin's resurrection while the survivor lives. */
  reviveTimer?: number;
  /** Guardians (Dusk only): he has already brought Dawn in, so he never does it twice. */
  summonedTwin?: boolean;
  /** Guardians: my twin left the field alive — see {@link guardianCanRevive}. */
  twinEscaped?: boolean;
  /** Cerberus: the styles his live souls are currently locking. The engine rebuilds this
   *  each frame from the souls that are still standing, so killing one frees its style
   *  the moment it dies. */
  lockedStyles?: CombatStyle[];
  /** Cerberus: how many batches of souls he has summoned (one per threshold). */
  soulSummons?: number;
  /** Brutus: where he is in the rampage cycle. */
  brutusPhase?: BrutusPhase;
  /** Brutus: seconds left in the current {@link brutusPhase} (the `return` leg ends on
   *  arrival, not on a clock). */
  brutusTimer?: number;
  /** Brutus: seconds before he can be provoked again. */
  brutusCooldown?: number;
  /** Brutus: damage taken since the last rampage, against {@link BRUTUS_RAGE_DAMAGE_FRAC}. */
  rageDamage?: number;
  /** Brutus: the last valid point on the road he stood on — he must walk back to exactly
   *  this spot, which is what stops the dash from ever being a shortcut. */
  homeX?: number;
  homeY?: number;
  /** Brutus: the unit vector of the current lunge. */
  dashX?: number;
  dashY?: number;
  /** Brutus: rampages completed, read out on the boss bar. */
  rampages?: number;
  /** Scurrius: seconds before he may shear another rat. */
  scurriusShearCooldown?: number;
  /** Scurrius: counts down to the next guaranteed squeak. */
  squeakTimer?: number;
  /** Scurrius: seconds left of the halt he takes to squeak. */
  squeakStop?: number;
  /** Scurrius: rats shorn so far, read out on the boss bar. */
  ratsShorn?: number;
  /** KBD: where he is in the breath cycle. */
  kbdPhase?: KbdPhase;
  /** KBD: seconds left of the current {@link kbdPhase} — while flying, the countdown to
   *  the next breath. */
  kbdTimer?: number;
  /** KBD: the stretch he is breathing at, picked when the tell starts, so the fire lands
   *  on exactly the road that smouldered — even if the player builds during the window. */
  scorchAt?: Point[];
  /** KBD: breaths taken, read out on the boss bar. */
  breaths?: number;
  /** Corporeal Beast: counts down to the next core. */
  coreTimer?: number;
  /** Corporeal Beast: cores spat so far, read out on the boss bar. */
  coresSpat?: number;
  /** Corporeal Beast: how many of them are currently latched onto a tower. Rebuilt from
   *  the live cores every frame (like Cerberus's locked styles), so the armour drops the
   *  instant the last one dies rather than a tick later. */
  coresLatched?: number;
  /** Graardor: true once his three sergeants have been brought in — he never does it
   *  twice, so a wiped guard is gone for good. */
  guardsSummoned?: boolean;
  /** Graardor: how many live sergeants are still further along the road than he is —
   *  recounted every frame, and the whole of {@link graardorIsArmoured}. */
  guardsAhead?: number;
  /** Graardor: counts down to the next prayer-shattering slam. */
  slamTimer?: number;
  /** Graardor: seconds left in the windup he is planted for; 0 when not slamming. */
  slamWindup?: number;
  /** Graardor: slams landed, read out on the boss bar. */
  slams?: number;
  /** Nex: true while a ward holds — she is untargetable and immune. */
  nexWarded?: boolean;
  /** Nex: how many acolytes she has called so far, 0-4. Doubles as the phase number, and
   *  as the index of the current ward in {@link NEX_ACOLYTES} plus one. */
  nexPhase?: number;
  /** Nex: the current acolyte's enemy id, so a ward the fail-safe already broke — still
   *  alive and still marching ahead of her — is not mistaken for the one holding the gate. */
  nexWardId?: string;
  /** Nex: seconds left on the fail-safe ({@link NEX_WARD_MAX_SECS}). */
  nexWardTimer?: number;
  /** Nex: acolytes actually cut down, read out on the boss bar and by the achievement. */
  nexWardsBroken?: number;
  /** Stall breaker: the lowest HP fraction this boss has been driven to. */
  hpFloor?: number;
  /** Stall breaker: seconds since it last reached a new low. */
  stallTimer?: number;
  /** Stall breaker: escalation stacks — 0 for any fight that is actually progressing. */
  stallStacks?: number;
  /** Stall breaker: seconds since it last took damage. The engine zeroes this on every
   *  hit that lands; the clock only advances while it is inside the engage window. */
  sinceHit?: number;
  /** Stall breaker: the high-water mark of the escalation, which progress never gives back. */
  stallFloor?: number;
}

/** Build the initial state for a freshly-spawned boss of `kind`. */
export function freshBossState(kind: BossId): BossState {
  const state: BossState = {
    kind, timer: 0, phaseIndex: 0,
    // The stall clock, armed for every boss but not yet *running*: `sinceHit` starts at
    // Infinity, so an untouched boss is never counted as stalling.
    hpFloor: 1, stallTimer: 0, stallStacks: 0, sinceHit: Infinity,
  };
  if (kind === 'vorkath') state.iceTimer = VORKATH_ICE_INTERVAL;
  if (kind === 'jad') { state.recentDamage = []; state.healTickTimer = 0; }
  if (kind === 'hydra') { state.shattered = 0; state.ventDamage = 0; }
  if (kind === 'giant_mole') {
    state.molePhase = 'above';
    state.moleTimer = MOLE_BURROW_INTERVAL;
    state.burrows = 0;
  }
  if (kind === 'brutus') {
    state.brutusPhase = 'calm';
    // Armed, not running: he arrives able to be provoked the moment he is hurt enough.
    state.brutusCooldown = 0;
    state.rageDamage = 0;
    state.rampages = 0;
  }
  if (kind === 'kbd') {
    state.kbdPhase = 'fly';
    state.kbdTimer = KBD_FIRST_BREATH;
    state.breaths = 0;
  }
  if (kind === 'corporeal_beast') {
    state.coreTimer = CORP_FIRST_CORE;
    state.coresSpat = 0;
    state.coresLatched = 0;
  }
  if (kind === 'graardor') {
    state.guardsSummoned = false;
    state.guardsAhead = 0;
    state.slamTimer = GRAARDOR_SLAM_FIRST;
    state.slamWindup = 0;
    state.slams = 0;
  }
  if (kind === 'nex') {
    // Phase 0 is "she has not called anyone yet": the sim summons Fumus on her first frame
    // and steps this to 1, so the ward is up before a tower ever gets a shot at her.
    state.nexPhase = 0;
    state.nexWarded = false;
    state.nexWardTimer = 0;
    state.nexWardsBroken = 0;
  }
  if (isGuardian(kind)) state.twinType = guardianTwin(kind);
  if (kind === 'cerberus') { state.soulSummons = 0; state.lockedStyles = []; }
  if (kind === 'scurrius') {
    state.scurriusShearCooldown = 0;
    state.squeakTimer = SCURRIUS_SQUEAK_INTERVAL;
    state.squeakStop = 0;
    state.ratsShorn = 0;
  }
  return state;
}

/**
 * Damage multiplier from a boss's *phase mechanics* for an incoming `style`
 * (separate from affixes). Zulrah applies its rock-paper-scissors style bias; a
 * venting Hydra hardens to a fraction; everything else is neutral. `immune` short-
 * circuits to 0 and is shared: Vorkath raises it behind its ice shield, the Giant Mole
 * while it is underground.
 */
/**
 * The combat styles a boss is *actively praying against* this phase — the ones
 * the renderer should show a protection-prayer overhead for. Only **per-style**
 * resistance counts: a protection prayer tells the player "switch styles", which
 * is only true advice when some styles still get through.
 *
 * - **Zulrah** resists the two styles its current form is *not* weak to.
 * - **Cerberus** resists whatever styles his live souls have locked.
 *
 * All-*source* blocks are deliberately excluded (they are not per-style, so a
 * prayer icon would mislead): Vorkath's ice shield and the Hydra's vent stop
 * everything, styleless DoT included, and each has its own VFX identity.
 */
export function phaseResistedStyles(state: BossState | undefined): CombatStyle[] {
  if (!state) return [];
  const ALL: readonly CombatStyle[] = ['melee', 'ranged', 'magic'];
  if (state.kind === 'zulrah') {
    const phase = ZULRAH_PHASES[state.phaseIndex % ZULRAH_PHASES.length];
    return ALL.filter((s) => s !== phase.weak);
  }
  if (state.kind === 'cerberus') return [...(state.lockedStyles ?? [])];
  return [];
}

export function bossStyleMult(state: BossState | undefined, style: CombatStyle | undefined): number {
  if (!state) return 1;
  if (state.immune) return 0;
  if (state.kind === 'zulrah') {
    const phase = ZULRAH_PHASES[state.phaseIndex % ZULRAH_PHASES.length];
    return zulrahStyleMult(phase.weak, style);
  }
  // The Hydra's vent hardens it against *every* source, styleless DoT included —
  // it is a burst check, not a style check, so there is no way to chip around it.
  if (state.kind === 'hydra' && state.venting) return HYDRA_VENT_DAMAGE_MULT;
  // A Guardian standing beside its twin shares its stone. Styleless too: the pair is a
  // test of *kill order*, and letting DoT slip past the link would answer it for free.
  if (isGuardian(state.kind) && state.linked) return GUARDIAN_LINK_DAMAGE_MULT;
  // Cerberus is armoured against every style one of his live souls is holding. Unlike the
  // two above this leaves styleless DoT alone — a soul locks a *style*, and a burn has
  // none (the same seam Zulrah's phases leave).
  if (state.kind === 'cerberus') return soulLockMult(state.lockedStyles, style);
  // The Corporeal Beast's guard, for as long as a core holds one of your towers. Styleless
  // on purpose (see CORP_ARMOUR_MULT): the mechanic has exactly one answer, and it is the
  // core — not a style switch, and not waiting out a burn.
  if (corpIsArmoured(state)) return CORP_ARMOUR_MULT;
  // General Graardor, for as long as a sergeant is still marching in front of him.
  // Styleless for the same reason: the answer is the guards, and only the guards.
  if (graardorIsArmoured(state)) return GRAARDOR_ARMOUR_MULT;
  // Nex behind a ward. A flat 0 rather than Graardor's fraction, because this gate also
  // takes her out of every tower's reach: leaving a sliver through would only mean splash
  // and DoT quietly answering a gate that nothing on the board is even aiming at.
  if (nexIsShielded(state)) return 0;
  return 1;
}

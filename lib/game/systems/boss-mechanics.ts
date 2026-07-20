import type { CombatStyle, Point } from '../types';
import type { DamageTag } from './combat-stats';
import { pathTotalLength, remainingPathDistance, advanceAlongPath } from './geometry';

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
 *    Brutus, runs *off* the road, then walks back to the exact spot he left. He gains no
 *    ground — but any tower he ploughs through on the way out is knocked offline for a
 *    few seconds, so the charge costs you a damage window *and* a hole in your board.
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

export type BossId = 'zulrah' | 'vorkath' | 'jad' | 'hydra' | 'giant_mole' | 'dusk' | 'dawn' | 'cerberus' | 'brutus';

/** The bosses that carry phase mechanics: they get a {@link BossState} on spawn and
 *  roll boss modifiers once seen. The engine and the save sanitiser read this to decide
 *  who has state. */
export const MECHANIC_BOSSES: readonly BossId[] = [
  'jad', 'vorkath', 'zulrah', 'hydra', 'giant_mole', 'dusk', 'dawn', 'cerberus', 'brutus',
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
  'brutus', 'giant_mole', 'jad', 'vorkath', 'zulrah', 'dusk', 'cerberus', 'hydra',
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
 * Which way he lunges: perpendicular to the stretch of road he is on, on the side
 * *away* from `threat` (the tower that has been hurting him). Flinching out of the
 * densest fire is what makes a tight killbox leakier, and it reads as an animal
 * recoiling rather than as a random jitter.
 *
 * With no threat to flinch from he picks the segment's left-hand normal — a stable
 * default, so a Brutus nobody is shooting still behaves deterministically.
 */
export function brutusDashDirection(
  from: Point,
  to: Point,
  self: Point,
  threat?: Point | null,
): Point {
  const sx = to.x - from.x;
  const sy = to.y - from.y;
  const len = Math.hypot(sx, sy) || 1;
  const nx = -sy / len;
  const ny = sx / len;
  // The threat sits on the +n side → lunge to −n, and vice versa.
  const flip = threat ? (threat.x - self.x) * nx + (threat.y - self.y) * ny > 0 : false;
  return flip ? { x: -nx, y: -ny } : { x: nx, y: ny };
}

/** Anywhere in the rampage — normal path movement is suspended for all of it, because
 *  every phase either holds him still or drives him somewhere the road does not go. */
export function brutusIsRampaging(state: BossState | undefined): boolean {
  return state?.kind === 'brutus' && !!state.brutusPhase && state.brutusPhase !== 'calm';
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
  return null;
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
 * Every boss fight needs a clock, because several of them can otherwise settle into a
 * loop that never resolves: the Hydra's vent heals back more than a thin board can
 * strip, Cerberus's souls cut a mono-style board to a fifth, the Regenerating affix
 * claws HP back on its own. Pair any of those with enough crowd control to keep the
 * boss off the base and the run reaches a state with **no terminal condition** — the
 * player cannot kill it, it cannot kill them, the wave never ends, and (since gold
 * only arrives on a kill or a wave clear) no income ever comes in to build out of it.
 * Losing is a fine outcome; being stuck is not.
 *
 * So a boss that is *making no progress towards death* starts breaking free. The clock
 * measures the only thing that matters — has it been driven to a new low HP? — so a
 * player who is slowly winning never sees it, and one who is netting zero is escalated
 * until the fight resolves one way or the other. Each stack hardens it against control
 * (see `debuffTenacity`'s `bonus`) and dries up its self-healing; at full stacks it is
 * CC-immune and simply walks, which costs lives and ends the wave.
 */
/** Seconds a boss may go without reaching a new low HP before it starts breaking free. */
export const BOSS_STALL_GRACE = 20;
/** Seconds between escalation stacks once it is stalling. */
export const BOSS_STALL_STEP = 5;
/** Fraction of max HP that counts as real progress — chip damage inside the noise of a
 *  heal cycle must not reset the clock, or a healing boss would hold it at zero forever. */
export const BOSS_STALL_PROGRESS = 0.01;
/** Stacks the escalation tops out at. */
export const BOSS_STALL_MAX_STACKS = 6;
/** Tenacity added per stack, on top of what the boss has already built. */
export const BOSS_STALL_TENACITY_PER_STACK = 0.1;
/** Fraction of a boss's self-heal removed per stack (so it dries up entirely at 4). */
export const BOSS_STALL_HEAL_PER_STACK = 0.25;
/** Seconds since the last hit within which a boss still counts as *being fought*. The
 *  clock only runs while it is engaged, so it cannot start ticking at the spawn portal
 *  while the boss is still walking into range of anything. */
export const BOSS_STALL_ENGAGE_WINDOW = 5;

/** The stall clock's persistent fields (a slice of {@link BossState}). */
export interface StallState {
  /** The lowest HP fraction the boss has been driven to — the bar it must beat. */
  hpFloor: number;
  /** Seconds since it last beat that bar. */
  stallTimer: number;
  /** Escalation stacks, derived from the timer. */
  stallStacks: number;
  /** Seconds since the boss last took damage. `Infinity` until it is hit at all, which is
   *  what keeps a boss that has only just spawned off the clock entirely. */
  sinceHit?: number;
}

/** Is the boss actually being fought right now? Only then does the stall clock run. */
export function bossIsEngaged(sinceHit: number | undefined): boolean {
  return (sinceHit ?? Infinity) <= BOSS_STALL_ENGAGE_WINDOW;
}

/** Stacks a boss stalled for `stallTimer` seconds has earned. */
export function bossStallStacks(stallTimer: number): number {
  if (stallTimer <= BOSS_STALL_GRACE) return 0;
  const over = stallTimer - BOSS_STALL_GRACE;
  return Math.min(BOSS_STALL_MAX_STACKS, 1 + Math.floor(over / BOSS_STALL_STEP));
}

/**
 * Advance the stall clock one frame. Reaching a new low HP (by at least
 * {@link BOSS_STALL_PROGRESS}) is *progress*: it resets the clock and drops every stack,
 * so a board that is genuinely grinding the boss down is never touched by any of this.
 *
 * The clock only runs while the boss is **engaged** — hit inside the last
 * {@link BOSS_STALL_ENGAGE_WINDOW} seconds. A boss nobody is shooting is not in a
 * stalemate, it is just walking, and it will reach the base on its own; starting the
 * countdown at its spawn only meant it arrived pre-hardened. While disengaged the timer
 * *freezes* rather than resetting, so the escalation cannot be wiped by holding fire.
 */
export function stepBossStall(prev: StallState, hpFrac: number, dt: number): StallState {
  const sinceHit = (prev.sinceHit ?? Infinity) + dt;
  if (hpFrac <= prev.hpFloor - BOSS_STALL_PROGRESS) {
    return { hpFloor: hpFrac, stallTimer: 0, stallStacks: 0, sinceHit };
  }
  if (!bossIsEngaged(sinceHit)) return { ...prev, sinceHit };
  const stallTimer = prev.stallTimer + dt;
  return { hpFloor: prev.hpFloor, stallTimer, stallStacks: bossStallStacks(stallTimer), sinceHit };
}

/** Extra tenacity from the escalation — pushes a stalled boss past the CC-built cap to
 *  outright immunity, which is what guarantees it eventually walks. */
export function stallTenacityBonus(stacks: number): number {
  return Math.max(0, stacks) * BOSS_STALL_TENACITY_PER_STACK;
}

/** Multiplier on a stalled boss's self-healing — zero once it is thoroughly stuck, so a
 *  board that is *nearly* strong enough is handed the fight rather than the stalemate. */
export function stallHealMult(stacks: number): number {
  return Math.max(0, 1 - Math.max(0, stacks) * BOSS_STALL_HEAL_PER_STACK);
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
  /** Stall breaker: the lowest HP fraction this boss has been driven to. */
  hpFloor?: number;
  /** Stall breaker: seconds since it last reached a new low. */
  stallTimer?: number;
  /** Stall breaker: escalation stacks — 0 for any fight that is actually progressing. */
  stallStacks?: number;
  /** Stall breaker: seconds since it last took damage. The engine zeroes this on every
   *  hit that lands; the clock only advances while it is inside the engage window. */
  sinceHit?: number;
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
  if (isGuardian(kind)) state.twinType = guardianTwin(kind);
  if (kind === 'cerberus') { state.soulSummons = 0; state.lockedStyles = []; }
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
  return 1;
}

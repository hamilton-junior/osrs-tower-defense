import type { CombatStyle, Point } from '../types';
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
 *  - **Vorkath** periodically raises an ice shield: immune to all damage for a
 *    short window while it freezes (disables) the nearest tower.
 *  - **Jad** summons Yt-HurKot healers below half health; while they live he
 *    regenerates a fraction of the damage dealt to him over the last few seconds.
 *  - **Alchemical Hydra** opens a chemical vent at each HP threshold: it hardens and
 *    regenerates until the player bursts through a break target. Shattering a vent
 *    advances its phase, arcs lightning through a line of towers, and leaves it
 *    briefly vulnerable. Below a tenth of its health it enrages.
 *
 *  - **Giant Mole** burrows: it drops underground — untouchable, invisible — and
 *    surfaces further along the path, skipping the stretch you fortified. It will not
 *    dig on the final approach, so the last stretch is always fought honestly.
 *
 *  - **Grotesque Guardians** arrive as a linked pair (Dawn & Dusk). While both stand
 *    they share their stone and each takes halved damage; kill one and the survivor
 *    enrages — and drags its twin back up unless it dies too, inside the window.
 *
 * Each boss owns one idea: Zulrah tests style coverage, Vorkath tests patience, Jad
 * tests target priority, the Hydra tests burst, the Mole tests *where* you built, and
 * the Guardians test the *order* you kill in.
 */

export type BossId = 'zulrah' | 'vorkath' | 'jad' | 'hydra' | 'giant_mole' | 'dusk' | 'dawn';

/** The bosses that carry phase mechanics: they get a {@link BossState} on spawn and
 *  roll boss modifiers once seen. The engine and the save sanitiser read this to decide
 *  who has state. */
export const MECHANIC_BOSSES: readonly BossId[] = [
  'jad', 'vorkath', 'zulrah', 'hydra', 'giant_mole', 'dusk', 'dawn',
];

/**
 * The bosses a wave may *draw* — what `rollWaveBosses` picks from and what the debug
 * panel offers. **Order is the introduction order**: a fresh account meets one per boss
 * wave in this sequence, so the ladder runs gentlest (the Mole) → hardest (the Hydra).
 *
 * Deliberately a separate list from {@link MECHANIC_BOSSES}, because the two answer
 * different questions. Every schedulable boss has state, but not every boss with state
 * may be scheduled: one that only ever arrives as another boss's companion needs a
 * `BossState` and has no business being drawn on its own.
 */
export const SCHEDULABLE_BOSSES: readonly BossId[] = [
  'giant_mole', 'jad', 'vorkath', 'zulrah', 'dusk', 'hydra',
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
/** Damage taken while hardened — a vent cuts incoming damage to a fifth. Note it
 *  is not zero: a player who out-paces the heal still grinds through, so the
 *  fight can stall but never hard-locks. */
export const HYDRA_VENT_DAMAGE_MULT = 0.2;
/** Fraction of max HP regenerated per second while a vent is open. */
export const HYDRA_VENT_HEAL_PER_SEC = 0.03;
/** Damage that must *land* during the window, as a fraction of max HP, to shatter
 *  the vent. Landed (post-mitigation) damage is what counts, so the bar the player
 *  sees fill is the damage they actually see land. */
export const HYDRA_VENT_BREAK_FRAC = 0.08;
/** Seconds of ×1.25 vulnerability granted for shattering a vent — the burst reward. */
export const HYDRA_SHATTER_VULN_SECS = 2;
/** HP fraction at or below which the Hydra enrages. */
export const HYDRA_ENRAGE_HP = 0.1;
/** Speed multiplier applied to `baseSpeed` on enrage. */
export const HYDRA_ENRAGE_SPEED_MULT = 1.35;
/** Towers the chain lightning arcs through (the first is the one nearest the Hydra). */
export const HYDRA_ZAP_CHAIN = 3;
/** Seconds each zapped tower is disabled. */
export const HYDRA_ZAP_DISABLE_SECS = 2.5;
/** Cadence of the chain lightning while enraged (outside enrage it only fires on a shatter). */
export const HYDRA_ENRAGE_ZAP_SECS = 6;

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

/** Whether a vent should open now: HP has crossed the next threshold and no vent
 *  is already open. Re-crossing the same threshold re-opens it — that is the
 *  stall loop for a player who cannot yet muster the break. */
export function hydraShouldVent(hpFrac: number, shattered: number, venting: boolean): boolean {
  if (venting) return false;
  const next = hydraNextThreshold(shattered);
  return next !== null && hpFrac <= next;
}

/** Landed damage needed to shatter an open vent. */
export function hydraBreakTarget(maxHp: number): number {
  return Math.max(1, Math.round(maxHp * HYDRA_VENT_BREAK_FRAC));
}

/** HP regenerated over `dt` seconds of an open vent. */
export function hydraVentHeal(maxHp: number, dt: number): number {
  return maxHp * HYDRA_VENT_HEAL_PER_SEC * dt;
}

/** Whether the Hydra is in its final, enraged phase. */
export function hydraIsEnraged(hpFrac: number): boolean {
  return hpFrac <= HYDRA_ENRAGE_HP;
}

/**
 * The towers the chain lightning arcs through: it strikes the tower nearest the
 * Hydra, then hops greedily to the nearest tower it has not hit yet, `count`
 * times. Returns fewer when the board holds fewer towers. Pure so the hop order
 * is testable without a board.
 */
export function hydraZapChain<T extends { x: number; y: number }>(
  towers: readonly T[], x: number, y: number, count: number,
): T[] {
  const remaining = [...towers];
  const chain: T[] = [];
  let fromX = x;
  let fromY = y;
  while (chain.length < count && remaining.length > 0) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - fromX;
      const dy = remaining[i].y - fromY;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    const [hop] = remaining.splice(best, 1);
    chain.push(hop);
    fromX = hop.x;
    fromY = hop.y;
  }
  return chain;
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

/** Seconds the Mole walks between digs. */
export const MOLE_BURROW_INTERVAL = 9;
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
export const MOLE_BURROW_FRAC = 0.12;
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
/** Seconds the survivor needs to drag its twin back up. */
export const GUARDIAN_REVIVE_SECS = 12;
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
  /** Hydra: damage landed since the vent opened, against {@link hydraBreakTarget}. */
  ventDamage?: number;
  /** Hydra: vents shattered so far — this, not HP, drives the phase. */
  shattered?: number;
  /** Hydra: true once it has entered its final enraged phase. */
  enraged?: boolean;
  /** Hydra: counts down to the next chain lightning while enraged. */
  zapTimer?: number;
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
}

/** Build the initial state for a freshly-spawned boss of `kind`. */
export function freshBossState(kind: BossId): BossState {
  const state: BossState = { kind, timer: 0, phaseIndex: 0 };
  if (kind === 'vorkath') state.iceTimer = VORKATH_ICE_INTERVAL;
  if (kind === 'jad') { state.recentDamage = []; state.healTickTimer = 0; }
  if (kind === 'hydra') { state.shattered = 0; state.ventDamage = 0; }
  if (kind === 'giant_mole') {
    state.molePhase = 'above';
    state.moleTimer = MOLE_BURROW_INTERVAL;
    state.burrows = 0;
  }
  if (isGuardian(kind)) state.twinType = guardianTwin(kind);
  return state;
}

/**
 * Damage multiplier from a boss's *phase mechanics* for an incoming `style`
 * (separate from affixes). Zulrah applies its rock-paper-scissors style bias; a
 * venting Hydra hardens to a fraction; everything else is neutral. `immune` short-
 * circuits to 0 and is shared: Vorkath raises it behind its ice shield, the Giant Mole
 * while it is underground.
 */
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
  return 1;
}

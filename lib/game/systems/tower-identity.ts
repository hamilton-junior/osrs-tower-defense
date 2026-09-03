/**
 * Per-tower "personality" maths — the signature mechanic that gives each
 * non-wizard tower a niche the wizard can't fill. Pure and unit-tested so the
 * engine just calls in. The design goal (see the niche table in the engine's
 * firing block): every tower must beat the wizard at *something*, because the
 * Elemental spellbook already owns single-target burst and Ancients owns AoE.
 *
 *  - Archer  → volume DPS: fast cadence + a Dark Bow twin-shot (light cleave),
 *              with only a modest anti-tank nudge so it doesn't become the
 *              boss-killer (that's the Slayer / Toxic niche).
 *  - Cannon  → full-damage splash (no Ancients falloff) over a growing radius.
 *  - Slayer  → bonus vs a monster *category* (task / superior / boss).
 *  - Toxic   → venom: a damage-over-time that ramps the longer it's reapplied.
 */

import type { MarkKind } from './targeting';
import { distance, stretchAt, type RoadStretch } from './geometry';
import type { Point } from '../types';


/**
 * The kind of lingering status a tower lays on hit, for the `unmarked` priority
 * (it spreads *this* effect across the wave). Derived from the tower's identity
 * at fire time — its type, and for a wizard its spellbook mode + element/ancient:
 *  - toxic → venom · tzhaar → stun (pushback & crush both stun)
 *  - elemental wizard: water → vuln, earth → stun, fire → burn, air → none (pure
 *    knockback leaves no timer)
 *  - ancient wizard: ice → slow, shadow → stun, smoke → poison, blood → none
 *  - archer / cannon / slayer / utility → none
 */
export function towerMarkKind(tower: {
  type: string;
  mageMode?: string | null;
  element?: string | null;
  ancientType?: string | null;
}): MarkKind {
  switch (tower.type) {
    case 'toxic': return 'venom';
    case 'tzhaar': return 'stun';
    case 'wizard': {
      const mode = tower.mageMode ?? 'elemental';
      if (mode === 'elemental') {
        switch (tower.element ?? 'air') {
          case 'water': return 'vuln';
          case 'earth': return 'stun';
          case 'fire': return 'burn';
          default: return 'none'; // air: knockback only
        }
      }
      if (mode === 'ancients') {
        switch (tower.ancientType ?? 'ice') {
          case 'ice': return 'slow';
          case 'shadow': return 'stun';
          case 'smoke': return 'poison';
          default: return 'none'; // blood: lifesteal, no mark
        }
      }
      return 'none'; // utility
    }
    default: return 'none'; // archer, cannon, slayer
  }
}

/** Arrows loosed per attack. The Dark Bow (tier 3+) looses two. */
export function archerArrowCount(level: number): number {
  return level >= 3 ? 2 : 1;
}

/**
 * Modest anti-tank scaling for the tier-4 bow (Bow of Faerdhinen / twisted-bow
 * flavour): the wizard's damage is fixed, so the bow gets a *small* edge vs
 * beefy targets. Capped at +20% so it stays a nudge, not the Slayer's job.
 * 0% at ≤40 max HP, ramping linearly to +20% at ≥400 max HP.
 */
export function bowAntiTankMult(maxHp: number): number {
  const t = Math.max(0, Math.min(1, (maxHp - 40) / 360));
  return 1 + 0.2 * t;
}

/**
 * Cannon splash radius by tier (logic px). Grows so the late cannon clearly
 * out-zones the Ancients barrage's fixed 80px blast — the cannon's whole point
 * is raw crowd-clear. 70 → 84 → 98 → 112.
 */
export function cannonBlastRadius(level: number): number {
  return 70 + (level - 1) * 14;
}

/**
 * Slayer weapon's native damage multiplier vs an enemy, keyed off its *category*
 * (independent of the Slayer Helmet, which stacks on top). The best applicable
 * bonus wins (they don't multiply): the current task target, then superiors,
 * then bosses. 1.0 against anything else.
 */
export function slayerWeaponBonus(enemyType: string, taskType: string | null, isBoss: boolean): number {
  let best = 1;
  if (taskType && enemyType === taskType) best = Math.max(best, 1.5);
  if (enemyType.startsWith('superior_')) best = Math.max(best, 1.3);
  if (isBoss) best = Math.max(best, 1.25);
  return best;
}

/**
 * Whether the Slayer tower *specialises* against this enemy — i.e. it's in one of
 * the categories {@link slayerWeaponBonus} rewards (the current task, a superior,
 * or a boss). The Slayer tower prioritises these regardless of the player's set
 * priority, then applies the normal priority *within* the favoured group; with no
 * favoured enemy in range it targets normally. Single source of truth with the
 * damage bonus: favoured ⇔ bonus > 1.
 */
export function isSlayerFavoredTarget(enemyType: string, taskType: string | null, isBoss: boolean): boolean {
  return slayerWeaponBonus(enemyType, taskType, isBoss) > 1;
}

/**
 * Tower types that carry the Slayer weapon's specialisation — its category damage
 * bonus and its "favoured target first" targeting. The Slayer tower, and the
 * Scorching bow fused out of it, which inherits the whole behaviour.
 */
export function hasSlayerSpecialisation(type: string): boolean {
  return type === 'slayer' || type === 'scorching_bow';
}

/**
 * Tower types whose reach against a *favoured* target is the entire board. This
 * is the Scorching bow's whole trade: it is a plain, slightly weak bow against
 * the wave, and it never stops covering the one kill that matters. Its printed
 * range still governs everything else it shoots.
 */
export function favouredReachIsGlobal(type: string): boolean {
  return type === 'scorching_bow';
}

/**
 * The venom cap's wave multiplier. Venom is single-target, so it must always
 * out-damage the Ancient Smoke *poison* (AoE, `dps = wave`) — and, because
 * single-target should out-scale AoE, the margin *grows* with the wave. This
 * saturating curve rises from ~1.15× the wave number early to ~1.7× late:
 *   mult(1) ≈ 1.15,  mult(22) ≈ 1.50,  mult(70) ≈ 1.68.
 * Always > 1, so `ceil(wave * mult) > wave` on every wave — venom beats poison
 * from the first wave and pulls further ahead the longer a run goes.
 */
export function venomWaveMult(wave: number): number {
  return 1.7 - 0.55 * Math.exp(-wave / 22);
}

/**
 * The venom DoT's damage-per-second ceiling. The larger of two floors wins:
 *  - the tower's own hit (`hitDamage * 0.6`), which dominates in the early game
 *    when a toxic hit is bigger than the wave number, and
 *  - the wave-scaled track (`wave * mult(wave)`), which dominates late and keeps
 *    venom strictly above the Smoke poison (see `venomWaveMult`).
 */
export function venomCap(wave: number, hitDamage: number): number {
  return Math.max(Math.floor(hitDamage * 0.6), Math.ceil(wave * venomWaveMult(wave)));
}

/** Reapplies it takes a venom stack to reach its cap. An enemy crosses a toxic
 *  tower's range square in roughly five to six seconds, and the tower fires every
 *  two ticks, so a single fang saturates its own venom over one full pass and a
 *  second fang on the same stretch does it in half that — sustained fire pays,
 *  without the ceiling being theoretical. */
export const VENOM_RAMP_HITS = 5;

/**
 * Venom ramp parameters. Each reapply adds `step` to the poison's damage-per-second
 * up to `cap`, so sustained fire makes the venom hurt more — the toxic tower's niche
 * is a DoT that *climbs*, unlike the wizard's flat burn/poison. The cap scales with
 * the wave (see `venomCap`) so late-game venom keeps its single-target edge over AoE
 * poison. `dur` keeps it ticking after the enemy leaves range (set-and-forget chip).
 *
 * The step is a fraction of the CAP, not of the hit. Tying it to the hit (15% of it)
 * meant the ramp climbed at the speed of the toxic tower's weakest stat: on wave 90
 * the ceiling was ~150 dps and the step was 8, so the venom needed nineteen reapplies
 * — about twenty-one seconds of unbroken fire on one enemy — to reach a ceiling
 * nothing ever lived long enough to see. The niche was written in the code and
 * unreachable in play; now the ramp always lands in {@link VENOM_RAMP_HITS}.
 */
export function venomRamp(hitDamage: number, wave: number): { step: number; cap: number; dur: number } {
  const cap = venomCap(wave, hitDamage);
  const step = Math.max(2, Math.ceil(cap / VENOM_RAMP_HITS));
  return { step, cap: Math.max(step, cap), dur: 4 };
}

/**
 * **The Venator bow's sweep.** The shot does not stop at the enemy it was aimed
 * at — it carries on down the road it was standing on and keeps going back up
 * the road behind it, hitting everything on the way with no cap on how many.
 *
 * *Back* up the road, toward the portal, because that is where the wave is: the
 * enemy a tower shoots is the one furthest along, and everything still coming is
 * behind it. Sweeping forward would aim the shot at the empty road the wave has
 * already walked.
 *
 * It loses a quarter of its damage at every bend and gives out two bends later,
 * which is the whole placement question the tower asks: not *what* to point it
 * at — a tower is never asked that here — but where the road has a long run
 * behind it. A bow watching the straight approach to the exit sweeps the whole
 * queue; one tucked into a switchback hits a corner and stops.
 */

/** Damage lost per bend the sweep crosses. */
export const VENATOR_BEND_FALLOFF = 0.25;

/** Bends the sweep survives — so it covers this many stretches plus its own. */
export const VENATOR_BENDS = 2;

/** One stretch of road the sweep covers, and what it hits for there. */
export interface VenatorStretch {
  /** Index into the `stretches` array it came from. */
  stretch: number;
  /** First path segment covered, inclusive. */
  from: number;
  /** Last path segment covered, inclusive. */
  to: number;
  /** Damage multiplier on this stretch: 1, then 0.75, then 0.5. */
  mult: number;
  /** The run's two ends, carried so the shot can be drawn (and resolved) even if
   *  the player edits the road while it is in the air. */
  a: Point;
  b: Point;
}

/**
 * The stretches a Venator shot fired at an enemy on segment `seg` covers, in
 * order from the one it landed on outwards. Empty when the segment is off the
 * road at all, which can only happen if the path changed under a shot in flight.
 */
export function venatorReach(stretches: RoadStretch[], seg: number): VenatorStretch[] {
  const start = stretchAt(stretches, seg);
  if (start < 0) return [];
  const out: VenatorStretch[] = [];
  for (let k = 0; k <= VENATOR_BENDS; k++) {
    const i = start - k;
    if (i < 0) break;
    const s = stretches[i];
    out.push({ stretch: i, from: s.from, to: s.to, mult: 1 - VENATOR_BEND_FALLOFF * k, a: s.a, b: s.b });
  }
  return out;
}

/** Whether `seg` falls inside any stretch the sweep reached, and at what rate. */
export function venatorMultAt(reach: readonly { from: number; to: number; mult: number }[], seg: number): number {
  for (const r of reach) {
    if (seg >= r.from && seg <= r.to) return r.mult;
  }
  return 0;
}

/**
 * **The Noxious halberd's contagion.** The halberd does not grow venom, it
 * *moves* it: every swing reads the strongest venom already burning on anything
 * it touched and levels the whole swing up to that.
 *
 * Which is the entire point of the weapon. A Toxic tower's venom ramps toward a
 * cap over five reapplies on ONE enemy — enormous by the end of a wave, and
 * stuck on the one tank that stood in front of the fang long enough to earn it.
 * The halberd takes that grown venom and hands it to everything else in the
 * pack, so the fang's slow single-target ramp finally pays out across a wave.
 *
 * It seeds its own only when there is nothing to copy, and deliberately badly
 * ({@link HALBERD_SEED_FRAC} of one Toxic ramp step), so the halberd on its own
 * is a middling AoE melee and never a substitute for the tower it needs.
 *
 * The duration is the *longer* of the two, never the shorter: a venom that is
 * about to expire is still worth spreading at its own strength, and the swing
 * that spreads it is what refreshes it.
 */
export interface VenomLevel {
  /** Damage per second the venom is ticking for. */
  dps: number;
  /** Seconds it has left to run. */
  dur: number;
}

/** How much of one Toxic ramp step the halberd manages on its own. Under half a
 *  step: enough that a lone halberd still applies *a* venom, far too little to
 *  make one worth running without a fang beside it. */
export const HALBERD_SEED_FRAC = 0.5;

/**
 * The venom every enemy in one halberd swing comes out carrying: the strongest
 * of the venoms already present, or the halberd's own weak seed if there were
 * none worth copying.
 */
export function noxiousSpread(present: readonly VenomLevel[], seed: VenomLevel): VenomLevel {
  let best = seed;
  for (const v of present) if (v.dps > best.dps) best = v;
  return { dps: best.dps, dur: Math.max(best.dur, seed.dur) };
}

/** The venom a halberd raises with nothing to copy — a fraction of the ramp step
 *  a Toxic tower would have applied for the same hit. */
export function halberdSeedDps(rampStep: number): number {
  return Math.max(1, Math.round(rampStep * HALBERD_SEED_FRAC));
}

/**
 * **The Toxic staff of the dead's aura.** The staff does not out-damage the
 * Trident it was made from — it hands the Trident's venom to every other tower
 * standing near it. Anything that fires from inside the staff's range envenoms
 * what it hits: the archer's volley, the cannon's splash, a barrage, the staff
 * itself. A fang can only ever ramp venom on whatever one enemy it happens to
 * be pointed at; the staff spends the whole board's rate of fire on it instead.
 *
 * Two deliberate constraints keep that from being a free upgrade. The step is a
 * fraction ({@link ENVENOM_AURA_FRAC}) of one Toxic ramp step, so a covered
 * board is slower onto a full stack than a fang firing into one target. And it
 * is computed from the *staff's* damage, never the firing tower's, so a fast
 * weak tower and a slow heavy one arm exactly the same venom — the aura is a
 * property of where the staff stands, not of what it happens to cover.
 *
 * The ceiling is the fang's own, so the aura tops a stack up and never past it.
 */
export const ENVENOM_AURA_FRAC = 0.5;

export interface EnvenomAura {
  /** Venom dps one covered hit adds. */
  step: number;
  /** The most that venom may be raised to — a Toxic tower's own ceiling. */
  cap: number;
  /** Seconds the venom is refreshed to. */
  dur: number;
}

export function envenomAura(staffDamage: number, wave: number): EnvenomAura {
  const { step, cap, dur } = venomRamp(staffDamage, wave);
  return { step: Math.max(1, Math.round(step * ENVENOM_AURA_FRAC)), cap, dur };
}

/** The least a tower has to look like to be tested as an aura source. */
export interface AuraSource {
  id: string;
  type: string;
  x: number;
  y: number;
  range: number;
  damage: number;
  disabledTimer?: number;
}

/**
 * The Toxic staff of the dead covering `at`, or null. The strongest one wins
 * where two overlap, so a second staff can only ever improve a field.
 *
 * A staff covers itself — which is why the weapon carries no venom special of
 * its own: its shots are envenomed by exactly the rule everyone else's are, and
 * there is only ever one number to reason about. A staff knocked offline covers
 * nothing, so the field goes out with the tower rather than outliving it.
 */
export function envenomStaffFor<T extends AuraSource>(
  at: { x: number; y: number },
  towers: readonly T[],
): T | null {
  let best: T | null = null;
  for (const t of towers) {
    if (t.type !== 'toxic_staff_of_the_dead') continue;
    if ((t.disabledTimer ?? 0) > 0) continue;
    if (distance(t.x, t.y, at.x, at.y) > t.range) continue;
    if (!best || t.damage > best.damage) best = t;
  }
  return best;
}

/**
 * **The Eclipse atlatl's stack.** The atlatl is the one weapon on the board that
 * gets heavier the longer it works: every dart adds a stack of the eclipse, and
 * the stack count sets both the burn left on the target and how far the *next*
 * dart throws it back down the road. Neither parent can do that — a TzHaar's
 * shove is a flat number fixed by its tier however long it has been swinging,
 * and an archer never shoves at all.
 *
 * The stack lapses a few seconds after the last dart, so an atlatl that switches
 * targets starts again from nothing. That is the whole cost of the weapon: it is
 * a lockdown that has to be paid for with sustained fire on one enemy, not a
 * property the tower owns.
 */
export const ECLIPSE_MAX_STACKS = 5;

/** Seconds an eclipse survives without another dart. Also the burn's duration,
 *  so the burn and the shove ladder always expire together. */
export const ECLIPSE_STACK_SECS = 5;

/** Shove (logic px) one stack is worth. Deliberately the TzHaar's own tier step,
 *  so a full eclipse throws for what a TzHaar would if it had five more tiers. */
export const ECLIPSE_SHOVE_STEP = 14;

/** Burn dps one stack is worth, as a fraction of the dart's damage. */
export const ECLIPSE_BURN_FRAC = 0.08;

/** The stack count after one more dart lands. Clamped, so a held enemy tops out
 *  rather than being thrown further every second for the rest of the wave. */
export function eclipseStacksAfter(current: number | undefined): number {
  return Math.min(ECLIPSE_MAX_STACKS, Math.max(0, Math.floor(current ?? 0)) + 1);
}

/** How far a dart shoves at this stack count, before boss tenacity. */
export function eclipseShove(stacks: number): number {
  return clampStacks(stacks) * ECLIPSE_SHOVE_STEP;
}

/** The burn a dart of `hitDamage` leaves at this stack count. */
export function eclipseBurnDps(hitDamage: number, stacks: number): number {
  return Math.max(1, Math.round(hitDamage * ECLIPSE_BURN_FRAC)) * clampStacks(stacks);
}

function clampStacks(stacks: number): number {
  return Math.max(0, Math.min(ECLIPSE_MAX_STACKS, Math.floor(stacks)));
}

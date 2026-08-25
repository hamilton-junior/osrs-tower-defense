import type { GameEngine } from '../core/engine';
import type { PrayerType } from '../types';
import { PRAYERS, TOWER_PRAYERS } from '../data/prayers';
import { prayerDrainRate, isPrayerUnlocked, prayerMaxForWave } from './prayer';
import { GLOBAL_UPGRADE_DEFS } from './meta-progression';

/** Scales the (deliberately small) pure drain rate up to a per-second cost
 *  that's meaningful against the wave-scaled pool over a wave. */
const DRAIN_SCALE = 6;

/** The Prayer-regen meta upgrade — its maxed value both drives idle recovery and
 *  contributes to the active-drain reduction below. */
const PRAYER_REGEN_DEF = GLOBAL_UPGRADE_DEFS.find(d => d.id === 'prayerRegen');
const PRAYER_REGEN_MAX = PRAYER_REGEN_DEF?.max ?? 1;

/**
 * Active-drain reduction. Prayer Ward ("Vile Vigour") wizards each shave the
 * live drain, and a maxed Prayer-regen upgrade shaves a little more. Tuned so the
 * headline case lands exactly on target: with 5 wizards AND regen maxed, the
 * three strongest prayers drain at HALF their base rate.
 *   base(trio) = 14.4 pts/s → 5·0.08 (towers) + 0.10 (regen) = 0.50 → 7.2 pts/s.
 * Capped at 0.5 so prayers always drain at least half — there is no zero-drain.
 */
const DRAIN_REDUCTION_PER_TOWER = 0.08;
const REGEN_MAX_DRAIN_REDUCTION = 0.10;
const DRAIN_REDUCTION_CAP = 0.5;

/** Hard cap on fielded Prayer Ward wizards. Matches the point where the drain
 *  reduction saturates (5·0.08 + 0.10 = the 0.5 cap), so a 6th ward would do
 *  nothing anyway — the engine refuses to set more than this many to `sanctity`. */
export const MAX_PRAYER_WARDS = 5;
/**
 * Prayer subsystem for the new core: owns the prayer-point pool and the set of
 * active prayers. While praying, points drain (via the tested `prayerDrainRate`)
 * and empty out the pool; idle, they slowly regenerate, and a wave clear tops
 * them back up. The active set feeds straight into the tower-combat pipeline,
 * which already maps each prayer to its per-style damage bonus.
 */
export class PrayerSystem {
  points: number;
  readonly active = new Set<PrayerType>();
  /** Last integer point value pushed to the UI, to throttle per-frame emits. */
  private lastShown: number;
  /** Same, for the finer fraction the gauge reads. */
  private lastFrac: number;

  constructor(private e: GameEngine) {
    this.points = this.max;
    this.lastShown = Math.round(this.points);
    this.lastFrac = this.frac;
  }

  /** Current pool size — scales with the wave (see `prayerMaxForWave`). */
  get max(): number {
    return prayerMaxForWave(this.e.wave);
  }

  /** The pool as a 0..1 share, quantised to half a percent. The UI's gauge runs
   *  off this instead of the rounded point count, so a draining pool slides the
   *  bar instead of stepping it a few percent at a time. */
  get frac(): number {
    const max = this.max;
    return max > 0 ? Math.round((this.points / max) * 200) / 200 : 0;
  }

  private styleOf(id: PrayerType) {
    return TOWER_PRAYERS.find(p => p.id === id)?.style;
  }

  isUnlocked(id: PrayerType): boolean {
    const def = PRAYERS.find(p => p.id === id);
    return !!def && isPrayerUnlocked(def.level, this.e.wave);
  }

  /** Toggle a tower prayer on/off (UI button). One prayer per style at a time. */
  toggle(id: PrayerType) {
    if (!TOWER_PRAYERS.some(p => p.id === id)) return; // not a tower-buffing prayer
    if (this.active.has(id)) {
      this.active.delete(id);
      this.e.playSound('prayer_off');
      this.emitNow();
      return;
    }
    if (!this.isUnlocked(id)) { this.e.notify('Prayer level too low'); return; }
    if (this.points <= 0) { this.e.notify('Out of Prayer points'); return; }
    // OSRS-style exclusivity: enabling a prayer disables others of its style.
    const style = this.styleOf(id);
    for (const a of [...this.active]) {
      if (this.styleOf(a) === style) this.active.delete(a);
    }
    this.active.add(id);
    // Per-prayer activation clip (`prayer_on_<id>` is always registered in
    // sound.ts, unique where OSRS has one, generic vwoom otherwise).
    this.e.playSound(`prayer_on_${id}`);
    this.emitNow();
  }

  /** Count of Prayer Ward ("Vile Vigour") wizards currently fielded. */
  private sanctityTowers(): number {
    let n = 0;
    for (const t of this.e.towers) {
      if (t.type === 'wizard' && t.mageMode === 'utility' && (t.supportSpell ?? 'curse') === 'sanctity') n++;
    }
    return n;
  }

  /**
   * Fraction (0–{@link DRAIN_REDUCTION_CAP}) the active drain is cut by: each
   * Prayer Ward wizard shaves {@link DRAIN_REDUCTION_PER_TOWER}, plus up to
   * {@link REGEN_MAX_DRAIN_REDUCTION} scaled by how far Prayer-regen is bought.
   * At 5 wizards + maxed regen this is exactly 0.5 (drain halved).
   */
  drainReduction(): number {
    const regenRatio = Math.min(1, Math.max(0, this.e.meta.upgrades.prayerRegen / PRAYER_REGEN_MAX));
    const raw = DRAIN_REDUCTION_PER_TOWER * this.sanctityTowers() + REGEN_MAX_DRAIN_REDUCTION * regenRatio;
    return Math.min(DRAIN_REDUCTION_CAP, raw);
  }

  update(dt: number) {
    // Prayers only cost points while a wave is in progress AND at least one
    // tower is actually engaging an enemy (has a target). With nothing to fight
    // — between waves, or before enemies reach range — the drain pauses. Prayer
    // Ward wizards + a maxed Prayer-regen upgrade cut the rate (down to half).
    const anyTowerAttacking = this.e.towers.some(t => t.targetId !== null);
    const draining = this.active.size > 0 && this.e.waveActive && anyTowerAttacking;
    if (draining) {
      const drain = prayerDrainRate(this.active, PRAYERS, 1, 1) * DRAIN_SCALE * (1 - this.drainReduction());
      this.points = Math.max(0, this.points - drain * dt);
      if (this.points <= 0) {
        this.active.clear();
        this.e.bumpCombatEpoch(); // prayers just went dark — tower stats changed
        this.e.notify('Prayer points depleted');
        this.lastShown = 0;
        this.lastFrac = 0;
        return;
      }
    } else if (this.points < this.max) {
      const regen = this.e.meta.upgrades.prayerRegen;
      if (regen > 0) this.points = Math.min(this.max, this.points + regen * dt);
    }
    // Push to the UI only when something it shows changes — the rounded number,
    // or the gauge's half-percent step — so a continuously draining/regenerating
    // pool doesn't trigger a setState every frame.
    if (Math.round(this.points) !== this.lastShown || this.frac !== this.lastFrac) this.emitNow();
  }

  /** Restore a fixed number of points, capped at the pool (e.g. a potion). */
  restore(amount: number) {
    if (amount <= 0 || this.points >= this.max) return;
    this.points = Math.min(this.max, this.points + amount);
    this.emitNow();
  }

  /** Top up prayer points (e.g. as a wave-clear reward). */
  refill() {
    if (this.points === this.max) return;
    this.points = this.max;
    this.emitNow();
  }

  reset() {
    this.points = this.max;
    this.active.clear();
    this.lastShown = this.max;
    this.lastFrac = this.frac;
  }

  /** Restore a saved run's prayer state (see `systems/run-save`). Only prayers the
   *  restored wave has actually unlocked are re-lit, so a save can never leave a
   *  prayer burning that the run cannot afford or has not earned. */
  load(state: { points: number; active: PrayerType[] }) {
    this.active.clear();
    for (const id of state.active) if (this.isUnlocked(id)) this.active.add(id);
    this.points = Math.max(0, Math.min(this.max, state.points));
    this.lastShown = Math.round(this.points);
    this.lastFrac = this.frac;
  }

  private emitNow() {
    this.lastShown = Math.round(this.points);
    this.lastFrac = this.frac;
    this.e.requestEmit();
  }
}

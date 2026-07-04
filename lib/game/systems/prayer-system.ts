import type { GameEngine } from '../core/engine';
import type { PrayerType } from '../types';
import { PRAYERS, TOWER_PRAYERS } from '../data/prayers';
import { prayerDrainRate, isPrayerUnlocked, prayerMaxForWave } from './prayer';
import { GLOBAL_UPGRADE_DEFS, isMaxed } from './meta-progression';

/** Scales the (deliberately small) pure drain rate up to a per-second cost
 *  that's meaningful against the wave-scaled pool over a wave. */
const DRAIN_SCALE = 6;

/** The Prayer-efficiency meta upgrade (drives both the drain multiplier and the
 *  "maxed" half of the zero-drain capstone). */
const PRAYER_EFF_DEF = GLOBAL_UPGRADE_DEFS.find(d => d.id === 'prayerEfficiency');

/**
 * Prayer-Restoration ("Vile Vigour") wizards that, together with a fully-maxed
 * Prayer-efficiency meta upgrade, let prayers run without ever draining. Derived
 * from the break-even at wave 20 — where the three strongest prayers (Piety,
 * Rigour, Augury) all unlock. There the trio drains 14.4 pts/s; the maxed
 * upgrade (−45%) cuts that to ~7.9 pts/s, and each battery restores wave/12 =
 * ~1.67 pts/s, so ⌈7.9 / 1.67⌉ = 5 batteries exactly cover it. Past wave 20 the
 * batteries only scale up, so 5 keeps sustaining the trio for the rest of the run.
 */
const PRAYER_SUSTAIN_TOWERS = 5;
/**
 * Prayer points restored per second while not draining (idle / between waves)
 * are driven by the persistent `prayerRegen` meta-upgrade (0 with no upgrade,
 * up to +1.0/s fully bought — see the Essence Shop / meta-progression catalog).
 */
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

  constructor(private e: GameEngine) {
    this.points = this.max;
    this.lastShown = Math.round(this.points);
  }

  /** Current pool size — scales with the wave (see `prayerMaxForWave`). */
  get max(): number {
    return prayerMaxForWave(this.e.wave);
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

  /** Count of Prayer-Restoration ("Vile Vigour") wizards currently fielded. */
  private sanctityTowers(): number {
    let n = 0;
    for (const t of this.e.towers) {
      if (t.type === 'wizard' && t.mageMode === 'utility' && (t.supportSpell ?? 'curse') === 'sanctity') n++;
    }
    return n;
  }

  /**
   * True when prayers are fully sustained — the ONLY way to reach zero drain:
   * the Prayer-efficiency meta upgrade is maxed AND at least
   * {@link PRAYER_SUSTAIN_TOWERS} Prayer-Restoration wizards are on the field.
   * Short of both, prayers always drain (the maxed upgrade alone only slows it).
   */
  fullySustained(): boolean {
    return !!PRAYER_EFF_DEF
      && isMaxed(PRAYER_EFF_DEF, this.e.meta.upgrades.prayerEfficiency)
      && this.sanctityTowers() >= PRAYER_SUSTAIN_TOWERS;
  }

  update(dt: number) {
    // Prayers only cost points while a wave is in progress AND at least one
    // tower is actually engaging an enemy (has a target). With nothing to fight
    // — between waves, or before enemies reach range — the drain pauses. The
    // maxed-meta + 5-battery capstone stops the drain outright (see fullySustained).
    const anyTowerAttacking = this.e.towers.some(t => t.targetId !== null);
    const draining = this.active.size > 0 && this.e.waveActive && anyTowerAttacking && !this.fullySustained();
    if (draining) {
      const drain = prayerDrainRate(this.active, PRAYERS, this.e.meta.upgrades.prayerEfficiency, 1) * DRAIN_SCALE;
      this.points = Math.max(0, this.points - drain * dt);
      if (this.points <= 0) {
        this.active.clear();
        this.e.notify('Prayer points depleted');
        this.lastShown = 0;
        return;
      }
    } else if (this.points < this.max) {
      const regen = this.e.meta.upgrades.prayerRegen;
      if (regen > 0) this.points = Math.min(this.max, this.points + regen * dt);
    }
    // Push to the UI only when the rounded value changes, so a continuously
    // draining/regenerating pool doesn't trigger a setState every frame.
    if (Math.round(this.points) !== this.lastShown) this.emitNow();
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
  }

  private emitNow() {
    this.lastShown = Math.round(this.points);
    this.e.requestEmit();
  }
}

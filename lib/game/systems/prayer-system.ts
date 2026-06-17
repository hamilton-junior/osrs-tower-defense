import type { GameEngine } from '../core/engine';
import type { PrayerType } from '../types';
import { PRAYERS, TOWER_PRAYERS } from '../data/prayers';
import { prayerDrainRate, isPrayerUnlocked, prayerMaxForWave } from './prayer';

/** Scales the (deliberately small) pure drain rate up to a per-second cost
 *  that's meaningful against the wave-scaled pool over a wave. */
const DRAIN_SCALE = 6;
/** Prayer points restored per second while no prayer is active. */
const IDLE_REGEN = 8;

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
    this.e.playSound('prayer_on');
    this.emitNow();
  }

  update(dt: number) {
    if (this.active.size > 0) {
      const drain = prayerDrainRate(this.active, PRAYERS, 1, 1) * DRAIN_SCALE;
      this.points = Math.max(0, this.points - drain * dt);
      if (this.points <= 0) {
        this.active.clear();
        this.e.notify('Prayer points depleted');
        this.lastShown = 0;
        return;
      }
    } else if (this.points < this.max) {
      this.points = Math.min(this.max, this.points + IDLE_REGEN * dt);
    }
    // Push to the UI only when the rounded value changes, so a continuously
    // draining/regenerating pool doesn't trigger a setState every frame.
    if (Math.round(this.points) !== this.lastShown) this.emitNow();
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

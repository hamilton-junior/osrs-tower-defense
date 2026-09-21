import type { GameEngine } from '../core/engine';
import type { ActivePotion, CombatStyle } from '../types';
import { POTION_BUFFS, POTION_BUFF_DURATION } from '../data/potion-buffs';

/** A cloneable, UI-facing view of one buff that is running right now. */
export interface PotionBuffListing {
  id: ActivePotion['type'];
  name: string;
  desc: string;
  wiki: string;
  /** Combat style this buff boosts; undefined = every style. */
  style?: CombatStyle;
  /** Damage bonus fraction. */
  dmg?: number;
  /** Whole seconds left on the buff. */
  activeSecs: number;
}

/**
 * The timed potion buffs a run is carrying.
 *
 * A buff is a gift: a Distraction & Diversion hands one over and it runs on a
 * clock, boosting a combat style through `calculateTowerStats`. It was once the
 * paid half of a Grand Exchange shop, and the shop is why the timer counts
 * seconds rather than waves — a player could pre-buy and stack before pulling a
 * wave. The shop never got an interface and is gone; what a player earns is
 * kept.
 *
 * The other potions in the game are Herblore's, which the player brews and
 * drinks and which last in waves. They live in `engine.activePotions` and reach
 * the towers through `style-mods`, not through here.
 */
export class PotionBuffSystem {
  /** Timed buffs feeding the tower-combat pipeline. */
  readonly active: ActivePotion[] = [];
  /** Accumulates dt so the countdown re-emits about once a second. */
  private emitClock = 0;

  constructor(private e: GameEngine) {}

  /** Cloneable snapshot of what is running, for the UI's infobox cluster. */
  listing(): PotionBuffListing[] {
    const out: PotionBuffListing[] = [];
    for (const p of this.active) {
      const def = POTION_BUFFS.find(b => b.id === p.type);
      if (!def) continue;
      out.push({
        id: def.id,
        name: def.name,
        desc: def.desc,
        wiki: def.wiki,
        style: def.style,
        dmg: def.dmg,
        activeSecs: Math.ceil(p.timer),
      });
    }
    return out;
  }

  /**
   * Hand a buff over — the payout side of a Distraction & Diversion, where the
   * fruit of a strange plant or the contents of a bird nest is a potion the
   * player never asked for. Granting one that is already running extends it
   * rather than stacking a second copy.
   */
  grant(id: ActivePotion['type']) {
    const def = POTION_BUFFS.find(b => b.id === id);
    if (!def) return;
    const existing = this.active.find(p => p.type === def.id);
    if (existing) existing.timer += POTION_BUFF_DURATION;
    else this.active.push({ type: def.id, timer: POTION_BUFF_DURATION });
    this.e.bumpCombatEpoch(); // a new or extended buff changes tower stats
    this.e.playSound('potion');
    this.e.requestEmit();
  }

  update(dt: number) {
    if (this.active.length === 0) return;
    // Timers only run during a wave (like prayer drain), so a buff granted
    // between waves is still whole when the next wave is pulled.
    if (!this.e.waveActive) return;
    let changed = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.timer -= dt;
      if (p.timer <= 0) { this.active.splice(i, 1); changed = true; }
    }
    if (changed) this.e.bumpCombatEpoch(); // an expired buff changes tower stats
    // Re-emit when a buff expires, and otherwise about once a second so the
    // countdown ticks down without a setState every frame.
    this.emitClock += dt;
    if (changed || this.emitClock >= 1) {
      this.emitClock = 0;
      this.e.requestEmit();
    }
  }

  reset() {
    this.active.length = 0;
    this.emitClock = 0;
  }
}

import type { GameEngine } from '../core/engine';
import type { ActivePotion } from '../types';
import { GE_OFFERS, GE_POTION_DURATION, type GeOffer } from '../data/ge';
import { nextBuyPriceMultiplier } from './economy';

/** A cloneable, UI-facing view of one GE offer with its live price/state. */
export interface GeListing {
  id: ActivePotion['type'];
  name: string;
  desc: string;
  kind: GeOffer['kind'];
  wiki: string;
  /** Current gp price (base × the drifting demand multiplier). */
  price: number;
  /** Remaining seconds on this buff (0 when inactive / not a buff). */
  activeSecs: number;
}

/**
 * Grand Exchange subsystem for the new core: a shop where gold buys consumables
 * that take effect immediately. Combat potions add a timed {@link ActivePotion}
 * that `calculateTowerStats` reads; prayer potions top up the prayer pool.
 * Prices drift wave to wave with demand (see {@link nextBuyPriceMultiplier}).
 */
export class GeSystem {
  /** Timed combat-potion buffs feeding the tower-combat pipeline. */
  readonly active: ActivePotion[] = [];
  /** Per-offer price multiplier, drifting each wave with demand. */
  private readonly mult: Record<string, number> = {};
  /** Units bought of each offer during the current wave (drives the drift). */
  private bought: Record<string, number> = {};
  /** Accumulates dt so the active-buff countdown re-emits ~once per second. */
  private emitClock = 0;

  constructor(private e: GameEngine) {
    for (const o of GE_OFFERS) this.mult[o.id] = 1;
  }

  /** Live gp price of an offer (min 1). */
  priceOf(id: string): number {
    const offer = GE_OFFERS.find(o => o.id === id);
    if (!offer) return 0;
    return Math.max(1, Math.round(offer.baseCost * (this.mult[id] ?? 1)));
  }

  /** Cloneable snapshot of the whole shop for the UI. */
  listing(): GeListing[] {
    return GE_OFFERS.map(o => ({
      id: o.id,
      name: o.name,
      desc: o.desc,
      kind: o.kind,
      wiki: o.wiki,
      price: this.priceOf(o.id),
      activeSecs: Math.ceil(this.active.find(p => p.type === o.id)?.timer ?? 0),
    }));
  }

  /** Buy and immediately consume an offer (UI button). */
  buy(id: string) {
    const offer = GE_OFFERS.find(o => o.id === id);
    if (!offer) return;
    const cost = this.priceOf(id);
    if (this.e.money < cost) { this.e.notify('Not enough gold'); return; }

    if (offer.kind === 'prayer') {
      if (this.e.prayer.points >= this.e.prayer.max) { this.e.notify('Prayer already full'); return; }
      this.e.prayer.restore(offer.restore ?? 0);
    } else {
      const existing = this.active.find(p => p.type === offer.id);
      if (existing) existing.timer += GE_POTION_DURATION; // re-buying extends the buff
      else this.active.push({ type: offer.id, timer: GE_POTION_DURATION });
    }

    this.e.money -= cost;
    this.bought[id] = (this.bought[id] ?? 0) + 1;
    this.e.playSound('potion');
    this.e.requestEmit();
  }

  update(dt: number) {
    if (this.active.length === 0) return;
    let changed = false;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.timer -= dt;
      if (p.timer <= 0) { this.active.splice(i, 1); changed = true; }
    }
    // Re-emit when a buff expires, and otherwise about once a second so the
    // countdown ticks down without a setState every frame.
    this.emitClock += dt;
    if (changed || this.emitClock >= 1) {
      this.emitClock = 0;
      this.e.requestEmit();
    }
  }

  /** Drift prices toward this wave's demand, then reset the demand tally. */
  onWaveCleared() {
    for (const o of GE_OFFERS) {
      this.mult[o.id] = nextBuyPriceMultiplier(this.mult[o.id] ?? 1, this.bought[o.id] ?? 0);
    }
    this.bought = {};
    this.e.requestEmit();
  }

  reset() {
    this.active.length = 0;
    this.bought = {};
    this.emitClock = 0;
    for (const o of GE_OFFERS) this.mult[o.id] = 1;
  }
}

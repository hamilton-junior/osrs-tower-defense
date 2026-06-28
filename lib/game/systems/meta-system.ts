import type { GameEngine } from '../core/engine';
import type { GlobalUpgrades } from '../types';
import {
  GLOBAL_UPGRADE_DEFS,
  DEFAULT_UPGRADES,
  sanitizeUpgrades,
  nextCost,
  isMaxed,
  steppedValue,
  refundValue,
} from './meta-progression';

/** Persisted meta-progression blob (localStorage on the React side). */
export interface MetaSave {
  essence: number;
  upgrades: GlobalUpgrades;
}

/** Loose shape accepted from persistence — `upgrades` is sanitised/clamped, so
 *  it can be anything (a partial, stale, or corrupt blob). */
export interface MetaLoad {
  essence?: number;
  upgrades?: unknown;
}

/**
 * Meta-progression subsystem for the new core: owns the persistent Rune Essence
 * balance and the bought {@link GlobalUpgrades}. Unlike the per-run subsystems,
 * its state survives a {@link GameEngine.restart} — it's the between-run economy.
 * Reward/cost/clamp maths live in the pure `meta-progression` module; this class
 * just holds state and mediates the engine↔UI boundary (notify/emit/sound).
 */
export class MetaSystem {
  essence: number;
  upgrades: GlobalUpgrades;

  constructor(private e: GameEngine, save?: MetaLoad) {
    this.essence = Math.max(0, Math.floor(save?.essence ?? 0));
    this.upgrades = sanitizeUpgrades(save?.upgrades);
  }

  /** Grant essence (e.g. a wave-clear reward); re-emits so the UI updates. */
  award(amount: number) {
    if (amount <= 0) return;
    this.essence += Math.floor(amount);
    this.e.requestEmit();
  }

  /** Buy one step of an upgrade if affordable and not maxed (UI button). */
  buy(id: keyof GlobalUpgrades) {
    const def = GLOBAL_UPGRADE_DEFS.find(d => d.id === id);
    if (!def) return;
    const value = this.upgrades[id];
    if (isMaxed(def, value)) { this.e.notify('Already at maximum'); return; }
    const cost = nextCost(def, value);
    if (this.essence < cost) { this.e.notify('Not enough essence'); return; }
    this.essence -= cost;
    this.upgrades = { ...this.upgrades, [id]: steppedValue(def, value) };
    this.e.playSound('sell'); // OSRS shop chime
    this.e.requestEmit();
  }

  /** Refund every bought upgrade: reset them to baseline and return REFUND_RATE
   *  (90%) of the essence ever spent. The 10% kept is the respec sink. */
  refund() {
    const back = refundValue(this.upgrades);
    if (back <= 0) { this.e.notify('Nothing to refund'); return; }
    this.upgrades = { ...DEFAULT_UPGRADES };
    this.essence += back;
    this.e.playSound('sell'); // OSRS shop chime
    this.e.notify(`Refunded ${back} essence (90%)`);
    this.e.requestEmit();
  }

  /** Set the essence balance outright (debug cheat). */
  setEssence(amount: number) {
    this.essence = Math.max(0, Math.floor(amount) || 0);
    this.e.requestEmit();
  }

  /** Cloneable snapshot for persistence. */
  serialize(): MetaSave {
    return { essence: this.essence, upgrades: { ...this.upgrades } };
  }
}

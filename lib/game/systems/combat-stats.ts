import type { TowerType, CombatStyle, EnemyType } from '../types';

/**
 * Per-run damage accounting for the DPS panel (a damage meter). The engine feeds
 * every dealt hit and every resolved effect through here, tagged with its source
 * tower; this owns the accumulation, splits off the extra damage that nearby
 * Utility damage-auras contributed, and produces a plain, cloneable snapshot the
 * UI renders. Reset each run (like the rest of per-run combat state).
 *
 * It stays decoupled from the content tables: the engine supplies a `resolve`
 * that turns a tower id into a display identity, called on each record so the
 * stored identity tracks upgrades / element swaps and survives the tower being
 * sold (the last-known identity is kept once `resolve` returns null).
 */

/** Where a dealt hit came from, threaded into the engine's `damage()`. */
export type DamageTag = 'direct' | 'splash' | 'burn' | 'poison' | 'venom' | 'chain' | 'road';

export interface DamageSource {
  /** Firing tower; absent for board-wide run FX (bucketed under "Run Effects"). */
  towerId?: string;
  tag: DamageTag;
  /** Only on direct/splash projectile hits: the Utility damage-aura that boosted
   *  this hit, so the extra can be peeled off and credited to those wizards. */
  aura?: AuraAttribution;
  /** Fraction of this hit's raw damage that came from Blood's %-max-HP bonus
   *  (0..1). The hit still lands as a normal direct/splash — this only lets the
   *  meter break the bonus out, since the bonus survives the same multipliers. */
  bloodFrac?: number;
  /** Fraction of this hit's raw damage that the firing tower's *own weapon* added
   *  (0..1) — the Slayer weapon's category bonus, the tier-4 bow's anti-tank nudge
   *  and the tower's signature gear. Same bargain as `bloodFrac`: the bonus rode
   *  in with the shot and through the same multipliers, so its share of what
   *  landed is its share of the raw hit. */
  weaponFrac?: number;
}

export interface AuraAttribution {
  /** Combined aura damage factor (e.g. 0.1 for one L4 aura, ~0.15 for two). */
  factor: number;
  /** Contributing Utility wizards + each one's fraction of the extra (sums to 1). */
  parts: { id: string; share: number }[];
}

/** Synthetic id/type for board-wide run FX not owned by a single tower. */
export const RUN_FX_ID = '__run__';

export interface TowerIdentity {
  type: TowerType | 'run';
  style: CombatStyle | 'run';
  /** Machine sub-bucket for grouping (element / ancient / 'utility'); null if none. */
  subcategory: string | null;
  /** Human label for the sub-bucket ('Fire', 'Ice barrage', 'Prayer Ward'). */
  subLabel: string | null;
  name: string;
  color: string;
  /** The tower's *current* in-game icon URL (spell icon for wizards, tier sprite
   *  otherwise), so the panel shows the same art the board does — not a generic
   *  stand-in. Undefined for run FX. */
  icon?: string;
  /** True for Utility wizards — their recorded damage is the *extra they granted*. */
  isUtility: boolean;
}

/** Per-tower, per-wave effect tallies. All optional; absent = 0. */
export interface EffectStat {
  burnDmg: number;
  poisonDmg: number;
  venomDmg: number;
  stunCount: number;
  stunSeconds: number;
  pushCount: number;
  pushTiles: number;
  slowCount: number;
  /** Enemies marked by an amp/curse (Water / Utility curse) — a count, not damage. */
  ampCount: number;
  splashHits: number;
  lifeStealHeals: number;
  /** Extra damage the Slayer *helmet* granted while on task. Every tower gets it;
   *  `weaponBonusDmg` below is the tower's own weapon instead. */
  taskBonusDmg: number;
  /** Damage the tower's own weapon added over a plain hit: the Slayer weapon's
   *  bonus against a monster category, the tier-4 bow's anti-tank nudge, and the
   *  signature gear it has equipped. */
  weaponBonusDmg: number;
  /** Shots loosed on top of the tower's one attack — the Dark Bow's twin-shot and
   *  the Double Shot transform. The archer's niche is volume, and this is the only
   *  place the panel can show it. */
  extraShots: number;
  /** Shots the Scorching bow landed on a favoured target standing outside its own
   *  range ring — the only visible measure of what the fusion bought. */
  longShots: number;
  /** Enemies a Venator shot tore through on its way down the road, on top of the
   *  one it was aimed at. The bow's whole case for a slot is how much road it
   *  covers, and this is the number that says whether the spot it sits on does. */
  roadHits: number;
  /** Damage a Blood wizard added on top of its spell, as a % of the target's max
   *  HP (capped per hit). The signature reason to run Blood against big enemies. */
  bloodBonusDmg: number;
  /** Damage from chained board FX (ricochet / overkill cleave / kill-streak) —
   *  the Run-Effects damage that isn't a burn/poison/venom tick. */
  chainDmg: number;
  /** Health a Purging staff refused to let an enemy put back on its bar. Never a
   *  hit, but it is damage the board did not have to deal twice. */
  healDenied: number;
}

export interface DpsWaveStat {
  wave: number;
  /** Damage dealt this wave (for Utility rows: the extra granted, not the total). */
  damage: number;
  /** Seconds this tower was engaging an enemy this wave (0 for utility/run rows). */
  combatSeconds: number;
  byEnemy: { type: EnemyType; damage: number }[];
  effects: Partial<EffectStat>;
}

export interface DpsTowerStat extends TowerIdentity {
  id: string;
  perWave: DpsWaveStat[];
}

export interface DpsSnapshot {
  towers: DpsTowerStat[];
  /** Board combat seconds per wave (any tower engaging) — the denominator for
   *  Utility / Run-FX DPS, which have no engagement time of their own. */
  waveCombat: Record<number, number>;
  /** Sorted list of waves that saw any activity. */
  waves: number[];
}

/**
 * Split a dealt hit into the firing tower's own share and the extra a Utility
 * damage-aura added. The aura multiplies damage by (1 + factor), so the extra is
 * the part of `dealt` above `dealt / (1 + factor)`.
 */
export function auraDamageSplit(dealt: number, factor: number): { own: number; extra: number } {
  if (dealt <= 0) return { own: 0, extra: 0 };
  if (factor <= 0) return { own: dealt, extra: 0 };
  const own = dealt / (1 + factor);
  return { own, extra: dealt - own };
}

interface WaveRec {
  damage: number;
  combatSeconds: number;
  byEnemy: Map<EnemyType, number>;
  effects: Partial<EffectStat>;
}

interface TowerRec {
  id: string;
  identity: TowerIdentity;
  waves: Map<number, WaveRec>;
}

export class CombatStatsSystem {
  private towers = new Map<string, TowerRec>();
  private waveCombat = new Map<number, number>();

  constructor(private resolve: (id: string) => TowerIdentity | null) {}

  reset() {
    this.towers.clear();
    this.waveCombat.clear();
  }

  private wave(rec: TowerRec, wave: number): WaveRec {
    let w = rec.waves.get(wave);
    if (!w) { w = { damage: 0, combatSeconds: 0, byEnemy: new Map(), effects: {} }; rec.waves.set(wave, w); }
    return w;
  }

  /** Fetch/create a tower record, refreshing its identity from the live tower. */
  private rec(id: string): TowerRec {
    let r = this.towers.get(id);
    const fresh = this.resolve(id);
    if (!r) {
      r = { id, identity: fresh ?? RUN_FX_IDENTITY, waves: new Map() };
      this.towers.set(id, r);
    } else if (fresh) {
      r.identity = fresh; // track upgrades / element swaps
    }
    return r;
  }

  private credit(id: string, wave: number, enemyType: EnemyType, amount: number) {
    if (amount <= 0) return;
    const w = this.wave(this.rec(id), wave);
    w.damage += amount;
    w.byEnemy.set(enemyType, (w.byEnemy.get(enemyType) ?? 0) + amount);
  }

  /** Record a dealt hit against its source, peeling off any Utility-aura extra. */
  recordDamage(src: DamageSource, wave: number, enemyType: EnemyType, dealt: number) {
    if (dealt <= 0) return;
    const ownerId = src.towerId ?? RUN_FX_ID;
    if (src.aura && src.aura.factor > 0 && src.towerId) {
      const { own, extra } = auraDamageSplit(dealt, src.aura.factor);
      this.credit(ownerId, wave, enemyType, own);
      for (const p of src.aura.parts) this.credit(p.id, wave, enemyType, extra * p.share);
    } else {
      this.credit(ownerId, wave, enemyType, dealt);
    }
  }

  /** Add to a tower's effect tallies for the wave (fields merge additively). */
  recordEffect(towerId: string, wave: number, patch: Partial<EffectStat>) {
    const eff = this.wave(this.rec(towerId), wave).effects as Record<string, number>;
    for (const [k, v] of Object.entries(patch)) {
      if (v) eff[k] = (eff[k] ?? 0) + v;
    }
  }

  /** Seconds a specific tower spent engaging this frame. */
  addCombatTime(towerId: string, wave: number, dt: number) {
    if (dt <= 0) return;
    this.wave(this.rec(towerId), wave).combatSeconds += dt;
  }

  /** Seconds the board as a whole was in combat this frame (any tower engaging). */
  addWaveCombat(wave: number, dt: number) {
    if (dt <= 0) return;
    this.waveCombat.set(wave, (this.waveCombat.get(wave) ?? 0) + dt);
  }

  /** Plain, cloneable view for the UI. */
  snapshot(): DpsSnapshot {
    const towers: DpsTowerStat[] = [];
    const waveSet = new Set<number>();
    for (const rec of this.towers.values()) {
      const perWave: DpsWaveStat[] = [];
      for (const [wave, w] of rec.waves) {
        waveSet.add(wave);
        perWave.push({
          wave,
          damage: w.damage,
          combatSeconds: w.combatSeconds,
          byEnemy: [...w.byEnemy].map(([type, damage]) => ({ type, damage })).sort((a, b) => b.damage - a.damage),
          effects: { ...w.effects },
        });
      }
      perWave.sort((a, b) => a.wave - b.wave);
      towers.push({ id: rec.id, ...rec.identity, perWave });
    }
    for (const w of this.waveCombat.keys()) waveSet.add(w);
    return {
      towers,
      waveCombat: Object.fromEntries(this.waveCombat),
      waves: [...waveSet].sort((a, b) => a - b),
    };
  }
}

const RUN_FX_IDENTITY: TowerIdentity = {
  type: 'run',
  style: 'run',
  subcategory: null,
  subLabel: null,
  name: 'Run Effects',
  color: '#c9a24a',
  isUtility: false,
};

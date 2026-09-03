/**
 * Tower fusion — two finished towers merged into one weapon.
 *
 * The rule is deliberately the same for every fusion, because a player should
 * only ever have to learn it once:
 *
 *   1. **One Combat Achievement** ({@link FUSION_UNLOCK_CA}) unlocks fusing at
 *      all, for the account, forever. There are no per-fusion recipes, no
 *      component drops and no items to collect — the ladder the player already
 *      climbs is the only currency.
 *   2. In the run: two towers of the right **pair**, both at **max tier**,
 *      standing on **adjacent tiles**, and a fusion fee in gold.
 *   3. **One fusion per leg of the road** (reset when the run travels), so the
 *      board can't be collapsed into a wall of fused weapons in a single stop.
 *
 * The cost is structural: two damage sources become one, and a plot is freed.
 * So a fusion must do something no quantity of its parents can — never just
 * "the same, but bigger".
 *
 * Pure and unit-tested; the engine calls {@link checkFusion} and does the
 * mutation itself.
 */
import type { Tower, TowerSkills, TowerType } from '../types';

/** Every fused weapon's type. These join `TowerType`, but they are never sold in
 *  the dock — the only way one reaches the board is {@link checkFusion}. */
export type FusionType = 'scorching_bow' | 'purging_staff' | 'venator_bow' | 'noxious_halberd';

export interface FusionDef {
  /** Also its `TowerType` member and its baked icon slug. */
  type: FusionType;
  /** The OSRS item this is. */
  name: string;
  /** The two tower types that make it, in no particular order. */
  parents: readonly [TowerType, TowerType];
  /** One short plain sentence — what it does that its parents can't. */
  blurb: string;
}

/** The single Combat Achievement that unlocks fusing. Its id is the persisted
 *  key in `osrs_td_achievements`; never rename it in place. */
export const FUSION_UNLOCK_CA = 'the-forge';

/** Gold a fusion costs on top of the two towers it eats. */
export const FUSION_COST = 2000;

export const FUSIONS: readonly FusionDef[] = [
  {
    type: 'scorching_bow',
    name: 'Scorching bow',
    parents: ['archer', 'slayer'],
    blurb: 'Reaches your Slayer task, Superiors and bosses anywhere on the board.',
  },
  {
    type: 'venator_bow',
    name: 'Venator bow',
    parents: ['archer', 'cannon'],
    blurb: 'Tears down the road it fires along, hitting everything standing on it.',
  },
  {
    type: 'noxious_halberd',
    name: 'Noxious halberd',
    parents: ['tzhaar', 'toxic'],
    blurb: 'Swings at everything in reach and spreads the worst venom to all of it.',
  },
  {
    type: 'purging_staff',
    name: 'Purging staff',
    parents: ['wizard', 'slayer'],
    blurb: 'Hits harder the closer the enemy is to death, and stops it healing.',
  },
];

/** What a Purging staff hits for on a target that has nothing left: a target at
 *  full health takes the printed damage, and the curve runs straight between. */
export const PURGE_MAX_MULT = 2;

/**
 * The execute curve. Deliberately linear in *missing* health rather than
 * remaining, so the weapon reads the way the bar looks: half a bar gone is half
 * the bonus. It is worse than either parent against a fresh enemy and better
 * than both against a dying one — the whole trade the fusion makes.
 */
export function purgeDamageMult(hp: number, maxHp: number): number {
  if (!(maxHp > 0)) return 1;
  const missing = Math.min(1, Math.max(0, 1 - hp / maxHp));
  return 1 + (PURGE_MAX_MULT - 1) * missing;
}

/** How long one purging hit keeps its target from healing. Long enough to cover a
 *  boss's heal tick, short enough that the staff has to keep firing to hold it. */
export const PURGE_DENY_SECS = 5;

/** Whether nothing may heal this enemy right now. Every heal in the game asks
 *  this (through `healEnemy`), which is what makes the effect worth a fusion:
 *  boss self-heals, Jad's Yt-HurKot, Scurrius's rats, the Corporeal Beast's
 *  siphon and the Regenerating affix all stop at once. */
export function healingDenied(e: { purgedTimer?: number }): boolean {
  return (e.purgedTimer ?? 0) > 0;
}

/** Fused weapons that cast instead of shooting, and the baked spell whose voice,
 *  flight GFX and impact they borrow (`<tier>_<level>`, as the spotanim and sound
 *  tables are keyed). A staff has to sound and land like a staff, and the cache
 *  already holds the spell — nothing new is baked for a fusion. */
const FUSION_SPELL_FX: Partial<Record<FusionType, string>> = {
  purging_staff: 'shadow_4',
};

export function fusionSpellFx(type: string): string | null {
  return isFusion(type) ? FUSION_SPELL_FX[type] ?? null : null;
}

const BY_TYPE = new Map<string, FusionDef>(FUSIONS.map((f) => [f.type, f]));

/** Whether a tower type is a fused weapon (and so has no tier ladder of its own). */
export function isFusion(type: string): type is FusionType {
  return BY_TYPE.has(type);
}

export function fusionDef(type: string): FusionDef | null {
  return BY_TYPE.get(type) ?? null;
}

/** The weapon these two tower types make, if any. Order-independent. */
export function fusionFor(a: TowerType, b: TowerType): FusionDef | null {
  if (a === b) return null;
  return FUSIONS.find((f) => f.parents.includes(a) && f.parents.includes(b)) ?? null;
}

/** A tower that has nothing left to upgrade — the entry price for fusing. A fused
 *  weapon is excluded: it is `level 1 of 1`, which would otherwise read as maxed. */
export function isFusionReady(t: Pick<Tower, 'type' | 'level' | 'maxLevel'>): boolean {
  return !isFusion(t.type) && t.level >= t.maxLevel;
}

/** Tile-adjacent, including diagonals — but never the same tile. Tower placement
 *  snaps to tile centres, so the tolerance only absorbs float noise. */
export function areAdjacent(
  a: { x: number; y: number },
  b: { x: number; y: number },
  grid: number,
): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx < grid * 0.5 && dy < grid * 0.5) return false; // the same tile
  return dx <= grid * 1.5 && dy <= grid * 1.5;
}

/** Why a fusion the player can see is not available yet. */
export type FusionBlock = 'pair' | 'tier' | 'adjacent' | 'locked' | 'leg' | 'gold';

/** One short plain sentence per block, shown on the panel and in a notification. */
export const FUSION_BLOCK_TEXT: Record<FusionBlock, string> = {
  pair: 'These two towers make nothing.',
  tier: 'Both towers must be fully upgraded.',
  adjacent: 'The two towers must stand side by side.',
  locked: 'Complete The Forge to unlock fusing.',
  leg: 'Already fused here — travel on for another.',
  gold: 'Not enough gold.',
};

/** How close a blocked offer is to being fusable, so the panel can lead with the
 *  near miss instead of an arbitrary one. Mirrors the order of `checkFusion`. */
const BLOCK_PROGRESS: Record<FusionBlock, number> = {
  pair: 0, tier: 1, adjacent: 2, locked: 3, leg: 4, gold: 5,
};

export type FusionCheck =
  | { ok: true; def: FusionDef; cost: number }
  | { ok: false; def: FusionDef | null; reason: FusionBlock };

export interface FusionContext {
  /** Board tile size (engine `GRID`). */
  grid: number;
  money: number;
  /** The account's cleared Combat Achievements. */
  completed: ReadonlySet<string>;
  /** Whether this leg of the road has already had its one fusion. */
  fusedThisLeg: boolean;
  cost?: number;
}

/**
 * The whole gate, in the order the player should be told about it: what these
 * two towers *would* make first, then what is standing in the way.
 */
export function checkFusion(a: Tower, b: Tower, ctx: FusionContext): FusionCheck {
  const def = a.id === b.id ? null : fusionFor(a.type, b.type);
  if (!def) return { ok: false, def: null, reason: 'pair' };
  if (!isFusionReady(a) || !isFusionReady(b)) return { ok: false, def, reason: 'tier' };
  if (!areAdjacent(a, b, ctx.grid)) return { ok: false, def, reason: 'adjacent' };
  if (!ctx.completed.has(FUSION_UNLOCK_CA)) return { ok: false, def, reason: 'locked' };
  if (ctx.fusedThisLeg) return { ok: false, def, reason: 'leg' };
  const cost = ctx.cost ?? FUSION_COST;
  if (ctx.money < cost) return { ok: false, def, reason: 'gold' };
  return { ok: true, def, cost };
}

export interface FusionOffer {
  partnerId: string;
  def: FusionDef;
  cost: number;
  ok: boolean;
  reason?: FusionBlock;
}

/**
 * Every fusion `tower` could take part in, one per neighbour that makes a
 * weapon with it. Blocked offers are returned too (with their `reason`) so the
 * panel can say *why* — a fusion the player can't see is a fusion they never
 * learn about. Only pairs that actually make something are listed: an unrelated
 * neighbour is not a near miss.
 */
export function fusionOffersFor(
  tower: Tower,
  towers: readonly Tower[],
  ctx: FusionContext,
): FusionOffer[] {
  const out: FusionOffer[] = [];
  for (const other of towers) {
    if (other.id === tower.id) continue;
    if (!fusionFor(tower.type, other.type)) continue;
    const res = checkFusion(tower, other, ctx);
    if (!res.def) continue;
    out.push(res.ok
      ? { partnerId: other.id, def: res.def, cost: res.cost, ok: true }
      : { partnerId: other.id, def: res.def, cost: ctx.cost ?? FUSION_COST, ok: false, reason: res.reason });
  }
  // Ready ones first, then the nearest miss, then by partner so the list doesn't
  // reshuffle under the cursor.
  const rank = (o: FusionOffer) => (o.ok ? 99 : BLOCK_PROGRESS[o.reason!]);
  return out.sort((x, y) => rank(y) - rank(x) || x.partnerId.localeCompare(y.partnerId));
}

/**
 * The skills the fused weapon carries: the better of its two parents in each,
 * so fusing never walks a tower's combat level backwards. XP decides — level is
 * derived from it everywhere else.
 */
export function mergeSkills(a: TowerSkills, b: TowerSkills): TowerSkills {
  const best = (x: { level: number; xp: number }, y: { level: number; xp: number }) =>
    (y.xp > x.xp ? { ...y } : { ...x });
  return {
    strength: best(a.strength, b.strength),
    ranged: best(a.ranged, b.ranged),
    magic: best(a.magic, b.magic),
  };
}

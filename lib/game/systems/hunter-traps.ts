/**
 * **Hunter** — the run's own skill, and the rules for what it lets you lay.
 *
 * Everything here is pure: the engine owns the gold, the road, the enemies and the
 * UI, and asks this module what is allowed, what it costs and what it does. That is
 * the same split road shaping uses, for the same reason — the interesting part of a
 * trap is its arithmetic, and arithmetic is the part worth testing.
 *
 * Three rules shape the whole system:
 *
 * 1. **A trap only goes on the road.** It is the one place a tower can never be, so
 *    traps compete with nothing, and shaping the road is what decides where they can
 *    go. They never block passage — enemies walk over them.
 * 2. **How many you can have out is a Hunter level, not a purse.** OSRS's own table:
 *    one trap to start, and another at 20, 40, 60 and 80.
 * 3. **The skill levels by catching.** The XP per catch starts from the real OSRS
 *    figure and pays a third more on top ({@link trapXp}); the level curve is not
 *    OSRS's, because OSRS wants 814k XP for level 71 and a run is ninety waves long.
 *    See {@link hunterXpForLevel}.
 */

import type { Point } from '../types';
import { HUNTER_TRAPS, HUNTER_TRAP_BY_ID, type HunterTrapDef, type HunterTrapId } from '../data/hunter-traps';
import { pointToSegmentDistance, snapToTileCenter } from './geometry';
import { hpScaleForWave } from './enemy-scaling';

/** The skill's ceiling, like every other skill in the game. Nothing unlocks above
 *  80 (the fifth trap); the rest is the same long tail OSRS has. */
export const HUNTER_MAX_LEVEL = 99;

/** How close an enemy's centre has to come to a trap for it to go off, in px.
 *  Half a tile: the enemy has to actually tread on the thing. Measured against the
 *  line it walked this frame — see {@link trapTriggeredBy}. */
export const TRAP_TRIGGER_RADIUS = 16;

/** Two game ticks between one firing and the next. Without it a single trap with
 *  three charges would spend all three on the same frame, on the same pack. */
export const TRAP_REARM_SECONDS = 1.2;

/** How far a *click* may be from a road segment's centre-line and still count as
 *  aimed at the road, in tiles. The road is one tile wide, so half a tile is its
 *  edge; the rest is slack for a hurried click. */
export const TRAP_ROAD_TOLERANCE = 0.75;

/** Two traps may not sit within a tile of each other — otherwise a stack of five on
 *  one square would make every other stretch of road pointless. */
export const TRAP_SPACING_TILES = 1;

/** A trap on the board. The definition is looked up by `defId`; this is only what
 *  changes about one. */
export interface HunterTrap {
  id: string;
  defId: HunterTrapId;
  x: number;
  y: number;
  /** Firings left. At zero the trap is spent and leaves its slot. */
  charges: number;
  /** Seconds until it can fire again. */
  rearm: number;
  /** `snare` only: the enemies this trap has gripped before. It may grip one of
   *  them again once it is free, but anything it has not held yet goes first.
   *  See {@link snareTargets}. */
  gripped?: string[];
  /** The gold paid to lay it. A pick-up hands back a share of this. A trap from a
   *  save written before refunds has none. */
  paid?: number;
}

/**
 * XP to advance Hunter from `level` to `level + 1`.
 *
 * Run-scaled, like every other curve in this game. OSRS asks 814k XP for the 71 the
 * magic box needs — thousands of catches, which is a week of play, not a run. This
 * curve asks about 23k in total, which at the real per-catch rates is roughly 140
 * catches: reachable by a player who lays traps every wave, and out of reach for one
 * who lays them occasionally. The floor of 10 is what makes the first handful of
 * levels fall in a few catches, so the second trap slot at 20 arrives early enough
 * to be the thing that teaches the mechanic.
 */
export function hunterXpForLevel(level: number): number {
  return Math.max(10, Math.round(Math.pow(Math.max(1, level), 2.5) / 36));
}

/**
 * How many traps may be out at once — OSRS's own table, unchanged: one, then one
 * more at 20, 40, 60 and 80.
 */
export function maxActiveTraps(level: number): number {
  return Math.min(5, 1 + Math.floor(Math.max(1, level) / 20));
}

/** The traps a given Hunter level may lay, in ladder order. */
export function trapsUnlockedAt(level: number): HunterTrapDef[] {
  return HUNTER_TRAPS.filter(t => t.level <= level);
}

/** Is this trap unlocked at this level? */
export function trapUnlocked(id: HunterTrapId, level: number): boolean {
  return HUNTER_TRAP_BY_ID[id].level <= level;
}

/**
 * What a trap costs right now.
 *
 * The base price is what it is worth on wave one; the surcharge is what keeps it
 * worth thinking about on wave sixty, when gold is plentiful and a board full of
 * free chinchompas would replace the towers rather than support them.
 */
export function trapCost(def: HunterTrapDef, wave: number): number {
  const scaled = def.cost * (1 + Math.max(0, wave - 1) * 0.03);
  return Math.round(scaled / 5) * 5;
}

/**
 * The gold a trap hands back when it is picked up.
 *
 * A share of its price, by the charges it still holds: a three-charge trap lifted
 * with one charge left returns a third. The share comes off what the player paid,
 * not today's price. That price climbs every wave, so a trap laid early and lifted
 * late would otherwise sell for more than it cost. Rounded down for the same reason.
 */
export function trapRefund(paid: number, charges: number, maxCharges: number): number {
  if (maxCharges <= 0 || paid <= 0) return 0;
  const left = Math.min(maxCharges, Math.max(0, Math.floor(charges)));
  return Math.floor((paid * left) / maxCharges);
}

/**
 * Where a trap would land for a click at `(x, y)`, or `null` if that click was not
 * on the road.
 *
 * **It snaps onto the road, not onto the tile grid.** The road's vertices sit on
 * grid *lines* (see `buildPath`) so that tower ranges align with it — which means
 * the walking line runs along a tile *edge*, and a tile centre is always half a tile
 * off it. Snapping to tile centres therefore put every trap beside the road instead
 * of on it: two would fit side by side across one stretch, neither of them under the
 * feet that were supposed to spring it.
 *
 * So the click is projected onto the nearest segment, and only the coordinate that
 * runs *along* that segment is snapped to the tile lattice. The trap ends up exactly
 * on the line the enemies walk, one per tile of road, which is the only arrangement
 * where "it goes off when something treads on it" is true.
 */
export function snapTrapSpot(x: number, y: number, path: readonly Point[], grid: number): Point | null {
  let best = Infinity;
  let seg = -1;
  for (let i = 0; i < path.length - 1; i++) {
    const d = pointToSegmentDistance(x, y, path[i], path[i + 1]);
    if (d < best) { best = d; seg = i; }
    if (best === 0) break;
  }
  if (seg < 0 || best > TRAP_ROAD_TOLERANCE * grid) return null;

  const a = path[seg];
  const b = path[seg + 1];
  // Every leg of the road is axis-aligned, by construction and after every bend the
  // player buys. The diagonal branch is a guard, not a case: it drops the trap on
  // the projection unsnapped rather than off the road.
  if (a.y === b.y) {
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return { x: clamp(snapToTileCenter(x, grid), lo, hi), y: a.y };
  }
  if (a.x === b.x) {
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return { x: a.x, y: clamp(snapToTileCenter(y, grid), lo, hi) };
  }
  return projectOntoSegment(x, y, a, b);
}

/** Is that spot clear of the traps already down? Measured as a radius rather than a
 *  box: traps now sit on the road's line, so what matters is the gap along it. */
export function trapSpotFree(spot: Point, traps: readonly { x: number; y: number }[], grid: number): boolean {
  const min = TRAP_SPACING_TILES * grid;
  return !traps.some(t => Math.hypot(t.x - spot.x, t.y - spot.y) < min);
}

export interface TrapPlacement {
  x: number;
  y: number;
  path: readonly Point[];
  grid: number;
  traps: readonly { x: number; y: number }[];
  slots: number;
  wave: number;
  money: number;
  waveActive: boolean;
  gameOver: boolean;
}

/** A refusal the player can act on, or the spot and the price the trap costs there. */
export type TrapVerdict =
  | { ok: false; why: string }
  | { ok: true; spot: Point; price: number };

/**
 * May that trap go there, and for how much?
 *
 * Every refusal says why: a trap that silently fails to appear reads as a broken
 * button, and the reasons it can fail are all things the player can act on.
 *
 * **The order the reasons are checked in is the rule.** They run cheapest-standing
 * first: what the player must change to fix a refusal grows with each step, so the
 * message they get is always the smallest correction that would work. A full slot
 * bar is reported before the click's position, because no click anywhere would
 * work; the road is reported before the gap to the next trap, because a spot off
 * the road has no neighbour to be too near to; and gold is last, because a player
 * told "not enough gold" has already been told their aim was good.
 */
export function placeTrapVerdict(def: HunterTrapDef, req: TrapPlacement): TrapVerdict {
  if (req.waveActive || req.gameOver) return { ok: false, why: 'Only between waves' };
  if (req.traps.length >= req.slots) return { ok: false, why: 'No trap slots left' };
  const spot = snapTrapSpot(req.x, req.y, req.path, req.grid);
  if (!spot) return { ok: false, why: 'Traps go on the road' };
  if (!trapSpotFree(spot, req.traps, req.grid)) return { ok: false, why: 'Already a trap there' };
  const price = trapCost(def, req.wave);
  if (req.money < price) return { ok: false, why: 'Not enough gold' };
  return { ok: true, spot, price };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function projectOntoSegment(x: number, y: number, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** The trap under a click, if any. Generous by half a tile — a trap is a small
 *  sprite lying on a road tile, and picking it back up has to be easy. */
export function trapAtPoint<T extends { x: number; y: number }>(
  traps: readonly T[],
  x: number,
  y: number,
  grid: number,
): T | null {
  return traps.find(t => Math.hypot(t.x - x, t.y - y) <= grid * 0.6) ?? null;
}

/**
 * Did this enemy just tread on the trap?
 *
 * The test is the **line walked this frame**, not the point the enemy happens to
 * stand on now. Sampling the point misses whenever one step is longer than the
 * trap's 32 px diameter, and the miss looks exactly like a trap ignoring what
 * crossed it. Fast-forward never produces such a step — the engine sub-steps it,
 * running the sim `gameSpeed` times at the real per-step dt — but the top of the
 * speed ladder on a struggling frame rate does: 480 px/s against the 0.1 s dt clamp
 * is 48 px in one step. Measuring the segment makes the trigger independent of both
 * frame rate and game speed, which is the only version of "it goes off when
 * something treads on it" a player can rely on.
 *
 * `prevX`/`prevY` are absent for anything that has not moved yet, and then the
 * segment is a point and this is the old test exactly.
 */
export function trapTriggeredBy(
  trap: { x: number; y: number; rearm: number; charges: number },
  enemy: { x: number; y: number; prevX?: number; prevY?: number },
): boolean {
  if (trap.charges <= 0 || trap.rearm > 0) return false;
  const from = { x: enemy.prevX ?? enemy.x, y: enemy.prevY ?? enemy.y };
  const to = { x: enemy.x, y: enemy.y };
  return pointToSegmentDistance(trap.x, trap.y, from, to) <= TRAP_TRIGGER_RADIUS;
}

/**
 * Everything a snare grips this frame.
 *
 * A snare is a rope on the ground, not a gun. What it does is hold whatever is
 * standing in it, so the thing it caught is still standing on it while the hold
 * lasts, and gripping it again then would spend a charge on a hold it already has.
 * So the snare passes over anything still held, by this rope or by anything else.
 * Once that enemy is free, a snare it is still standing in may take it again.
 *
 * The same pass takes every enemy standing on it, up to the charges left, so one
 * trap holds a whole group at once. When the rope has fewer charges than takers,
 * the ones it has never held go first. A snare that kept re-gripping its first
 * catch would spend every charge on that one enemy while the rest walked past.
 */
export function snareTargets<T extends {
  id: string; x: number; y: number; prevX?: number; prevY?: number; spawnAnim?: number; stunTimer?: number;
}>(
  trap: { x: number; y: number; rearm: number; charges: number; gripped?: readonly string[] },
  enemies: readonly T[],
): T[] {
  if (trap.charges <= 0) return [];
  const fresh: T[] = [];
  const again: T[] = [];
  for (const e of enemies) {
    if ((e.spawnAnim ?? 0) > 0) continue;
    if ((e.stunTimer ?? 0) > 0) continue;
    if (!trapTriggeredBy(trap, e)) continue;
    (trap.gripped?.includes(e.id) ? again : fresh).push(e);
  }
  return [...fresh, ...again].slice(0, trap.charges);
}

/**
 * Can this one be taken?
 *
 * A box trap is a finisher, not an answer: it takes what is already nearly dead, and
 * it never takes a boss. Without the wound threshold a 150 gp box would delete a
 * full-health wave-eighty enemy, which is not a trap — that is a delete button.
 */
/** How much likelier a caught creature is to leave gear behind than a killed one.
 *  Taking something alive is the whole point of a box trap, and only a wounded,
 *  non-boss enemy can be taken — so this doubles two thin lines (2% ammo, 1%
 *  jewellery) and never touches a boss's signature drop. */
export const CATCH_DROP_LUCK = 2;

export function canCatch(
  def: HunterTrapDef,
  enemy: { hp: number; maxHp: number; isBoss?: boolean },
): boolean {
  if (def.kind !== 'catch') return false;
  if (enemy.isBoss) return false;
  if (enemy.maxHp <= 0) return false;
  return enemy.hp / enemy.maxHp <= def.catchAt;
}

/**
 * What a chinchompa does to one thing standing in the blast.
 *
 * Part flat, part share of the target's own max HP, so it stays worth laying at wave
 * eighty without ever being the thing that kills the wave — the cap is what stops the
 * %-share from turning into an execute on a big enemy. Bosses take a quarter: they
 * are the fight, and a 380 gp item does not get to be a boss phase.
 *
 * The cap is a **shape** guard, not a damage ceiling, so it moves with the board:
 * see {@link blastCapMult}. Written as a fixed 1800 it stopped binding on anything
 * around wave 20 and then became the binding constraint on everything past ~70,
 * which is a max hit that dies of old age — the player reads a chinchompa as a
 * wasted 380 gp long before the run is over.
 */
export interface BlastProfile {
  /** Damage every target takes regardless of size. */
  flat: number;
  /** Extra damage, as a share of the target's own max HP. */
  share: number;
  /** The most one target can take — the trap's max hit. */
  cap: number;
  /** What a boss takes, as a share of the above. */
  bossShare: number;
}

/** The wave the flat cap below was tuned against, and the anchor
 *  {@link blastCapMult} measures every later wave from. */
export const BLAST_CAP_REF_WAVE = 20;

/**
 * How much the max hit grows by `wave`.
 *
 * It rides the *enemy* HP curve rather than a curve of its own, so the cap binds at
 * the same relative fatness on every wave: whatever fraction of the board it capped
 * at wave twenty, it caps at wave ninety. Never below 1 — the early game keeps the
 * flat number, so a chinchompa laid on wave five is exactly what the panel says.
 */
export function blastCapMult(wave: number): number {
  const w = Math.max(1, Math.floor(wave));
  return Math.max(1, hpScaleForWave(w) / hpScaleForWave(BLAST_CAP_REF_WAVE));
}

/**
 * The numbers behind a chinchompa's blast, so the hover panel can state them
 * without inventing a target to measure against. `wave` only moves the cap.
 */
export function blastProfile(def: HunterTrapDef, wave = 1): BlastProfile | null {
  if (def.kind !== 'blast') return null;
  const heavy = def.id === 'red_chinchompa';
  return {
    flat: heavy ? 70 : 40,
    share: heavy ? 0.14 : 0.08,
    cap: Math.round((heavy ? 1800 : 900) * blastCapMult(wave)),
    bossShare: 0.25,
  };
}

export function chinBlastDamage(
  def: HunterTrapDef,
  target: { maxHp: number; isBoss?: boolean },
  wave = 1,
): number {
  const p = blastProfile(def, wave);
  if (!p) return 0;
  const raw = Math.min(p.cap, p.flat + target.maxHp * p.share);
  return Math.max(1, Math.round(raw * (target.isBoss ? p.bossShare : 1)));
}

/** Everything inside a blast. Pure so the radius is testable without a board. */
export function enemiesInBlast<T extends { x: number; y: number }>(
  def: HunterTrapDef,
  trap: { x: number; y: number },
  enemies: readonly T[],
): T[] {
  if (def.kind !== 'blast') return [];
  return enemies.filter(e => Math.hypot(e.x - trap.x, e.y - trap.y) <= def.radius);
}

/** A catch is worth more than a kill — that is the whole of Hunter. The bonus is
 *  paid on top of the gold the kill already pays. */
export function catchBonusGold(def: HunterTrapDef, killGold: number): number {
  if (def.kind !== 'catch') return 0;
  return Math.round(killGold);
}

/** How much richer a firing is than the OSRS figure it starts from. The real
 *  numbers levelled the skill too slowly for a run to reach its later traps. */
export const HUNTER_XP_MULT = 1.33;

/** The Hunter XP one firing of this trap pays: its real OSRS XP, a third richer.
 *  The data table keeps the real figure; this is the one place it is scaled. */
export function trapXp(def: HunterTrapDef): number {
  return Math.round(def.xp * HUNTER_XP_MULT);
}

export interface HunterGain {
  level: number;
  xp: number;
  /** How many levels this gain crossed — the engine turns any number above zero
   *  into one level-up notice. */
  levels: number;
}

/**
 * Bank a catch's XP, crossing as many thresholds as it reaches.
 *
 * Multi-level on purpose, unlike a tower's single-step gain: the first levels cost
 * ten XP each and one bird snare pays forty-five, so a single-step version would
 * silently throw most of the first catch away.
 */
export function gainHunterXp(level: number, xp: number, gain: number): HunterGain {
  let lv = Math.min(HUNTER_MAX_LEVEL, Math.max(1, Math.floor(level)));
  let bank = Math.max(0, xp) + Math.max(0, gain);
  let crossed = 0;
  while (lv < HUNTER_MAX_LEVEL) {
    const need = hunterXpForLevel(lv);
    if (bank < need) break;
    bank -= need;
    lv++;
    crossed++;
  }
  if (lv >= HUNTER_MAX_LEVEL) bank = 0; // nothing left to spend it on
  return { level: lv, xp: bank, levels: crossed };
}

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
 * 3. **The skill levels by catching.** The XP per catch is the real OSRS figure; the
 *    level curve is not, because OSRS wants 814k XP for level 71 and a run is ninety
 *    waves long. See {@link hunterXpForLevel}.
 */

import type { Point } from '../types';
import { HUNTER_TRAPS, HUNTER_TRAP_BY_ID, type HunterTrapDef, type HunterTrapId } from '../data/hunter-traps';
import { pointToSegmentDistance, snapToTileCenter } from './geometry';

/** The skill's ceiling, like every other skill in the game. Nothing unlocks above
 *  80 (the fifth trap); the rest is the same long tail OSRS has. */
export const HUNTER_MAX_LEVEL = 99;

/** How close an enemy's centre has to come to a trap for it to go off, in px.
 *  Half a tile: the enemy has to actually tread on the thing. */
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

/** Did this enemy just tread on the trap? */
export function trapTriggeredBy(
  trap: { x: number; y: number; rearm: number; charges: number },
  enemy: { x: number; y: number },
): boolean {
  if (trap.charges <= 0 || trap.rearm > 0) return false;
  return Math.hypot(trap.x - enemy.x, trap.y - enemy.y) <= TRAP_TRIGGER_RADIUS;
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
 * are the fight, and a 240 gp item does not get to be a boss phase.
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

/**
 * The numbers behind a chinchompa's blast, so the hover panel can state them
 * without inventing a target to measure against.
 */
export function blastProfile(def: HunterTrapDef): BlastProfile | null {
  if (def.kind !== 'blast') return null;
  const heavy = def.id === 'red_chinchompa';
  return {
    flat: heavy ? 70 : 40,
    share: heavy ? 0.14 : 0.08,
    cap: heavy ? 1800 : 900,
    bossShare: 0.25,
  };
}

export function chinBlastDamage(
  def: HunterTrapDef,
  target: { maxHp: number; isBoss?: boolean },
): number {
  const p = blastProfile(def);
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
 * ten XP each and one bird snare pays thirty-four, so a single-step version would
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

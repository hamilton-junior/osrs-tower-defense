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

/** How far off a road segment's centre-line a trap may be dropped, in tiles.
 *  Beyond this the click was not aimed at the road. */
export const TRAP_ROAD_TOLERANCE = 0.6;

/** Two traps may not share a tile — otherwise a stack of five on one square would
 *  make every other tile of road pointless. */
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
 * The tile a trap would land on for a click at `(x, y)`, or `null` if that click
 * was not on the road.
 *
 * Snapping to the tile centre first and *then* measuring to the road is what makes
 * the whole road clickable rather than just its centre-line: the tolerance is
 * measured from the tile the trap would actually occupy.
 */
export function snapTrapSpot(x: number, y: number, path: readonly Point[], grid: number): Point | null {
  const sx = snapToTileCenter(x, grid);
  const sy = snapToTileCenter(y, grid);
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    best = Math.min(best, pointToSegmentDistance(sx, sy, path[i], path[i + 1]));
    if (best === 0) break;
  }
  return best <= TRAP_ROAD_TOLERANCE * grid ? { x: sx, y: sy } : null;
}

/** Is that tile free of other traps? */
export function trapSpotFree(spot: Point, traps: readonly { x: number; y: number }[], grid: number): boolean {
  const min = TRAP_SPACING_TILES * grid;
  return !traps.some(t => Math.abs(t.x - spot.x) < min && Math.abs(t.y - spot.y) < min);
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
export function chinBlastDamage(
  def: HunterTrapDef,
  target: { maxHp: number; isBoss?: boolean },
): number {
  if (def.kind !== 'blast') return 0;
  const heavy = def.id === 'red_chinchompa';
  const flat = heavy ? 70 : 40;
  const share = heavy ? 0.14 : 0.08;
  const cap = heavy ? 1800 : 900;
  const raw = Math.min(cap, flat + target.maxHp * share);
  return Math.max(1, Math.round(raw * (target.isBoss ? 0.25 : 1)));
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

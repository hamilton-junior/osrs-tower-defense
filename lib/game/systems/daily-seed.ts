/**
 * The daily challenge's day and its seed.
 *
 * One map, one boss order, one wave roster per calendar day, the same for every
 * run you start that day. The day is UTC so a player never gets two different
 * challenges by flying somewhere, and never loses one by staying up late.
 *
 * Pure: the key is a string, the seed is a number derived from it, and nothing
 * here reads the clock unless asked to.
 */

/** `2026-09-18` — a UTC calendar day, the id of one daily challenge. */
export type DayKey = string;

const DAY_MS = 86_400_000;

/** The UTC day `now` falls on, as `YYYY-MM-DD`. */
export function dailyKey(now: Date = new Date()): DayKey {
  return now.toISOString().slice(0, 10);
}

/** The day `n` days before `key` (negative walks forward). */
export function shiftKey(key: DayKey, n: number): DayKey {
  return dailyKey(new Date(Date.parse(`${key}T00:00:00Z`) - n * DAY_MS));
}

/** How many days lie between two keys — positive when `a` is the later day. */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
}

/** Whether a string is a day key this module would have produced. */
export function isDayKey(v: unknown): v is DayKey {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/**
 * The map seed for a day, as an unsigned 32-bit number (FNV-1a over the key).
 *
 * Adjacent days must not produce adjacent seeds: the map generator's first few
 * draws come straight off the seed, so `+1` a day would walk the same road a
 * step at a time and every challenge would feel like yesterday's. A hash
 * scatters them.
 */
export function dailySeed(key: DayKey): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Spelled out rather than taken from `toLocaleString`: the runtime's locale data
 *  decides between `Sep` and `Sept` on its own, and a board row is three letters wide. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-18` → `18 Sep`, for a board row. Year-free: the board only ever
 *  shows the recent stretch, and the year is noise at that width. */
export function dayLabel(key: DayKey): string {
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

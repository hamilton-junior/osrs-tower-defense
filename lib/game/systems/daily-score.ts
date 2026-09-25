/**
 * The daily challenge's scoreboard — local to this browser, and nobody else's.
 *
 * You may replay a day as often as you like; only the day's best run is kept.
 * "Best" is the wave you reached, and the tie-breaks read the way a player would
 * argue them: further first, then with more lives left, then more kills, then
 * faster. Every field is one the run already counts, so nothing here can be
 * farmed on its own.
 *
 * Pure. The board is data the UI persists; this module only shapes it.
 */
import { daysBetween, isDayKey, shiftKey, type DayKey } from './daily-seed';

/** One finished daily run, as the board keeps it. */
export interface DailyScore {
  /** Wave reached — the headline figure. */
  wave: number;
  /** Lives left when the run ended. First tie-break: a clean board beats a scrape. */
  lives: number;
  /** Enemies killed this run. */
  kills: number;
  /** Simulated seconds the run lasted. Lower is better, and it is the last word. */
  seconds: number;
  /** When the run was filed (epoch ms), for "played today". */
  at: number;
}

/** Bump when a field's meaning changes; an older board is dropped, not guessed at. */
export const DAILY_BOARD_VERSION = 1;

/** Every day this browser has a score for. */
export interface DailyBoard {
  version: number;
  days: Record<DayKey, DailyScore>;
}

export const EMPTY_BOARD: DailyBoard = { version: DAILY_BOARD_VERSION, days: {} };

/** Negative when `a` is the better run, positive when `b` is, 0 when identical. */
export function compareDailyScores(a: DailyScore, b: DailyScore): number {
  if (a.wave !== b.wave) return b.wave - a.wave;
  if (a.lives !== b.lives) return b.lives - a.lives;
  if (a.kills !== b.kills) return b.kills - a.kills;
  return a.seconds - b.seconds;
}

/** File a run against a day, keeping whichever run is better. Returns a new board
 *  (and a new `days`) so a React effect watching it actually fires. */
export function recordDaily(board: DailyBoard, key: DayKey, score: DailyScore): DailyBoard {
  const prev = board.days[key];
  if (prev && compareDailyScores(prev, score) <= 0) return board;
  return { version: DAILY_BOARD_VERSION, days: { ...board.days, [key]: score } };
}

/**
 * Consecutive days played, counting back from today.
 *
 * A day that has not ended yet cannot break a streak, so an unplayed today
 * leaves yesterday's streak standing — it is only lost once a whole day goes by
 * with nothing filed.
 */
export function dailyStreak(board: DailyBoard, today: DayKey): number {
  // A key dated after today is a clock that moved, not a day that was played.
  const keys = Object.keys(board.days).filter((k) => isDayKey(k) && daysBetween(today, k) >= 0).sort().reverse();
  const first = keys[0];
  if (!first) return 0;
  // The most recent day on the board is older than yesterday: the streak is over.
  if (daysBetween(today, first) > 1) return 0;
  let streak = 0;
  for (const key of keys) {
    if (daysBetween(first, key) !== streak) break; // a day is missing — stop here
    streak++;
  }
  return streak;
}

/** The scores filed in the last `n` days ending today, newest first. Only days the
 *  board actually has — a caller that wants the gaps too (a seven-day strip) walks
 *  the days itself and looks each one up. */
export function recentDays(board: DailyBoard, today: DayKey, n: number): { key: DayKey; score: DailyScore | null }[] {
  const rows: { key: DayKey; score: DailyScore | null }[] = [];
  for (const key of Object.keys(board.days).filter(isDayKey).sort().reverse()) {
    const back = daysBetween(today, key);
    if (back < 0 || back >= n) continue; // a future day (clock skew) or older than the window
    rows.push({ key, score: board.days[key] });
  }
  return rows;
}

/**
 * The last `n` days ending today, oldest first, **gaps included** — a day nobody
 * played comes back with a null score rather than being left out, so a caller can
 * paint a fixed row of cells straight from this. {@link recentDays} is the other
 * half of the pair: it answers "what was played", this one answers "what did the
 * week look like".
 */
export function dayStrip(board: DailyBoard, today: DayKey, n: number): { key: DayKey; score: DailyScore | null }[] {
  const rows: { key: DayKey; score: DailyScore | null }[] = [];
  for (let back = n - 1; back >= 0; back--) {
    const key = shiftKey(today, back);
    rows.push({ key, score: board.days[key] ?? null });
  }
  return rows;
}

/** What the whole board says about the account, rather than about one day. */
export interface DailyRecords {
  /** Days with a score on them. */
  daysPlayed: number;
  /** Furthest wave reached on any day, 0 with nothing played. */
  bestWave: number;
  /** The day that wave was reached on, or null. Ties go to the earlier day — the
   *  record belongs to whoever set it first. */
  bestDay: DayKey | null;
  /** Longest run of consecutive days ever played, today's streak included. */
  longestStreak: number;
}

/** Read the board's records. Pure, and cheap enough to call per render. */
export function dailyRecords(board: DailyBoard): DailyRecords {
  const keys = Object.keys(board.days).filter(isDayKey).sort();
  let bestWave = 0;
  let bestDay: DayKey | null = null;
  let longestStreak = 0;
  let streak = 0;
  let prev: DayKey | null = null;
  for (const key of keys) {
    const score = board.days[key];
    if (score.wave > bestWave) { bestWave = score.wave; bestDay = key; }
    streak = prev && daysBetween(key, prev) === 1 ? streak + 1 : 1;
    if (streak > longestStreak) longestStreak = streak;
    prev = key;
  }
  return { daysPlayed: keys.length, bestWave, bestDay, longestStreak };
}

function num(v: unknown, min: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min;
}

/** Read a board off disk. A board from another version is dropped whole rather
 *  than half-read; inside a current one, a corrupt day is dropped and the rest
 *  of the history survives. */
export function sanitizeDailyBoard(raw: unknown): DailyBoard {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_BOARD;
  const obj = raw as { version?: unknown; days?: unknown };
  if (obj.version !== DAILY_BOARD_VERSION) return EMPTY_BOARD;
  if (!obj.days || typeof obj.days !== 'object' || Array.isArray(obj.days)) return EMPTY_BOARD;
  const days: Record<DayKey, DailyScore> = {};
  for (const [key, value] of Object.entries(obj.days as Record<string, unknown>)) {
    if (!isDayKey(key) || !value || typeof value !== 'object') continue;
    const s = value as Record<string, unknown>;
    // A run that never reached wave 1 is not a run — that is a half-written entry.
    const wave = num(s.wave, 0);
    if (wave < 1) continue;
    days[key] = { wave, lives: num(s.lives, 0), kills: num(s.kills, 0), seconds: num(s.seconds, 0), at: num(s.at, 0) };
  }
  return { version: DAILY_BOARD_VERSION, days };
}

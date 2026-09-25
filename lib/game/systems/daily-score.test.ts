import { describe, it, expect } from 'vitest';
import {
  DAILY_BOARD_VERSION,
  EMPTY_BOARD,
  compareDailyScores,
  dailyStreak,
  dailyRecords,
  dayStrip,
  recentDays,
  recordDaily,
  sanitizeDailyBoard,
  type DailyBoard,
  type DailyScore,
} from './daily-score';

const score = (over: Partial<DailyScore> = {}): DailyScore => ({
  wave: 20, lives: 5, kills: 300, seconds: 600, at: 1_700_000_000_000, ...over,
});

const board = (days: Record<string, DailyScore>): DailyBoard => ({ version: DAILY_BOARD_VERSION, days });

describe('compareDailyScores', () => {
  it('reads the tie-breaks in order: wave, lives, kills, time', () => {
    expect(compareDailyScores(score({ wave: 21 }), score({ wave: 20 }))).toBeLessThan(0);
    // Same wave, more lives left — the cleaner run wins.
    expect(compareDailyScores(score({ lives: 6 }), score({ lives: 5 }))).toBeLessThan(0);
    expect(compareDailyScores(score({ kills: 301 }), score({ kills: 300 }))).toBeLessThan(0);
    // Everything else equal, the faster run wins — and only here is lower better.
    expect(compareDailyScores(score({ seconds: 500 }), score({ seconds: 600 }))).toBeLessThan(0);
    expect(compareDailyScores(score(), score())).toBe(0);
  });

  // A deeper run with nothing left beats a short one that ended untouched: the
  // wave is the headline and the tie-breaks only ever settle a tie.
  it('never lets a tie-break outrank the wave', () => {
    expect(compareDailyScores(score({ wave: 30, lives: 1, kills: 1, seconds: 9999 }), score({ wave: 29, lives: 10 })))
      .toBeLessThan(0);
  });
});

describe('recordDaily', () => {
  it('keeps the better run of the day', () => {
    const first = recordDaily(EMPTY_BOARD, '2026-09-18', score({ wave: 12 }));
    expect(first.days['2026-09-18'].wave).toBe(12);
    const better = recordDaily(first, '2026-09-18', score({ wave: 18 }));
    expect(better.days['2026-09-18'].wave).toBe(18);
    const worse = recordDaily(better, '2026-09-18', score({ wave: 4 }));
    expect(worse.days['2026-09-18'].wave).toBe(18);
  });

  // The UI persists the board from an effect keyed on it, so a filed run has to
  // arrive as a new object or the best score never reaches localStorage.
  it('returns a new board and a new days map when it files a run', () => {
    const before = recordDaily(EMPTY_BOARD, '2026-09-18', score({ wave: 12 }));
    const after = recordDaily(before, '2026-09-18', score({ wave: 13 }));
    expect(after).not.toBe(before);
    expect(after.days).not.toBe(before.days);
  });

  it('leaves the board alone when the run is not an improvement', () => {
    const before = recordDaily(EMPTY_BOARD, '2026-09-18', score({ wave: 12 }));
    expect(recordDaily(before, '2026-09-18', score({ wave: 12 }))).toBe(before);
  });

  it('files each day separately', () => {
    let b = recordDaily(EMPTY_BOARD, '2026-09-17', score({ wave: 9 }));
    b = recordDaily(b, '2026-09-18', score({ wave: 30 }));
    expect(b.days['2026-09-17'].wave).toBe(9);
    expect(b.days['2026-09-18'].wave).toBe(30);
  });
});

describe('dailyStreak', () => {
  it('counts back from today', () => {
    const b = board({ '2026-09-18': score(), '2026-09-17': score(), '2026-09-16': score() });
    expect(dailyStreak(b, '2026-09-18')).toBe(3);
  });

  // Today is not over, so an unplayed today cannot have broken anything yet.
  it('keeps yesterday\'s streak alive while today is unplayed', () => {
    const b = board({ '2026-09-17': score(), '2026-09-16': score() });
    expect(dailyStreak(b, '2026-09-18')).toBe(2);
  });

  it('breaks once a whole day is missed', () => {
    const b = board({ '2026-09-16': score(), '2026-09-15': score() });
    expect(dailyStreak(b, '2026-09-18')).toBe(0);
  });

  it('stops at the first gap', () => {
    const b = board({ '2026-09-18': score(), '2026-09-17': score(), '2026-09-15': score() });
    expect(dailyStreak(b, '2026-09-18')).toBe(2);
  });

  it('is zero on an empty board', () => {
    expect(dailyStreak(EMPTY_BOARD, '2026-09-18')).toBe(0);
  });

  // A clock set forward and back leaves a day nobody could have played. It is not
  // part of a streak, and it must not hide the days that are.
  it('ignores days dated after today', () => {
    const b = board({ '2026-09-25': score(), '2026-09-18': score(), '2026-09-17': score() });
    expect(dailyStreak(b, '2026-09-18')).toBe(2);
  });
});

describe('recentDays', () => {
  it('returns the window newest first, gaps left out of the rows it has', () => {
    const b = board({ '2026-09-18': score({ wave: 30 }), '2026-09-15': score({ wave: 12 }), '2026-08-01': score() });
    const rows = recentDays(b, '2026-09-18', 7);
    expect(rows.map((r) => r.key)).toEqual(['2026-09-18', '2026-09-15']);
    expect(rows[0].score?.wave).toBe(30);
  });

  it('drops days outside the window, in both directions', () => {
    const b = board({ '2026-09-19': score(), '2026-09-18': score(), '2026-09-11': score() });
    expect(recentDays(b, '2026-09-18', 7).map((r) => r.key)).toEqual(['2026-09-18']);
  });
});

describe('sanitizeDailyBoard', () => {
  it('round-trips a board it wrote', () => {
    const b = recordDaily(EMPTY_BOARD, '2026-09-18', score());
    expect(sanitizeDailyBoard(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it('drops a board from another version rather than half-reading it', () => {
    expect(sanitizeDailyBoard({ version: DAILY_BOARD_VERSION + 1, days: { '2026-09-18': score() } })).toEqual(EMPTY_BOARD);
    expect(sanitizeDailyBoard(null)).toEqual(EMPTY_BOARD);
    expect(sanitizeDailyBoard('nope')).toEqual(EMPTY_BOARD);
    expect(sanitizeDailyBoard([])).toEqual(EMPTY_BOARD);
  });

  // One bad row is a half-written entry, not a reason to throw a month away.
  it('drops a corrupt day and keeps the history around it', () => {
    const raw = {
      version: DAILY_BOARD_VERSION,
      days: {
        '2026-09-18': score({ wave: 30 }),
        '2026-09-17': { wave: 0, lives: 3, kills: 10, seconds: 20, at: 1 },
        'whenever': score(),
        '2026-09-16': { wave: 8, lives: 'three', kills: null, seconds: -5, at: 1 },
      },
    };
    const out = sanitizeDailyBoard(raw);
    expect(Object.keys(out.days).sort()).toEqual(['2026-09-16', '2026-09-18']);
    expect(out.days['2026-09-16']).toEqual({ wave: 8, lives: 0, kills: 0, seconds: 0, at: 1 });
  });
});

describe('dayStrip', () => {
  it('paints a fixed row of days, oldest first, with the gaps in it', () => {
    const board: DailyBoard = { version: DAILY_BOARD_VERSION, days: { '2026-09-18': score({ wave: 30 }), '2026-09-16': score({ wave: 12 }) } };
    const strip = dayStrip(board, '2026-09-18', 4);
    expect(strip.map((r) => r.key)).toEqual(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']);
    expect(strip.map((r) => r.score?.wave ?? null)).toEqual([null, 12, null, 30]);
  });

  it('crosses a month boundary the same as any other day', () => {
    expect(dayStrip(EMPTY_BOARD, '2026-10-01', 3).map((r) => r.key)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });
});

describe('dailyRecords', () => {
  it('reads nothing off an empty board', () => {
    expect(dailyRecords(EMPTY_BOARD)).toEqual({ daysPlayed: 0, bestWave: 0, bestDay: null, longestStreak: 0 });
  });

  it('keeps the best wave and the day it was set on', () => {
    const board: DailyBoard = { version: DAILY_BOARD_VERSION, days: {
      '2026-09-16': score({ wave: 12 }),
      '2026-09-17': score({ wave: 44 }),
      '2026-09-18': score({ wave: 30 }),
    } };
    const rec = dailyRecords(board);
    expect(rec.bestWave).toBe(44);
    expect(rec.bestDay).toBe('2026-09-17');
    expect(rec.daysPlayed).toBe(3);
  });

  // A record belongs to whoever set it first, so a later day that only matches it
  // does not take it over.
  it('gives a tied record to the earlier day', () => {
    const board: DailyBoard = { version: DAILY_BOARD_VERSION, days: {
      '2026-09-16': score({ wave: 20 }),
      '2026-09-18': score({ wave: 20 }),
    } };
    expect(dailyRecords(board).bestDay).toBe('2026-09-16');
  });

  it('measures the longest run of days, not the current one', () => {
    const board: DailyBoard = { version: DAILY_BOARD_VERSION, days: {
      '2026-09-01': score(), '2026-09-02': score(), '2026-09-03': score(), '2026-09-04': score(),
      '2026-09-10': score(),
    } };
    expect(dailyRecords(board).longestStreak).toBe(4);
    expect(dailyStreak(board, '2026-09-10')).toBe(1);
  });

  it('ignores a key that is not a day', () => {
    const board = { version: DAILY_BOARD_VERSION, days: { whenever: score({ wave: 99 }), '2026-09-18': score({ wave: 7 }) } } as unknown as DailyBoard;
    expect(dailyRecords(board)).toEqual({ daysPlayed: 1, bestWave: 7, bestDay: '2026-09-18', longestStreak: 1 });
  });
});

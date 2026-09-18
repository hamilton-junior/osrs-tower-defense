import { describe, it, expect } from 'vitest';
import { dailyKey, dailySeed, dayLabel, daysBetween, isDayKey, shiftKey } from './daily-seed';

describe('dailyKey', () => {
  it('names the UTC day, not the local one', () => {
    // 23:30 in Brasília on the 18th is already the 19th in UTC. Everyone plays the
    // same challenge at the same moment, whatever their clock says.
    expect(dailyKey(new Date('2026-09-19T02:30:00Z'))).toBe('2026-09-19');
    expect(dailyKey(new Date('2026-09-19T00:00:00Z'))).toBe('2026-09-19');
    expect(dailyKey(new Date('2026-09-18T23:59:59Z'))).toBe('2026-09-18');
  });
});

describe('shiftKey / daysBetween', () => {
  it('walks days in both directions', () => {
    expect(shiftKey('2026-09-18', 1)).toBe('2026-09-17');
    expect(shiftKey('2026-09-18', -1)).toBe('2026-09-19');
    expect(shiftKey('2026-09-18', 0)).toBe('2026-09-18');
  });

  it('crosses a month and a year', () => {
    expect(shiftKey('2026-03-01', 1)).toBe('2026-02-28');
    expect(shiftKey('2027-01-01', 1)).toBe('2026-12-31');
    expect(daysBetween('2027-01-01', '2026-12-31')).toBe(1);
  });

  // The board counts streaks in whole days. A DST jump moves the clock but never
  // the UTC day, so this must stay exact across one.
  it('counts whole days across a daylight-saving jump', () => {
    expect(daysBetween('2026-03-30', '2026-03-29')).toBe(1);
    expect(daysBetween('2026-10-26', '2026-10-25')).toBe(1);
    expect(daysBetween('2026-09-18', '2026-09-25')).toBe(-7);
  });
});

describe('isDayKey', () => {
  it('accepts what dailyKey writes and nothing else', () => {
    expect(isDayKey(dailyKey(new Date('2026-09-18T12:00:00Z')))).toBe(true);
    expect(isDayKey('2026-9-8')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('yesterday')).toBe(false);
    expect(isDayKey(20260918)).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });
});

describe('dailySeed', () => {
  it('is stable for a day and unsigned', () => {
    const a = dailySeed('2026-09-18');
    expect(dailySeed('2026-09-18')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(a)).toBe(true);
  });

  // The map generator's first draws come straight off the seed, so neighbouring
  // days must land far apart or every challenge would be yesterday's, nudged.
  it('scatters neighbouring days', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => dailySeed(shiftKey('2026-09-30', i)));
    expect(new Set(seeds).size).toBe(30);
    for (let i = 1; i < seeds.length; i++) {
      expect(Math.abs(seeds[i] - seeds[i - 1])).toBeGreaterThan(1000);
    }
  });
});

describe('dayLabel', () => {
  it('reads as a date, in UTC', () => {
    expect(dayLabel('2026-09-18')).toBe('18 Sep');
    expect(dayLabel('2026-01-01')).toBe('1 Jan');
  });
});

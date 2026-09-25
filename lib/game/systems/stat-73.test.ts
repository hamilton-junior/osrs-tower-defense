import { describe, expect, it } from 'vitest';
import { splitOn73 } from './stat-73';

describe('splitOn73', () => {
  it('finds a stat that reads 73', () => {
    expect(splitOn73('73')).toEqual(['', '73', '']);
  });

  it('finds the 73 among the words around it', () => {
    expect(splitOn73('Wave 73')).toEqual(['Wave ', '73', '']);
    expect(splitOn73('73 gp')).toEqual(['', '73', ' gp']);
    expect(splitOn73('73 days')).toEqual(['', '73', ' days']);
    expect(splitOn73('73%')).toEqual(['', '73', '%']);
  });

  it('finds every 73 on the line', () => {
    expect(splitOn73('73/73')).toEqual(['', '73', '/', '73', '']);
  });

  // In each of these the digits belong to a bigger figure, a time or a suffix.
  it('leaves a figure alone when 73 is only part of it', () => {
    for (const s of ['1,073', '730', '173', '7,300', '73:05', '1:73', '73.5', '0.73', '73M', 'x73', '7 3', '—', '']) {
      expect(splitOn73(s)).toEqual([s]);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { crossedInterval } from './timing';

describe('crossedInterval', () => {
  it('fires on the frame that steps into a multiple-of-interval second', () => {
    // timer 15.05, dt 0.1 -> floor 15 (mult of 15), prev floor 14 -> crossed.
    expect(crossedInterval(15.05, 0.1, 15)).toBe(true);
  });

  it('does not re-fire later in the same second', () => {
    // timer 15.5, prev 15.4 -> both floor to 15 -> no crossing.
    expect(crossedInterval(15.5, 0.1, 15)).toBe(false);
  });

  it('is false on seconds that are not a multiple of the interval', () => {
    expect(crossedInterval(16.02, 0.1, 15)).toBe(false);
  });

  it('handles second 0', () => {
    // 0 is a multiple of every interval; only fires when first stepping to it.
    expect(crossedInterval(0.05, 0.1, 15)).toBe(true);
    expect(crossedInterval(0.5, 0.1, 15)).toBe(false);
  });

  it('still fires when a large dt jumps several seconds into the boundary', () => {
    // timer 25.1, dt 2 -> floor 25 (mult of 25), prev floor 23 -> crossed.
    expect(crossedInterval(25.1, 2, 25)).toBe(true);
  });
});

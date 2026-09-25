import { describe, expect, it } from 'vitest';
import { MIN_FIT, nextFit } from './screen-fit';

describe('nextFit', () => {
  it('keeps full size when the content fits', () => {
    expect(nextFit(1, 1000, 900)).toBe(1);
  });

  it('shrinks to fit a content a little too tall', () => {
    // 1003 px of window at 95% zoom against a 1040 px Play tab.
    const fit = nextFit(1, 1003, 1040);
    expect(fit).toBe(0.96);
    expect(1040 * fit).toBeLessThanOrEqual(1003);
  });

  it('never shrinks under the floor', () => {
    expect(nextFit(1, 300, 1000)).toBe(MIN_FIT);
  });

  it('grows back when the window gets taller', () => {
    expect(nextFit(0.8, 1200, 800)).toBe(1);
  });

  it('holds a one-step rise so rounding cannot make it bounce', () => {
    // At 0.96 the tab measures 985 px, so 1003 px would just allow 0.97.
    expect(nextFit(0.96, 1003, 985)).toBe(0.96);
  });

  it('shrinks at once when the content overflows at the current scale', () => {
    expect(nextFit(0.97, 1003, 1010)).toBeLessThan(0.97);
  });

  it('ignores a measurement taken before layout', () => {
    expect(nextFit(0.9, 0, 500)).toBe(0.9);
    expect(nextFit(0.9, 500, 0)).toBe(0.9);
  });
});

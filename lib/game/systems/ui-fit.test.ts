import { describe, expect, it } from 'vitest';
import { boardHeight, uiScaleCeiling } from './ui-fit';

describe('uiScaleCeiling', () => {
  it('solves the scale at which a row exactly fills its width', () => {
    // Needs 800 px at 100%, has 1000: it fits up to 125%, less the rounding sliver.
    expect(uiScaleCeiling(1, [{ need: 800, have: 1000 }], 0.7, 1.6)).toBe(1.24);
  });

  it('reads the need at the scale it was measured at', () => {
    // 400 px at 50% is 800 px at 100%.
    expect(uiScaleCeiling(0.5, [{ need: 400, have: 1000 }], 0.7, 1.6)).toBe(1.24);
  });

  it('is held by the tightest constraint', () => {
    const width = { need: 600, have: 900 };
    const rail = { need: 400, have: 360 };
    expect(uiScaleCeiling(1, [width, rail], 0.5, 1.6)).toBe(0.89);
  });

  it('stays inside the bounds', () => {
    expect(uiScaleCeiling(1, [{ need: 100, have: 1000 }], 0.7, 1.6)).toBe(1.6);
    expect(uiScaleCeiling(1, [{ need: 5000, have: 1000 }], 0.7, 1.6)).toBe(0.7);
  });

  it('ignores a part that needs nothing', () => {
    expect(uiScaleCeiling(1, [{ need: 0, have: 10 }], 0.7, 1.6)).toBe(1.6);
    expect(uiScaleCeiling(1, [], 0.7, 1.6)).toBe(1.6);
  });
});

describe('boardHeight', () => {
  it('leaves a desktop board alone', () => {
    expect(boardHeight(711)).toBeNull();
    expect(boardHeight(420)).toBeNull();
  });

  it('takes one step for a landscape phone or a narrow window', () => {
    expect(boardHeight(358)).toBe('short'); // 900×600 window
    expect(boardHeight(333)).toBe('short'); // 844×390 phone
  });

  it('takes two for a shorter one', () => {
    expect(boardHeight(304)).toBe('shorter'); // 800×360 phone
    expect(boardHeight(256)).toBe('shorter'); // 667×375 phone
  });
});

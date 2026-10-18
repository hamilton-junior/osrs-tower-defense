import { describe, expect, it } from 'vitest';
import {
  FULL_BAR_MIN_WIDTH, LONG_PRESS_SLOP_PX, STACK_MIN_SPARE_PX, barLayoutFor, handInUse, pressDrifted, tapInHand, tileAt, touchHint, touchWords,
  type HandState,
} from './touch-input';

describe('barLayoutFor', () => {
  it('gives a desktop window wide enough for the row the full bar', () => {
    expect(barLayoutFor({ width: 1600, height: 900, coarse: false })).toBe('full');
    expect(barLayoutFor({ width: FULL_BAR_MIN_WIDTH, height: 1200, coarse: false })).toBe('full');
  });

  it('stands the controls in rails on a phone held sideways', () => {
    expect(barLayoutFor({ width: 844, height: 390, coarse: true })).toBe('compact');
    expect(barLayoutFor({ width: 667, height: 375, coarse: true })).toBe('compact');
    expect(barLayoutFor({ width: 1280, height: 600, coarse: true })).toBe('compact');
  });

  it('stacks them in the bar on a tablet, whose board is held by its width', () => {
    expect(barLayoutFor({ width: 1024, height: 768, coarse: true })).toBe('stacked');
    expect(barLayoutFor({ width: 1366, height: 1024, coarse: true })).toBe('stacked');
    // 16:10, in fullscreen and under the browser's toolbar.
    expect(barLayoutFor({ width: 1280, height: 800, coarse: true })).toBe('stacked');
    expect(barLayoutFor({ width: 1280, height: 720, coarse: true })).toBe('stacked');
  });

  it('gives a window too narrow for the row a compact bar, mouse or not', () => {
    expect(barLayoutFor({ width: FULL_BAR_MIN_WIDTH - 1, height: 500, coarse: false })).toBe('compact');
    expect(barLayoutFor({ width: 900, height: 600, coarse: false })).toBe('stacked');
  });

  it('stacks once the bar has the spare height for a second row', () => {
    // A 900-wide board is 400 tall.
    expect(barLayoutFor({ width: 900, height: 400 + STACK_MIN_SPARE_PX, coarse: true })).toBe('stacked');
    expect(barLayoutFor({ width: 900, height: 400 + STACK_MIN_SPARE_PX - 1, coarse: true })).toBe('compact');
  });
});

describe('tileAt', () => {
  it('names the tile a point falls in', () => {
    expect(tileAt(0, 0, 32)).toEqual({ col: 0, row: 0 });
    expect(tileAt(31.9, 32, 32)).toEqual({ col: 0, row: 1 });
    expect(tileAt(1439, 639, 32)).toEqual({ col: 44, row: 19 });
  });
});

describe('tapInHand', () => {
  const a = { col: 5, row: 7 };
  const b = { col: 6, row: 7 };

  it('only aims on the first tap', () => {
    expect(tapInHand(null, 'archer', a)).toEqual({ act: false, aim: { hand: 'archer', tile: a } });
  });

  it('acts on a second tap on the same tile, and forgets the aim', () => {
    const first = tapInHand(null, 'archer', a);
    expect(tapInHand(first.aim, 'archer', { ...a })).toEqual({ act: true, aim: null });
  });

  it('re-aims when the second tap lands on another tile', () => {
    const first = tapInHand(null, 'archer', a);
    expect(tapInHand(first.aim, 'archer', b)).toEqual({ act: false, aim: { hand: 'archer', tile: b } });
  });

  it('does not act on an aim taken with something else in hand', () => {
    const first = tapInHand(null, 'archer', a);
    expect(tapInHand(first.aim, 'cannon', a)).toEqual({ act: false, aim: { hand: 'cannon', tile: a } });
  });
});

describe('pressDrifted', () => {
  it('lets a finger wobble inside the slop', () => {
    expect(pressDrifted({ x: 10, y: 10 }, { x: 10 + LONG_PRESS_SLOP_PX, y: 10 })).toBe(false);
  });

  it('calls a longer move a drag', () => {
    expect(pressDrifted({ x: 10, y: 10 }, { x: 18, y: 18 })).toBe(true);
  });
});

describe('handInUse', () => {
  const empty: HandState = {
    movingGroupIds: [], pasting: false, queueArmed: false, movingTowerId: null,
    selectedTowerType: null, movingPatchId: null, placingPlot: false, selectedTrapId: null,
  };

  it('is empty when a tap should act at once', () => {
    expect(handInUse(empty)).toBeNull();
  });

  it('names each thing a finger can hold', () => {
    expect(handInUse({ ...empty, selectedTowerType: 'archer' })).toBe('tower:archer');
    expect(handInUse({ ...empty, movingTowerId: 't7' })).toBe('move:t7');
    expect(handInUse({ ...empty, movingGroupIds: ['a', 'b'] })).toBe('group:a,b');
    expect(handInUse({ ...empty, pasting: true })).toBe('paste');
    expect(handInUse({ ...empty, selectedTrapId: 'box' })).toBe('trap:box');
    expect(handInUse({ ...empty, placingPlot: true })).toBe('plot:new');
    expect(handInUse({ ...empty, movingPatchId: 'p2' })).toBe('plot:p2');
  });

  it('reads them in the order a click does', () => {
    // A group move claims the click before a tower type that is still armed.
    expect(handInUse({ ...empty, movingGroupIds: ['a'], selectedTowerType: 'archer' })).toBe('group:a');
    // A tower move outranks the type: the click moves, it does not build.
    expect(handInUse({ ...empty, movingTowerId: 't1', selectedTowerType: 'archer' })).toBe('move:t1');
  });

  it("leaves a painted line waiting for its answer to the line's own panel", () => {
    expect(handInUse({ ...empty, queueArmed: true, selectedTowerType: 'archer' })).toBeNull();
  });
});

describe('touchHint', () => {
  it('says what the second tap does for what is in hand', () => {
    expect(touchHint('tower:archer')).toBe('Tap a tile, then tap it again to build');
    expect(touchHint('tower:wizard')).toBe('Tap a tile, then tap it again to pick its spellbook');
    expect(touchHint('trap:box')).toBe('Tap the road, then tap it again to lay the trap');
    expect(touchHint('group:a,b')).toBe('Tap a tile, then tap it again to set the towers down');
  });
});

describe('touchWords', () => {
  it('turns a click and a hover into a tap, keeping the capital', () => {
    expect(touchWords('Click a tower you built to upgrade it.')).toBe('Tap a tower you built to upgrade it.');
    expect(touchWords('Pick one below, then click the grass.')).toBe('Pick one below, then tap the grass.');
    expect(touchWords('Hover the chip to read it again.')).toBe('Tap the chip to read it again.');
    expect(touchWords('The strip on top shows the next wave. Hover to scout.')).toBe('The strip on top shows the next wave. Tap to scout.');
  });

  it('leaves words that only contain the verbs alone', () => {
    expect(touchWords('Clicker hovercraft')).toBe('Clicker hovercraft');
  });
});

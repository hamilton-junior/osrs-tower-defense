import { describe, expect, it } from 'vitest';
import { PANEL_MARGIN, boundsReady, fitPanelOffset, type PanelBox } from './panel-fit';

/** The board area at 1600x900: the board is 711 px tall and clips what hangs below it. */
const BOARD: PanelBox = { left: 0, top: 0, width: 1600, height: 711 };
/** The prayer bar at its anchor, 16 px above the board's bottom. */
const PRAYERS: PanelBox = { left: 478, top: 632, width: 645, height: 63 };

describe('fitPanelOffset', () => {
  it('leaves a panel that fits where the player put it', () => {
    expect(fitPanelOffset({ x: 0, y: 0 }, PRAYERS, BOARD)).toEqual({ x: 0, y: 0 });
    expect(fitPanelOffset({ x: -200, y: -300 }, PRAYERS, BOARD)).toEqual({ x: -200, y: -300 });
  });

  it('pulls a panel dragged under the board back above its bottom edge', () => {
    const fit = fitPanelOffset({ x: 0, y: 89.6 }, PRAYERS, BOARD);
    expect(PRAYERS.top + fit.y + PRAYERS.height).toBe(BOARD.height - PANEL_MARGIN);
  });

  it('keeps every edge the margin inside the bounds', () => {
    const fit = fitPanelOffset({ x: -5000, y: -5000 }, PRAYERS, BOARD);
    expect(PRAYERS.left + fit.x).toBe(PANEL_MARGIN);
    expect(PRAYERS.top + fit.y).toBe(PANEL_MARGIN);
    const far = fitPanelOffset({ x: 5000, y: 0 }, PRAYERS, BOARD);
    expect(PRAYERS.left + far.x + PRAYERS.width).toBe(BOARD.width - PANEL_MARGIN);
  });

  it('measures from where the bounds sit, not from the window corner', () => {
    const beside: PanelBox = { left: 100, top: 50, width: 400, height: 300 };
    const panel: PanelBox = { left: 120, top: 60, width: 100, height: 100 };
    expect(fitPanelOffset({ x: -500, y: -500 }, panel, beside)).toEqual({ x: -12, y: -2 });
  });

  it('keeps the top-left edge of a panel bigger than its bounds in view', () => {
    const big: PanelBox = { left: 0, top: 0, width: 2000, height: 1000 };
    expect(fitPanelOffset({ x: 300, y: 300 }, big, BOARD)).toEqual({ x: PANEL_MARGIN, y: PANEL_MARGIN });
  });
});

describe('boundsReady', () => {
  it('waits for a box that has been given a size', () => {
    expect(boundsReady(BOARD)).toBe(true);
    // The board on the first render, before the fit effect sizes it.
    expect(boundsReady({ left: 0, top: 0, width: 1600, height: 0 })).toBe(false);
  });
});

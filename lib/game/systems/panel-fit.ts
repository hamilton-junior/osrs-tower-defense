/**
 * Where a draggable panel (components/game/MovablePanel) may sit. A panel is
 * drawn at its anchor plus the offset the player dragged it by; the offset is
 * pulled back so the panel stays inside the box that can show it — its nearest
 * clipping ancestor, cut to the window. All values are client pixels.
 */

export interface PanelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A panel keeps this many px between itself and the edge of what shows it. */
export const PANEL_MARGIN = 8;

/** Whether `bounds` has been laid out: a box with no size yet cannot place anything. */
export function boundsReady(bounds: PanelBox): boolean {
  return bounds.width > 0 && bounds.height > 0;
}

/**
 * The offset nearest `want` that keeps a panel inside `bounds`, `margin` px in
 * from each edge. `base` is the panel's box with no offset: where its anchor puts
 * it. A panel too big for the bounds keeps its top-left edge in view.
 */
export function fitPanelOffset(
  want: { x: number; y: number }, base: PanelBox, bounds: PanelBox, margin = PANEL_MARGIN,
): { x: number; y: number } {
  const minX = bounds.left + margin - base.left;
  const maxX = bounds.left + bounds.width - margin - base.width - base.left;
  const minY = bounds.top + margin - base.top;
  const maxY = bounds.top + bounds.height - margin - base.height - base.top;
  return {
    x: Math.min(Math.max(want.x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(want.y, minY), Math.max(minY, maxY)),
  };
}

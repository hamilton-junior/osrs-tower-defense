import type { GameRenderer } from '../renderer';
import { GRID } from './shared';

/**
 * The road's own handles — the player's half of the map generator, drawn.
 *
 * Between waves the road answers the pointer: the square under it outlines, and
 * clicking picks that one square up. The road then lights where it stands and an arrow
 * appears on each side it could be pulled to, carrying the price and what the pull is
 * worth in tiles of extra walking. Every square the road has already been pulled onto
 * keeps a small handle of its own — press it to fill the notch back in.
 *
 * Nothing here is drawn during a fight: the engine closes road shaping while a wave is
 * running, or while a tower is being placed, carried or pasted, so this layer
 * disappears exactly when the board belongs to something else.
 */
export function drawRoadShaping(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  if (!gr.e.roadShapingOpen) return;

  const armed = gr.e.shapingTile;
  const price = gr.e.roadBendPrice;
  const afford = gr.e.money >= price;
  // Real-world clock, like every other idle animation here: a pulse that froze on
  // pause would read as a broken handle rather than a paused game.
  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);

  // The squares the road was pulled onto, each wearing the handle that takes it back.
  // The one under the pointer opens up so the gesture is discoverable by hovering
  // rather than by reading a tooltip.
  const under = gr.e.roadUndoAt(gr.e.pointer.x, gr.e.pointer.y);
  gr.e.roadNotches.forEach((n, i) => {
    const p = gr.e.notchHandle(n);
    const on = i === under;
    drawUndoHandle(ctx, p.x, p.y, on ? 1 : 0.45 + pulse * 0.15, on);
  });

  // The square under the pointer, outlined: "this is the one that would move". Not
  // drawn over a notch's own handle — there the offer is to fill it in, not to dig
  // again — nor over the armed square, which is already lit below.
  const hover = under < 0 ? gr.e.roadHoverTile() : null;
  if (hover && (!armed || armed.x !== hover.x || armed.y !== hover.y)) {
    tileOutline(ctx, hover.x, hover.y, '#c9a227', 0.3 + pulse * 0.25, 2);
  }

  if (!armed) return;

  // The armed square, lit so it is obvious *what* is about to move — the arrows only
  // say where.
  ctx.save();
  ctx.globalAlpha = 0.3 + pulse * 0.3;
  ctx.fillStyle = '#ffd45e';
  ctx.fillRect(armed.x - GRID / 2 + 2, armed.y - GRID / 2 + 2, GRID - 4, GRID - 4);
  ctx.restore();
  tileOutline(ctx, armed.x, armed.y, '#ffd45e', 0.9, 2.5);
  drawGrip(ctx, armed.x, armed.y, 1);

  // Where the square could be pulled to, one arrow per direction, with the price above
  // the first of them. Unaffordable arrows still draw — the price is the answer to
  // "why can't I?", and hiding it would leave the player clicking a dead handle.
  const opts = gr.e.roadShapeOptions();
  for (const o of opts) {
    drawArrow(ctx, o.x, o.y, o.dir, afford, pulse);
    label(ctx, o.x, o.y + 22, deltaText(o.deltaTiles), deltaColor(o.deltaTiles, afford));
  }
  const head = opts[0];
  if (head) {
    label(ctx, head.x, head.y - 24, `${price} gp`, afford ? '#ffd45e' : '#ff4d4d');
  }
}

/** The square a tile occupies, scored around its edge. */
function tileOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  alpha: number,
  width: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(x - GRID / 2 + 2, y - GRID / 2 + 2, GRID - 4, GRID - 4);
  ctx.restore();
}

/** The grip: a small chiselled stud on the square that is in hand. */
function drawGrip(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#3d3428';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffd45e';
  ctx.stroke();
  ctx.restore();
}

/**
 * The handle on a square the road was pulled onto: the same chiselled stud, scored
 * with a single bar. One notch less, one dig cheaper — the bar is the minus sign.
 */
function drawUndoHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  open: boolean,
) {
  const r = open ? 9 : 7;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = open ? '#3d3428' : '#2a2419';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = open ? '#ffd45e' : '#c9a227';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - r + 3, y);
  ctx.lineTo(x + r - 3, y);
  ctx.stroke();
  ctx.restore();

  if (open) label(ctx, x, y - r - 6, 'fill in', '#d8ccb4');
}

/** A solid triangle pointing the way the road would go, sitting where it would land. */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: 'up' | 'down' | 'left' | 'right',
  afford: boolean,
  pulse: number,
) {
  const ang = dir === 'up' ? -Math.PI / 2 : dir === 'down' ? Math.PI / 2 : dir === 'left' ? Math.PI : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = afford ? 0.7 + pulse * 0.3 : 0.4;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-6, -9);
  ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fillStyle = afford ? '#ffd45e' : '#8a8a8a';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#2a2419';
  ctx.stroke();
  ctx.restore();
}

/** OSRS overhead text: the colour over its own black shadow, centred. */
function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.save();
  ctx.font = "bold 13px 'RuneScape', Arial";
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Tiles of road gained or lost, in the game's own sign convention. */
function deltaText(tiles: number): string {
  if (tiles > 0) return `+${tiles} tiles`;
  if (tiles < 0) return `${String.fromCharCode(0x2212)}${Math.abs(tiles)} tiles`;
  return 'same length';
}

function deltaColor(tiles: number, afford: boolean): string {
  if (!afford) return '#8a8a8a';
  if (tiles > 0) return '#5fdc5f';
  if (tiles < 0) return '#ff4d4d';
  return '#d8ccb4';
}

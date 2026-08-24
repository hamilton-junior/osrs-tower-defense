import type { GameRenderer } from '../renderer';
import { GRID } from './shared';

/**
 * The road's own handles — the player's half of the map generator, drawn.
 *
 * Between waves every stretch of road the player may shove wears a small grip at
 * its middle. Clicking one picks that stretch up: the road under it lights, and an
 * arrow appears on each side it could move to, carrying the price and what the move
 * is worth in tiles of extra walking. Nothing here is drawn during a fight — the
 * engine returns no options while a wave is running, or while a tower is being
 * placed, carried or pasted, so this layer disappears exactly when the board belongs
 * to something else.
 *
 * The figure on the arrow is the whole decision: +2 tiles is a longer walk under
 * fire, 0 re-cuts the board without lengthening it, −2 is the undo.
 */
export function drawRoadShaping(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const opts = gr.e.roadShapeOptions();
  if (opts.length === 0) return;

  const path = gr.e.path;
  const armed = gr.e.shapingLeg;
  const price = gr.e.roadBendPrice;
  const afford = gr.e.money >= price;
  // Real-world clock, like every other idle animation here: a pulse that froze on
  // pause would read as a broken handle rather than a paused game.
  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);

  const legs = [...new Set(opts.map(o => o.seg))];

  // The armed leg, lit along its whole length so it is obvious *what* is about to
  // move — the arrows only say where.
  if (armed !== null && path[armed] && path[armed + 1]) {
    const a = path[armed];
    const b = path[armed + 1];
    ctx.save();
    ctx.strokeStyle = '#ffd45e';
    ctx.globalAlpha = 0.35 + pulse * 0.3;
    ctx.lineWidth = GRID - 6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  // A grip on every movable stretch. The armed one is drawn open, the rest recede
  // so the board does not turn into a field of buttons.
  for (const seg of legs) {
    const a = path[seg];
    const b = path[seg + 1];
    if (!a || !b) continue;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const on = seg === armed;
    const dim = armed !== null && !on;
    drawGrip(ctx, cx, cy, a.y === b.y ? 'v' : 'h', on ? 1 : dim ? 0.25 : 0.55 + pulse * 0.2, on);
  }

  if (armed === null) return;

  // Where the stretch could land, one arrow per direction, with the price on the
  // first of them. Unaffordable arrows still draw — the price is the answer to
  // "why can't I?", and hiding it would leave the player clicking a dead handle.
  const mine = opts.filter(o => o.seg === armed);
  for (const o of mine) {
    drawArrow(ctx, o.x, o.y, o.dir, afford, pulse);
    label(ctx, o.x, o.y + 22, deltaText(o.deltaTiles), deltaColor(o.deltaTiles, afford));
  }
  const head = mine[0];
  if (head) {
    label(ctx, head.x, head.y - 24, `${price} gp`, afford ? '#ffd45e' : '#ff4d4d');
  }
}

/** The grip: a small chiselled stud with the axis it slides along scored across it. */
function drawGrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  axis: 'h' | 'v',
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

  // Two ticks across the stud, pointing the way this stretch can move.
  ctx.strokeStyle = open ? '#ffd45e' : '#c9a227';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (axis === 'h') {
    ctx.moveTo(x - r + 3, y);
    ctx.lineTo(x + r - 3, y);
  } else {
    ctx.moveTo(x, y - r + 3);
    ctx.lineTo(x, y + r - 3);
  }
  ctx.stroke();
  ctx.restore();
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

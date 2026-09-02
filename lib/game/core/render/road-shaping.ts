import type { GameRenderer } from '../renderer';
import { GRID } from './shared';

/**
 * The road's own handles — the player's half of the map generator, drawn.
 *
 * Between waves the road answers the pointer: the square under it outlines, and
 * clicking picks that one square up. The road then lights where it stands and an arrow
 * appears on each side it could be pulled to, carrying its own price and what the pull
 * is worth in tiles of extra walking. Every square the road has already been pulled
 * onto keeps a small handle of its own — pick it up again to pull it a tile further out
 * or to fill a tile back in, as many times as the player likes.
 *
 * Near the start of every straight run the road wears a second kind of handle. That one
 * takes hold of the whole run: it slides bodily across, and the turns at either end grow
 * or shrink to meet it — pushed far enough, a turn is squeezed out altogether and the
 * road comes out straight, so the shape the seed dealt is as editable as the detours dug
 * into it.
 *
 * Nothing here is drawn during a fight: the engine closes road shaping while a wave is
 * running, or while a tower is being placed, carried or pasted, so this layer
 * disappears exactly when the board belongs to something else.
 */
export function drawRoadShaping(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  if (!gr.e.roadShapingOpen) return;

  const armed = gr.e.shapingGrab;
  const price = gr.e.roadBendPrice;
  const afford = gr.e.money >= price;
  // Real-world clock, like every other idle animation here: a pulse that froze on
  // pause would read as a broken handle rather than a paused game.
  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);

  const hover = gr.e.roadHoverGrab();
  const armedLeg = armed && armed.kind === 'leg' ? armed : null;

  // A grip near the start of every straight run — the handle on the road the seed drew.
  // It sits inside the two squares a notch refuses at each end of a run, so the two
  // gestures never want the same click. The run in hand is skipped: it is lit whole
  // below.
  for (const h of gr.e.roadLegHandles()) {
    if (armedLeg && armedLeg.seg === h.seg) continue;
    const span = gr.e.roadLegSpan(h.seg);
    if (!span) continue;
    const on = !!hover && hover.kind === 'leg' && hover.seg === h.seg;
    const axis = span[0].y === span[1].y ? 'h' : 'v';
    drawLegGrip(ctx, h.x, h.y, axis, on ? 1 : 0.45 + pulse * 0.15, on);
  }

  // The far end of every detour the player has dug, each wearing a handle: picking one
  // up is how it gets pulled further out or filled back in. The one under the pointer
  // opens up so the gesture is discoverable by hovering rather than by reading a
  // tooltip. The square in hand is skipped — it is lit in full below.
  gr.e.roadNotches.forEach((n, i) => {
    if (armed && armed.index === i) return;
    const p = gr.e.notchHandle(n);
    const on = !!hover && hover.index === i;
    drawNotchHandle(ctx, p.x, p.y, on ? 1 : 0.45 + pulse * 0.15, on);
  });

  // The square under the pointer, outlined: "this is the one that would move". Not
  // drawn over the square already in hand, which is lit below.
  if (hover && (!armed || armed.hx !== hover.hx || armed.hy !== hover.hy)) {
    const span = hover.kind === 'leg' ? gr.e.roadLegSpan(hover.seg) : null;
    // A run answers along its whole length: what would move is never one square.
    if (span) legBand(ctx, span[0], span[1], '#c9a227', 0.16 + pulse * 0.12);
    else if (hover.kind !== 'leg') tileOutline(ctx, hover.hx, hover.hy, '#c9a227', 0.3 + pulse * 0.25, 2);
  }

  if (!armed) return;

  // The square in hand, lit so it is obvious *what* is about to move — the arrows only
  // say where.
  const armedSpan = armedLeg ? gr.e.roadLegSpan(armedLeg.seg) : null;
  if (armedSpan) {
    legBand(ctx, armedSpan[0], armedSpan[1], '#ffd45e', 0.28 + pulse * 0.22);
  } else {
    ctx.save();
    ctx.globalAlpha = 0.3 + pulse * 0.3;
    ctx.fillStyle = '#ffd45e';
    ctx.fillRect(armed.hx - GRID / 2 + 2, armed.hy - GRID / 2 + 2, GRID - 4, GRID - 4);
    ctx.restore();
    tileOutline(ctx, armed.hx, armed.hy, '#ffd45e', 0.9, 2.5);
  }
  drawGrip(ctx, armed.hx, armed.hy, 1);

  // Where the square could go, one arrow per step, each carrying its own price: gold to
  // dig a tile further out, nothing to fill a tile back in. An unaffordable arrow still
  // draws — the price is the answer to "why can't I?", and hiding it would leave the
  // player clicking a dead handle.
  for (const o of gr.e.roadShapeOptions()) {
    const ok = o.digs ? afford : true;
    drawArrow(ctx, o.x, o.y, o.dir, ok, pulse);
    label(ctx, o.x, o.y + 22, deltaText(o.deltaTiles), deltaColor(o.deltaTiles, ok));
    const free = armedLeg ? 'put back' : 'fill in';
    label(ctx, o.x, o.y - 24, o.digs ? `${price} gp` : free, ok ? '#ffd45e' : '#ff4d4d');
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
 * The handle on the far end of a detour: the same chiselled stud, scored with a single
 * bar to say this square is not flat road but something the player made — and can go on
 * making, a tile at a time, in either direction.
 */
function drawNotchHandle(
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

  if (open) label(ctx, x, y - r - 6, 'adjust', '#d8ccb4');
}

/**
 * The grip on a straight run: the same chiselled stud, scored *across* the run rather
 * than along it — the bar points the two ways the road can slide, which is the whole
 * difference between this handle and a notch's.
 */
function drawLegGrip(
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

  // Perpendicular to the run: a run of road slides across itself, never along itself.
  const d = r + 3;
  ctx.beginPath();
  if (axis === 'h') { ctx.moveTo(x, y - d); ctx.lineTo(x, y + d); }
  else { ctx.moveTo(x - d, y); ctx.lineTo(x + d, y); }
  ctx.stroke();
  ctx.restore();

  if (open) label(ctx, x, y - d - 6, 'slide', '#d8ccb4');
}

/** A whole run of road lit end to end — what a slide actually picks up. */
function legBand(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = GRID - 6;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
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

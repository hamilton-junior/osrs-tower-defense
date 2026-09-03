import type { AncientType } from '../../types';

/**
 * **A silenced tower wears the element that silenced it.**
 *
 * Nex's acolytes each knock out the towers casting their own Ancient, and the disable
 * itself is the board's one standard look — 40% alpha plus the prohibited sign, drawn in
 * `drawTowers` and nowhere else. That look says *off*; it cannot say *by whom*, and with
 * four acolytes taking turns that is the whole readable half of the fight. So this dresses
 * the same downed tower in its attacker's element: Glacies leaves it iced over, Umbra
 * shrouded, Cruor bled, Fumus smoking.
 *
 * It adds **no** state and no rules — it is drawn straight off `Tower.silencedBy` and the
 * disable timer that owns it, so it can never outlive the silence or contradict the sign.
 *
 * Two layers, because a tower has to be *inside* the effect for it to read: `'under'` goes
 * down before the sprite (the pool it stands in), `'over'` after it (the ice around it,
 * the smoke off it) but still beneath the prohibited sign, which stays on top of
 * everything at full opacity.
 *
 * Colours are the Ancients' own (`ANCIENTS` in `systems/magic.ts`), so the ice on the
 * tower is the blue of the barrage that put it there. Everything animates off
 * `performance.now()`, like its neighbours in `scorch.ts` — no per-tower state.
 */

/** Seconds of thaw at the tail: the effect lets go before the tower comes back, so the
 *  player sees it returning rather than having it blink on. */
const FADE = 0.8;

export function drawSilencedTower(
  ctx: CanvasRenderingContext2D,
  ancient: AncientType,
  x: number,
  y: number,
  radius: number,
  timer: number,
  layer: 'under' | 'over',
) {
  const a = timer < FADE ? Math.max(0, timer / FADE) : 1;
  if (a <= 0) return;
  const now = performance.now();
  ctx.save();
  if (layer === 'under') under(ctx, ancient, x, y, radius, a, now);
  else over(ctx, ancient, x, y, radius, a, now);
  ctx.restore();
}

/** The ground the tower is standing in: one soft pool in the element's colour. */
function under(
  ctx: CanvasRenderingContext2D, ancient: AncientType,
  x: number, y: number, radius: number, a: number, now: number,
) {
  const r = radius * 1.45;
  const breath = 0.85 + 0.15 * Math.sin(now / 420);
  const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r * breath);
  switch (ancient) {
    case 'ice':
      ctx.globalCompositeOperation = 'lighter';
      g.addColorStop(0, `rgba(127, 230, 255, ${0.3 * a})`);
      g.addColorStop(1, 'rgba(60, 150, 210, 0)');
      break;
    case 'blood':
      g.addColorStop(0, `rgba(120, 10, 10, ${0.5 * a})`);
      g.addColorStop(1, 'rgba(80, 0, 0, 0)');
      break;
    case 'shadow':
      g.addColorStop(0, `rgba(20, 8, 34, ${0.62 * a})`);
      g.addColorStop(1, 'rgba(20, 8, 34, 0)');
      break;
    case 'smoke':
      g.addColorStop(0, `rgba(70, 70, 70, ${0.45 * a})`);
      g.addColorStop(1, 'rgba(60, 60, 60, 0)');
      break;
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** What has hold of the tower, drawn over it. */
function over(
  ctx: CanvasRenderingContext2D, ancient: AncientType,
  x: number, y: number, radius: number, a: number, now: number,
) {
  switch (ancient) {
    case 'ice': return ice(ctx, x, y, radius, a, now);
    case 'blood': return blood(ctx, x, y, radius, a, now);
    case 'shadow': return shadow(ctx, x, y, radius, a, now);
    case 'smoke': return smoke(ctx, x, y, radius, a, now);
  }
}

/** Glacies: the tower set in a block of ice, the way Ice Barrage leaves a target. */
function ice(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, a: number, now: number,
) {
  const w = radius * 1.55;
  const h = radius * 1.85;
  const shimmer = 0.8 + 0.2 * Math.sin(now / 300);
  // The block: a pale slab the tower shows through, brighter at the top edge where the
  // light catches it.
  const g = ctx.createLinearGradient(x, y - h, x, y + h);
  g.addColorStop(0, `rgba(223, 244, 255, ${0.5 * a * shimmer})`);
  g.addColorStop(0.5, `rgba(127, 230, 255, ${0.3 * a})`);
  g.addColorStop(1, `rgba(70, 160, 220, ${0.42 * a})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.72, y - h * 0.62);
  ctx.lineTo(x, y - h * 0.82);
  ctx.lineTo(x + w * 0.72, y - h * 0.58);
  ctx.lineTo(x + w * 0.62, y + h * 0.6);
  ctx.lineTo(x - w * 0.66, y + h * 0.6);
  ctx.closePath();
  ctx.fill();
  // Facets: two bright edges across the slab, so it reads as cut ice and not as fog.
  ctx.strokeStyle = `rgba(235, 250, 255, ${0.55 * a * shimmer})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.45, y - h * 0.55);
  ctx.lineTo(x - w * 0.1, y + h * 0.55);
  ctx.moveTo(x + w * 0.5, y - h * 0.45);
  ctx.lineTo(x + w * 0.16, y + h * 0.5);
  ctx.stroke();
  // Rim light along the top: the highlight that makes it look solid.
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.38 * a})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.72, y - h * 0.62);
  ctx.lineTo(x, y - h * 0.82);
  ctx.lineTo(x + w * 0.72, y - h * 0.58);
  ctx.stroke();
}

/** Cruor: bled — dark runnels down the tower and a drop leaving it. */
function blood(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, a: number, now: number,
) {
  ctx.fillStyle = `rgba(160, 16, 16, ${0.42 * a})`;
  for (let i = 0; i < 3; i++) {
    const rx = x + (i - 1) * radius * 0.52;
    const run = radius * (0.9 + 0.35 * Math.sin(now / 900 + i * 2.3));
    ctx.beginPath();
    ctx.moveTo(rx - radius * 0.12, y - radius * 0.55);
    ctx.quadraticCurveTo(rx, y - radius * 0.1, rx, y - radius * 0.55 + run);
    ctx.quadraticCurveTo(rx, y - radius * 0.1, rx + radius * 0.12, y - radius * 0.55);
    ctx.closePath();
    ctx.fill();
    // The drop that has already let go, falling on its own loop.
    const fall = ((now / 1300) + i / 3) % 1;
    ctx.globalAlpha = 0.7 * a * (1 - fall);
    ctx.beginPath();
    ctx.arc(rx, y - radius * 0.55 + run + fall * radius * 0.9, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Umbra: smothered — a dark veil over the tower with tendrils climbing it. */
function shadow(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, a: number, now: number,
) {
  const r = radius * 1.3;
  const g = ctx.createRadialGradient(x, y - radius * 0.15, r * 0.1, x, y - radius * 0.15, r);
  g.addColorStop(0, `rgba(12, 4, 22, ${0.72 * a})`);
  g.addColorStop(0.65, `rgba(28, 12, 46, ${0.45 * a})`);
  g.addColorStop(1, 'rgba(28, 12, 46, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - radius * 0.15, r, 0, Math.PI * 2);
  ctx.fill();
  // Tendrils: four dark wisps drifting up out of the veil, each on its own phase.
  ctx.strokeStyle = `rgba(106, 63, 176, ${0.5 * a})`;
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 4; i++) {
    const phase = ((now / 1500) + i / 4) % 1;
    const tx = x + Math.sin(now / 620 + i * 1.9) * radius * 0.5;
    const ty = y + radius * 0.4 - phase * radius * 1.5;
    ctx.globalAlpha = 0.55 * a * (1 - phase);
    ctx.beginPath();
    ctx.moveTo(tx, ty + radius * 0.35);
    ctx.quadraticCurveTo(tx + radius * 0.18, ty + radius * 0.15, tx, ty);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Fumus: choking ash — grey puffs curling off the tower. */
function smoke(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, a: number, now: number,
) {
  for (let i = 0; i < 5; i++) {
    const phase = ((now / 1700) + i / 5) % 1;
    const px = x + Math.sin(now / 500 + i * 2.4) * radius * 0.6;
    const py = y + radius * 0.45 - phase * radius * 1.7;
    const pr = radius * (0.24 + phase * 0.42);
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0, `rgba(154, 154, 154, ${0.42 * a * (1 - phase)})`);
    g.addColorStop(1, 'rgba(110, 110, 110, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

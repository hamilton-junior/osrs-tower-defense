import type { GameRenderer } from '../renderer';
import { CORP_LINK_COLOR } from './shared';
import { bodyY } from '../../systems/enemy-anchor';

/**
 * The Corporeal Beast's siphon, drawn as the two halves of one idea.
 *
 * The mechanic is invisible unless the theft is: what a latched Dark energy core does is
 * turn a tower's damage into the Beast's health, and the only way a player connects "my
 * best tower went quiet" and "his bar is going back up" is by seeing the line between
 * them. So there is a tether from the Beast to every core he is holding a tower with,
 * and the tower on the far end of it looks drained.
 *
 * Everything derives from `performance.now()`; no state is kept here.
 */
export function drawSiphonLinks(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const cores = gr.e.enemies.filter((c) => c.type === 'dark_core' && c.coreLatched);
  if (cores.length === 0) return;
  const now = performance.now();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const core of cores) {
    const beast = core.ownerId ? gr.e.enemies.find((b) => b.id === core.ownerId) : undefined;
    if (!beast) continue;
    const x1 = beast.x;
    const y1 = bodyY(beast);
    const x2 = core.x;
    const y2 = core.y;
    // The tether bows, and the bow breathes — a straight line between two moving things
    // reads as a UI overlay, a sagging one reads as something being pulled through.
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 + 18 + Math.sin(now / 380) * 6;
    ctx.strokeStyle = CORP_LINK_COLOR;
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now / 260);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
    // Three motes running the wrong way along it — tower to Beast — because that is the
    // direction the damage is going, and the line has to say so on its own.
    for (let i = 0; i < 3; i++) {
      const t = ((now / 900) + i / 3) % 1;
      const u = 1 - t; // from the core back to him
      const px = u * u * x2 + 2 * u * t * mx + t * t * x1;
      const py = u * u * y2 + 2 * u * t * my + t * t * y1;
      ctx.globalAlpha = 0.75 * Math.sin(t * Math.PI);
      ctx.fillStyle = CORP_LINK_COLOR;
      ctx.beginPath();
      ctx.arc(px, py, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * The other half: a tower with a core latched onto it.
 *
 * Deliberately **not** the disabled look (40% alpha + the prohibited sign). Nothing
 * knocked this tower offline — it is being *used*, it comes back the instant the core
 * dies rather than on a clock, and wearing the shut-down look would point the player at
 * waiting instead of at the core. A cold violet drain sitting on it instead: working,
 * and clearly not for you.
 */
export function drawSiphonedTower(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number,
) {
  const now = performance.now();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = radius * 1.3;
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  glow.addColorStop(0, `rgba(160, 107, 255, ${0.18 + 0.14 * pulse})`);
  glow.addColorStop(1, 'rgba(90, 40, 180, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Motes drawn *inward and up*, the opposite of the scorch's rising embers: this tower
  // is not burning, it is being emptied.
  for (let i = 0; i < 3; i++) {
    const phase = ((now / 900) + i / 3) % 1;
    const ang = i * 2.1 + now / 700;
    const rad = radius * 0.85 * (1 - phase);
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad * 0.6 - phase * radius * 0.5;
    ctx.fillStyle = `rgba(190, 150, 255, ${0.6 * phase})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

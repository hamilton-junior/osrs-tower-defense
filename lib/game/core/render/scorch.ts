import type { GameRenderer } from '../renderer';
import { GRID, hash2 } from './shared';
import { litScorchPoints } from '../../systems/boss-mechanics';

/**
 * The King Black Dragon's dragonfire on the road.
 *
 * The mechanic is invisible unless the fire is: what a scorch actually does is halve the
 * damage of every tower covering it, and the only way a player can connect "my damage
 * fell off a cliff" to "he breathed there" is by seeing the stretch burn. So this draws
 * two distinct states, on the ground, under the towers and the enemies (fire is
 * *terrain* here — things stand on it):
 *
 * - **the tell** — a dull red smoulder that creeps up over the inhale, saying "this
 *   stretch, in a moment", with time to move nothing but your expectations;
 * - **the burn** — real flame, flickering, fading out over its last second so the
 *   player sees their damage coming back rather than having it silently restored.
 *
 * Everything is derived from `performance.now()` and a per-point hash, so no state is
 * kept here and two flames never flicker in lockstep.
 */
export function drawScorches(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const scorches = gr.e.scorches;
  if (scorches.length === 0) return;
  const now = performance.now();

  ctx.save();
  for (const s of scorches) {
    // Age reads forward for the tell (it builds) and backward for the burn (it dies
    // down), so the two states never look like the same effect at a different moment.
    const t = s.life > 0 ? Math.min(1, s.timer / s.life) : 1;
    const strength = s.warning ? t : Math.min(1, (1 - t) * 4);
    ctx.globalCompositeOperation = 'lighter';
    // Each patch waits for its own gout of dragonfire to land (`lit`), so the flames
    // travel down the road behind the projectiles rather than appearing all at once.
    const points = litScorchPoints(s.points, s.lit, s.timer);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const seed = hash2(p.x * 0.11, p.y * 0.13);
      // Each flame breathes on its own clock. The tell barely moves; the burn dances.
      const beat = Math.sin(now / (s.warning ? 520 : 170) + seed * 8);
      const r = GRID * (s.warning ? 0.42 : 0.62) * (0.8 + 0.2 * beat) * (0.55 + 0.45 * strength);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, r));
      if (s.warning) {
        glow.addColorStop(0, `rgba(190, 60, 20, ${0.42 * strength})`);
        glow.addColorStop(1, 'rgba(120, 20, 0, 0)');
      } else {
        glow.addColorStop(0, `rgba(255, 236, 170, ${0.85 * strength})`);
        glow.addColorStop(0.45, `rgba(255, 140, 30, ${0.6 * strength})`);
        glow.addColorStop(1, 'rgba(150, 30, 0, 0)');
      }
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
      // A tongue of flame licking up off the road, only once it is actually burning —
      // the tell has to stay flat, or it reads as fire that is already there.
      if (!s.warning) {
        const h = r * (1.5 + 0.5 * Math.sin(now / 130 + seed * 13));
        ctx.fillStyle = `rgba(255, 190, 60, ${0.32 * strength})`;
        ctx.beginPath();
        ctx.moveTo(p.x - r * 0.45, p.y + r * 0.15);
        ctx.quadraticCurveTo(p.x - r * 0.2, p.y - h * 0.5, p.x, p.y - h);
        ctx.quadraticCurveTo(p.x + r * 0.2, p.y - h * 0.5, p.x + r * 0.45, p.y + r * 0.15);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/**
 * The other half of the same mechanic: a tower standing in the fire's reach.
 *
 * Deliberately **not** the disabled look (40% alpha + the prohibited sign) — this tower
 * is not off, it is hitting soft, and giving it the shut-down look would teach the wrong
 * thing. Embers rising off it instead: alive, and clearly not itself.
 */
export function drawScorchedTower(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number,
) {
  const now = performance.now();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // A heat haze sitting on the tower's footprint.
  const r = radius * 1.25;
  const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  const pulse = 0.5 + 0.5 * Math.sin(now / 240);
  glow.addColorStop(0, `rgba(255, 120, 30, ${0.16 + 0.12 * pulse})`);
  glow.addColorStop(1, 'rgba(255, 80, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Three embers drifting up, each on its own loop.
  for (let i = 0; i < 3; i++) {
    const phase = ((now / 1100) + i / 3) % 1;
    const ex = x + Math.sin(now / 300 + i * 2.1) * radius * 0.45;
    const ey = y + radius * 0.5 - phase * radius * 1.6;
    ctx.fillStyle = `rgba(255, 190, 80, ${0.55 * (1 - phase)})`;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

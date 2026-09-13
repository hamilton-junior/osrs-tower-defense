import type { GameRenderer } from '../renderer';
import { GRID } from '../engine-state';
import { spotStage, wavesUntilRestock } from '../../systems/fishing';
import { drawImageContain } from './shared';

/**
 * The fishing spots and the cast bar — the only parts of the water that move.
 * The pool underneath is baked into the static background (`render/terrain.ts`).
 *
 * A ready spot bubbles and glows the way a ripe allotment does; a spent one sits
 * flat and carries the wave count it is waiting on, in the same corner and the
 * same type as an allotment's.
 */
export function drawFishing(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const spots = gr.e.fishingSpots;
  if (spots.length === 0) return;
  const t = performance.now() / 1000;
  const idle = !gr.e.waveActive && !gr.e.gameOver;
  const { ripple, foam } = gr.e.biome.water;
  const img = gr.e.imageOk('fishing_spot') ? gr.e.images.get('fishing_spot') : null;

  for (const spot of spots) {
    const ready = spotStage(spot) === 'ready' && !gr.e.gameOver;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + spot.x * 0.03 + spot.y * 0.05);
    const bob = ready ? Math.sin(t * 1.8 + spot.x * 0.05) * 1.6 : 0;

    // A dark well under the spot. The cache model is near-white foam and the water
    // it stands on is bright, so the bubbles only read once something dark sits
    // behind them; the well doubles as the shadow a break in the surface casts.
    const wellR = GRID * 0.46;
    const well = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, wellR);
    well.addColorStop(0, `rgba(0,0,0,${ready ? 0.42 : 0.24})`);
    well.addColorStop(0.6, `rgba(0,0,0,${ready ? 0.22 : 0.13})`);
    well.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = well;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, wellR, 0, Math.PI * 2);
    ctx.fill();

    // The bubbles themselves, off the cache-rendered NPC. Full alpha now that the
    // well backs them: the pulse breathes the sprite's size instead of fading it,
    // so a ready spot is never less visible than a spent one.
    if (img) {
      ctx.globalAlpha = ready ? 1 : 0.5;
      if (ready) {
        ctx.save();
        ctx.shadowColor = foam;
        ctx.shadowBlur = 6;
        drawImageContain(gr, ctx, img, spot.x, spot.y + bob, GRID * (0.9 + pulse * 0.06));
        ctx.restore();
      } else {
        drawImageContain(gr, ctx, img, spot.x, spot.y + bob, GRID * 0.86);
      }
      ctx.globalAlpha = 1;
    }

    // A ring of expanding ripples while the line is out, so the bar on the tile
    // and the water agree about what is happening.
    if (gr.e.castSpotId === spot.id && gr.e.castProgress > 0) {
      const grow = (t * 1.6) % 1;
      ctx.globalAlpha = 0.35 * (1 - grow);
      ctx.strokeStyle = ripple;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 4 + grow * (GRID * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // The cast bar, on the tile, in the sunken/filled shape the rest of the
      // game's bars use.
      const w = GRID - 8;
      const x0 = spot.x - w / 2;
      const y0 = spot.y + GRID / 2 - 6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x0 - 1, y0 - 1, w + 2, 5);
      ctx.fillStyle = foam;
      ctx.fillRect(x0, y0, w * Math.min(1, gr.e.castProgress), 3);
      continue;
    }

    if (!idle) continue;

    if (ready) {
      // The same dashed invitation ring an empty allotment draws.
      ctx.globalAlpha = 0.14 + pulse * 0.16;
      ctx.strokeStyle = ripple;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(spot.x - GRID / 2 + 3, spot.y - GRID / 2 + 3, GRID - 6, GRID - 6);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    } else {
      // Waves left, in an allotment's corner and an allotment's type.
      const left = wavesUntilRestock(spot);
      ctx.font = "bold 11px 'RuneScape', Arial";
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      const tx = spot.x + GRID / 2 - 2;
      const ty = spot.y + GRID / 2 - 1;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#000';
      ctx.strokeText(`${left}`, tx, ty);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffd45e';
      ctx.fillText(`${left}`, tx, ty);
      ctx.globalAlpha = 1;
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

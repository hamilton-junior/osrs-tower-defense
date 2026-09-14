import type { GameRenderer } from '../renderer';
import { GRID } from '../engine-state';
import { spotStage, wavesUntilRestock } from '../../systems/fishing';

/** How long one frame of a spot's strip holds. Sequence 7634 runs eight frames of
 *  five game units each, and a unit is 20 ms — so the loop closes in 800 ms, the
 *  speed the client itself plays the water at. */
const FRAME_MS = 100;

/** The glow a pool with fish in it carries. Cyan rather than the biome's own foam:
 *  Morytania's foam is swamp-olive, and a green halo would read as a ripe herb. */
const GLOW = '120,226,255';

/**
 * The fishing spots and the cast bar — the only parts of the water that move.
 * The pool underneath is baked into the static background (`render/terrain.ts`).
 *
 * The spot is a strip of frames baked from the cache, and which strip it is
 * carries the whole state: a pool with fish left in it breaks the water like a
 * Tempoross Cove spot, plays its loop and takes a faint cyan glow; a spent one
 * holds the strip's first frame with no glow at all, and carries the wave count it
 * is waiting on in the same corner and the same type as an allotment's.
 */
export function drawFishing(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const spots = gr.e.fishingSpots;
  if (spots.length === 0) return;
  const t = performance.now() / 1000;
  const idle = !gr.e.waveActive && !gr.e.gameOver;
  const { ripple, foam } = gr.e.biome.water;
  const sheets = {
    ready: gr.e.imageOk('fishing_spot_active') ? gr.e.images.get('fishing_spot_active') : null,
    spent: gr.e.imageOk('fishing_spot') ? gr.e.images.get('fishing_spot') : null,
  };

  for (const spot of spots) {
    const ready = spotStage(spot) === 'ready' && !gr.e.gameOver;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + spot.x * 0.03 + spot.y * 0.05);
    const bob = ready ? Math.sin(t * 1.8 + spot.x * 0.05) * 1.6 : 0;

    // The water breaking, off the cache-rendered NPC. The strip is square cells laid
    // left to right, so its own geometry gives the frame count — nothing records how
    // many there are, and a re-bake with a longer clip cannot fall out of step.
    const img = ready ? sheets.ready : sheets.spent;
    if (img) {
      const cell = img.height;
      const frames = Math.max(1, Math.round(img.width / cell));
      // Only a pool with fish in it moves. A spent one holds frame 0: water that
      // has gone still is what says the fish have left, and bubbles over an empty
      // pool invite a cast that cannot happen.
      const f = ready ? Math.floor((t * 1000) / FRAME_MS) % frames : 0;
      const size = GRID * (ready ? 0.9 + pulse * 0.06 : 0.86);
      const dx = spot.x - size / 2;
      const dy = spot.y - size / 2 + bob;
      if (ready) {
        // Faint, and deliberately fainter than a ripe herb's halo: fish in a pool is
        // an invitation, not the alarm a crop about to be lost is. One pass, where
        // the allotment stacks three.
        ctx.save();
        ctx.shadowColor = `rgba(${GLOW},${0.28 + pulse * 0.18})`;
        ctx.shadowBlur = 5;
        ctx.drawImage(img, f * cell, 0, cell, cell, dx, dy, size, size);
        ctx.restore();
      }
      ctx.drawImage(img, f * cell, 0, cell, cell, dx, dy, size, size);
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

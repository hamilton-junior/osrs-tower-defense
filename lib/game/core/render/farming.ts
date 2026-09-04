import type { GameRenderer } from '../renderer';
import { GRID } from '../engine-state';
import { SEED_BY_ID } from '../../data/farming';
import { patchStage, wavesLeft } from '../../systems/farming';
import { drawImageContain } from './shared';

/**
 * The allotment patches — the one slow thing on the board.
 *
 * Drawn between the towers and the enemies, on tiles the terrain already marked
 * unbuildable, so this layer never covers anything the player put there.
 *
 * The whole job is legibility from across the board. A patch has four looks and
 * they have to be tellable apart at a glance: bare soil, a seed in the ground, a
 * plant halfway up, and a ripe herb. The three crops are the real OSRS allotment
 * models baked as the plant *alone* (see scripts/render-osrs-objects.mjs), so the
 * soil under every stage is this layer's, drawn once, and a growing plant reads as
 * the same plot getting fuller rather than as four different squares.
 *
 * The two states that want a click are the two that glow, and only between waves:
 * a ring on ground that could be sown, and a green halo plus overhead text on a
 * herb that is ready. Nothing here counts down during a fight, because nothing
 * here can be done during one.
 */

/** How much of the tile the plant fills at each stage — the growth the player
 *  actually reads, since each sprite is baked normalised to its own frame. */
const CROP_SCALE = { sown: 0.5, growing: 0.72, ready: 0.92 } as const;

export function drawFarming(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const patches = gr.e.farmPatches;
  if (patches.length === 0) return;

  // Real-world clock, like every other idle animation here: a glow that froze on
  // pause would read as a broken sprite rather than a paused game.
  const t = performance.now() / 1000;
  const idle = !gr.e.waveActive && !gr.e.gameOver;
  const soil = gr.e.imageOk('farm_soil') ? gr.e.images.get('farm_soil') : null;

  for (const p of patches) {
    const stage = patchStage(p, gr.e.wave);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + p.x * 0.03 + p.y * 0.05);

    // The raked earth every stage stands on. Full tile, so the plot is a square of
    // worked ground rather than a sprite floating on grass.
    if (soil) {
      ctx.drawImage(soil, p.x - GRID / 2, p.y - GRID / 2, GRID, GRID);
    } else {
      ctx.fillStyle = '#4a3620';
      ctx.fillRect(p.x - GRID / 2, p.y - GRID / 2, GRID, GRID);
    }

    // The crop, drawn over its own soil. Anchored a touch low so the plant grows
    // out of the ground rather than hovering in the middle of the tile.
    if (stage !== 'empty') {
      const key = `farm_${stage}`;
      const img = gr.e.imageOk(key) ? gr.e.images.get(key) : null;
      if (img) drawImageContain(gr, ctx, img, p.x, p.y + 2, GRID * CROP_SCALE[stage]);
    }

    if (!idle) continue;

    if (stage === 'empty') {
      // "There is ground here going unused." Quiet on purpose — an empty patch is
      // an offer, not a job, and it must not compete with a ready one.
      ctx.save();
      ctx.globalAlpha = 0.2 + pulse * 0.2;
      ctx.strokeStyle = '#ffd45e';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(p.x - GRID / 2 + 3, p.y - GRID / 2 + 3, GRID - 6, GRID - 6);
      ctx.restore();
    } else if (stage === 'ready') {
      // A ripe herb is the one thing on this layer that is genuinely owed to the
      // player, so it gets the loud tell: a green halo and OSRS overhead text.
      ctx.save();
      ctx.globalAlpha = 0.3 + pulse * 0.4;
      ctx.strokeStyle = '#4dff4d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 10, 17 + pulse * 3, 7 + pulse * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const name = p.seedId ? SEED_BY_ID[p.seedId].herbName : 'Ready';
      ctx.save();
      ctx.font = "bold 13px 'RuneScape', Arial";
      ctx.textAlign = 'center';
      const ty = p.y - 22;
      ctx.fillStyle = '#000';
      ctx.fillText(name, p.x + 1, ty + 1);
      ctx.fillStyle = '#4dff4d';
      ctx.fillText(name, p.x, ty);
      ctx.restore();
    } else {
      // Still growing: the only number worth putting on the board, because it is
      // the one thing the picture cannot say exactly.
      const left = wavesLeft(p, gr.e.wave);
      ctx.save();
      ctx.font = "bold 12px 'RuneScape', Arial";
      ctx.textAlign = 'center';
      const label = `${left}`;
      const ty = p.y - 20;
      ctx.fillStyle = '#000';
      ctx.fillText(label, p.x + 1, ty + 1);
      ctx.fillStyle = '#ffd45e';
      ctx.fillText(label, p.x, ty);
      ctx.restore();
    }
  }
}

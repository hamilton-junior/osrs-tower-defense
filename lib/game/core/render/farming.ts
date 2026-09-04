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
 * The whole job is legibility from across the board, and there are two questions
 * to answer at a glance: *this is a farming patch*, and *that is my herb in it*.
 * The first is the OSRS allotment itself — object 8573's raked soil, baked
 * top-down (scripts/render-osrs-objects.mjs) so it fills its tile as a square of
 * worked ground instead of a diamond floating on grass — with its furrows and its
 * cut edge drawn over it, which is what a tilled plot looks like from above and
 * what no flat-rasterised model can supply. The second is the seed the player
 * actually bought: its own item icon goes in the ground, and grows into the herb
 * icon it will hand back. A potato in a guam patch said the wrong thing.
 *
 * The two states that want a click are the two that glow, and only between waves:
 * a ring on ground that could be sown, and a green halo plus overhead text on a
 * herb that is ready. Nothing here counts down during a fight, because nothing
 * here can be done during one.
 */

/** How much of the tile the crop fills at each stage — the growth the player
 *  reads before they read the number. */
const CROP_SCALE = { sown: 0.46, growing: 0.66, ready: 0.9 } as const;

export function drawFarming(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const patches = gr.e.farmPatches;
  if (patches.length === 0) return;

  // Real-world clock, like every other idle animation here: a glow that froze on
  // pause would read as a broken sprite rather than a paused game.
  const t = performance.now() / 1000;
  const idle = !gr.e.waveActive && !gr.e.gameOver;
  const soil = gr.e.imageOk('farm_soil') ? gr.e.images.get('farm_soil') : null;

  for (const p of patches) {
    const stage = patchStage(p);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + p.x * 0.03 + p.y * 0.05);
    const left = p.x - GRID / 2;
    const top = p.y - GRID / 2;

    // The raked earth every stage stands on. Full tile, so the plot is a square of
    // worked ground rather than a sprite floating on grass.
    if (soil) {
      ctx.drawImage(soil, left, top, GRID, GRID);
    } else {
      ctx.fillStyle = '#4a3620';
      ctx.fillRect(left, top, GRID, GRID);
    }

    // Furrows and a cut edge. The model is a flat brown quad — this is what turns
    // it into ploughed ground, and it is the difference between a patch you can
    // pick out from across the board and a brown tile.
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, GRID, GRID);
    ctx.clip();
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = Math.round(top + (GRID * i) / 4) + 0.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.moveTo(left + 2, y);
      ctx.lineTo(left + GRID - 2, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,235,190,0.10)';
      ctx.beginPath();
      ctx.moveTo(left + 2, y - 1);
      ctx.lineTo(left + GRID - 2, y - 1);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, GRID - 1, GRID - 1);
    ctx.restore();

    // What is in the ground: the player's own seed, then the herb it becomes. One
    // sprite per patch — a tile is ~24 screen pixels, and two things stacked on it
    // read as neither.
    if (stage !== 'empty' && p.seedId) {
      const def = SEED_BY_ID[p.seedId];
      const key = stage === 'sown' ? `seed_${def.id}` : `herb_${def.id}`;
      const img = gr.e.imageOk(key) ? gr.e.images.get(key) : null;
      if (img) drawImageContain(gr, ctx, img, p.x, p.y + 1, GRID * CROP_SCALE[stage]);
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
      ctx.strokeRect(left + 3, top + 3, GRID - 6, GRID - 6);
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
      // Still growing: the waves left, the one thing the picture cannot say exactly.
      // Outlined rather than shadowed — it sits over grass, soil and the crop itself,
      // and the player reported it as frozen when it was only unreadable.
      const label = `${wavesLeft(p)}`;
      ctx.save();
      ctx.font = "bold 14px 'RuneScape', Arial";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const ty = p.y - 21;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.lineJoin = 'round';
      ctx.strokeText(label, p.x, ty);
      ctx.fillStyle = '#ffd45e';
      ctx.fillText(label, p.x, ty);
      ctx.restore();
    }
  }
}

import type { GameRenderer } from '../renderer';
import { GRID } from '../engine-state';
import { SEED_BY_ID } from '../../data/farming';
import { canPlacePlot, patchStage, plotTargets, wavesLeft } from '../../systems/farming';
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
 * top-down and edge-to-edge under OSRS's own dirt texture
 * (scripts/render-osrs-objects.mjs), so it fills its tile as a square of worked
 * ground instead of a diamond floating on grass — with its furrows and its cut
 * edge drawn over it, which is what a tilled plot looks like from above and what
 * no flat-rasterised model can supply. The second is the seed the player actually
 * bought: its own item icon goes in the ground, and grows into the herb icon it
 * will hand back. A potato in a guam patch said the wrong thing.
 *
 * The two states that want a click are the two that glow: a ring on bare ground
 * that could be sown, which only appears between waves because that is when it can
 * be sown, and a green contour on a ripe herb, which also lifts off its soil and
 * settles back and is drawn whenever the herb is there, because the harvest itself
 * has no clock on it. Both stay inside their own tile: an indicator that reached
 * into the tile above sat on whatever the player had built there. The growing
 * count is a between-waves tell, since nothing ripens mid-fight.
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

    // Furrows and a cut edge. The model is two untextured triangles — this is what
    // turns it into ploughed ground, and it is the difference between a patch you
    // can pick out from across the board and a brown tile.
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, GRID, GRID);
    ctx.clip();
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = Math.round(top + (GRID * i) / 4) + 0.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.26)';
      ctx.beginPath();
      ctx.moveTo(left + 2, y);
      ctx.lineTo(left + GRID - 2, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,231,182,0.09)';
      ctx.beginPath();
      ctx.moveTo(left + 2, y - 1);
      ctx.lineTo(left + GRID - 2, y - 1);
      ctx.stroke();
    }
    ctx.restore();

    // The edge, cut the way OSRS cuts a sunken box: a dark line on the outside and
    // a warm one just inside it. One flat outline read as a seam between two brown
    // tiles; two lines read as ground that was dug out and has a lip.
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.strokeRect(left + 0.5, top + 0.5, GRID - 1, GRID - 1);
    ctx.strokeStyle = 'rgba(214,178,118,0.10)';
    ctx.strokeRect(left + 1.5, top + 1.5, GRID - 3, GRID - 3);
    ctx.restore();

    // What is in the ground: the player's own seed, then the herb it becomes. One
    // sprite per patch — a tile is ~24 screen pixels, and two things stacked on it
    // read as neither.
    if (stage !== 'empty' && p.seedId) {
      const def = SEED_BY_ID[p.seedId];
      const key = stage === 'sown' ? `seed_${def.id}` : `herb_${def.id}`;
      const img = gr.e.imageOk(key) ? gr.e.images.get(key) : null;
      if (img) {
        // Ripe: the herb rises and settles by a pixel or two, and the sprite's own
        // silhouette picks up a green edge. The shadow follows the icon's alpha, so
        // the contour hugs the leaves rather than boxing the tile — and both tells
        // sit on the sprite itself, inside the plot's own square.
        const ripe = stage === 'ready' && !gr.e.gameOver;
        const bob = ripe ? Math.sin(t * 1.8 + p.x * 0.05) * 1.6 : 0;
        const size = GRID * CROP_SCALE[stage];
        if (ripe) {
          ctx.save();
          ctx.shadowColor = `rgba(77,255,77,${0.5 + pulse * 0.35})`;
          ctx.shadowBlur = 4;
          // Three passes, because one shadow pass alone is too faint to read from
          // across the board.
          for (let i = 0; i < 3; i++) drawImageContain(gr, ctx, img, p.x, p.y + 1 + bob, size);
          ctx.restore();
        }
        drawImageContain(gr, ctx, img, p.x, p.y + 1 + bob, size);
      }
    }

    // Grown along by the Tool Leprechaun: his own face, cropped from his bake, in
    // the plot's top-left corner. The waves-left count owns the bottom-right, and a
    // mark over the tile above would sit on whatever stands there.
    if (p.tended && stage !== 'empty') {
      const lep = gr.e.imageOk('diversion_tool_leprechaun') ? gr.e.images.get('diversion_tool_leprechaun') : null;
      if (lep) {
        // The head of the 256px bake; scaled, so a re-bake at another size still lands.
        const k = lep.naturalWidth / 256;
        const size = 14;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.arc(left + 1 + size / 2, top + 1 + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(lep, 88 * k, 6 * k, 88 * k, 88 * k, left + 1, top + 1, size, size);
        ctx.restore();
      }
    }

    if (!idle) continue;

    if (stage === 'empty') {
      // "There is ground here going unused." Quiet on purpose — an empty patch is
      // an offer, not a job, and it must not compete with a ready one. Thin, because
      // the soil now carries its own cut edge: at two pixels the ring sat right on
      // top of that edge and the pair read as a wooden frame around the tile.
      ctx.save();
      ctx.globalAlpha = 0.14 + pulse * 0.16;
      ctx.strokeStyle = '#ffd45e';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(left + 2.5, top + 2.5, GRID - 5, GRID - 5);
      ctx.restore();
    } else if (stage !== 'ready') {
      // Still growing: the waves left, the one thing the picture cannot say exactly.
      // It sits in the plot's own bottom-right corner, small and outlined — over the
      // tile above it covered whatever stood there, and the crop is centred, so the
      // corner is the one part of the square the herb never reaches.
      const label = `${wavesLeft(p)}`;
      ctx.save();
      ctx.font = "bold 11px 'RuneScape', Arial";
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      const tx = left + GRID - 2;
      const ty = top + GRID - 2;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(label, tx, ty);
      ctx.fillStyle = '#ffd45e';
      ctx.globalAlpha = 0.85;
      ctx.fillText(label, tx, ty);
      ctx.restore();
    }
  }
}

/**
 * The board while a plot is in hand — moved, or bought and not yet put down.
 *
 * An allotment may only stand on ground that was already unusable (systems/farming
 * says why), and that is not a rule a player can see by looking at scrub. So every
 * tile that would take it is marked, and the tile under the pointer answers yes or
 * no in the two colours the rest of the board uses for it. Nobody should have to
 * learn this rule by clicking somewhere and being ignored.
 */
export function drawPlotPlacement(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const e = gr.e;
  const moving = e.movingPatchId ? e.farmPatches.find(p => p.id === e.movingPatchId) ?? null : null;
  if (!moving && !e.placingPlot) return;
  if (e.terrain.cols === 0) return;

  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);

  ctx.save();
  ctx.lineWidth = 1;
  for (const tile of plotTargets(e.terrain, moving)) {
    const left = tile.col * GRID;
    const top = tile.row * GRID;
    ctx.fillStyle = `rgba(255,212,94,${0.07 + pulse * 0.05})`;
    ctx.fillRect(left + 1, top + 1, GRID - 2, GRID - 2);
    ctx.strokeStyle = 'rgba(255,212,94,0.35)';
    ctx.strokeRect(left + 1.5, top + 1.5, GRID - 3, GRID - 3);
  }
  ctx.restore();

  // The tile under the pointer, in the yes/no the board already speaks.
  const col = Math.floor(e.pointer.x / GRID);
  const row = Math.floor(e.pointer.y / GRID);
  if (col < 0 || row < 0 || col >= e.terrain.cols || row >= e.terrain.rows) return;
  const ok = canPlacePlot(e.terrain, col, row, moving);
  const left = col * GRID;
  const top = row * GRID;
  ctx.save();
  ctx.globalAlpha = 0.55 + pulse * 0.2;
  ctx.fillStyle = ok ? 'rgba(77,255,77,0.22)' : 'rgba(255,77,77,0.22)';
  ctx.fillRect(left, top, GRID, GRID);
  ctx.lineWidth = 2;
  ctx.strokeStyle = ok ? '#4dff4d' : '#ff4d4d';
  ctx.strokeRect(left + 1, top + 1, GRID - 2, GRID - 2);
  ctx.restore();
}

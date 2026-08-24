import type { GameRenderer } from '../renderer';
import { DIVERSION_BY_ID } from '../../data/diversions';
import { drawImageContain } from './shared';

/**
 * Distractions & Diversions — whoever has wandered onto the board between waves.
 *
 * Drawn after the towers and before the enemies, because they only ever exist while
 * there are no enemies: this layer is empty for the whole of a fight. The job here is
 * to make one small sprite on a big board impossible to miss without shouting — a
 * soft pulsing ring on the ground, a gentle bob, and OSRS's own overhead text.
 *
 * Nothing here counts anything down. A diversion waits for as long as the prep phase
 * lasts, so a ring that drained would be telling the player a lie about urgency in a
 * frame whose whole rule is that it never asks for their attention.
 */
export function drawDiversions(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const list = gr.e.diversions;
  if (list.length === 0) return;

  // Real-world clock, like the other idle animations in this renderer: a bob that
  // froze on pause would read as a broken sprite rather than a paused game.
  const t = performance.now() / 1000;

  for (const d of list) {
    const def = DIVERSION_BY_ID[d.defId];
    const bob = Math.sin(t * 2 + d.x * 0.05) * 2;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + d.y * 0.05);

    // Ground ring — the "there is something here" tell, and the click target's
    // footprint. It breathes rather than fills or drains.
    ctx.save();
    ctx.globalAlpha = 0.25 + pulse * 0.35;
    ctx.strokeStyle = '#ffd45e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 12, 15 + pulse * 3, 6 + pulse * 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const key = `diversion_${d.defId}`;
    const img = gr.e.images.get(key);
    if (gr.e.imageOk(key) && img) {
      drawImageContain(gr, ctx, img, d.x, d.y + bob, 34);
    } else {
      // The sprite failed to load. Something still has to be clickable where the
      // ring says it is, so fall back to a plain marker rather than empty ground.
      ctx.save();
      ctx.fillStyle = '#ffd45e';
      ctx.beginPath();
      ctx.arc(d.x, d.y + bob, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Overhead text, in OSRS's own yellow-on-black-shadow. A walkby says its line —
    // that IS the whole of a walkby. The rest get named, so the player can tell a
    // genie from a nest without walking over to it.
    const text = d.mood === 'walkby' ? d.line : def.name;
    ctx.save();
    ctx.font = "bold 13px 'RuneScape', Arial";
    ctx.textAlign = 'center';
    const ty = d.y - 26 + bob;
    ctx.fillStyle = '#000';
    ctx.fillText(text, d.x + 1, ty + 1);
    ctx.fillStyle = '#ffff00';
    ctx.fillText(text, d.x, ty);
    ctx.restore();
  }
}

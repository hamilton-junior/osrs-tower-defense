import type { GameRenderer } from '../renderer';
import { HUNTER_TRAP_BY_ID } from '../../data/hunter-traps';
import { snapTrapSpot, trapSpotFree, type HunterTrap } from '../../systems/hunter-traps';
import { GRID, drawImageContain } from './shared';

/**
 * Hunter traps — the things lying on the road.
 *
 * Drawn *under* the enemies, because that is exactly what they are: something on the
 * ground that gets walked over. A trap that drew on top would read as a wall, and the
 * one promise the whole mechanic makes is that it never blocks passage.
 *
 * Two jobs. The traps already laid, each with its charges still readable at a glance
 * (a spent charge is the resource the player is spending, so it cannot be hidden in a
 * tooltip), and the ghost under the pointer while one is in hand — green where it
 * would land, red where it would not, so "traps go on the road" is something the
 * player sees before they click rather than a refusal they read afterwards.
 */
export function drawTraps(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const trap of gr.e.traps) drawOne(gr, ctx, trap);
  drawGhost(gr, ctx);
}

function drawOne(gr: GameRenderer, ctx: CanvasRenderingContext2D, trap: HunterTrap) {
  const def = HUNTER_TRAP_BY_ID[trap.defId];
  // Real-world clock like every other idle animation here: a pulse that froze on
  // pause reads as a broken sprite rather than a paused game.
  const t = performance.now() / 1000;
  const arming = trap.rearm > 0;

  ctx.save();
  // The tile it sits on, so a trap on a busy road is still findable.
  ctx.globalAlpha = arming ? 0.18 : 0.3 + 0.12 * Math.sin(t * 2.2 + trap.x * 0.05);
  ctx.strokeStyle = def.kind === 'blast' ? '#ff8a3d' : '#c9a227';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(trap.x - GRID / 2 + 2, trap.y - GRID / 2 + 2, GRID - 4, GRID - 4);
  ctx.restore();

  const key = `trap_${trap.defId}`;
  const img = gr.e.images.get(key);
  ctx.save();
  // Resetting reads as dimmed: the trap is there, it just cannot answer yet.
  ctx.globalAlpha = arming ? 0.45 : 1;
  if (gr.e.imageOk(key) && img) {
    drawImageContain(gr, ctx, img, trap.x, trap.y, 22);
  } else {
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(trap.x - 7, trap.y - 7, 14, 14);
  }
  ctx.restore();

  // Charges left, as pips under the sprite — only where there is more than one to
  // count, so a single-shot trap is not decorated with a lone dot.
  if (def.charges > 1) {
    const w = 4;
    const x0 = trap.x - (def.charges * w) / 2 + w / 2;
    ctx.save();
    for (let i = 0; i < def.charges; i++) {
      ctx.fillStyle = i < trap.charges ? '#ffd45e' : 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(x0 + i * w, trap.y + 12, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** The trap in hand, previewed where it would land. */
function drawGhost(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const id = gr.e.selectedTrapId;
  if (!id) return;
  const { x, y } = gr.e.pointer;
  const spot = snapTrapSpot(x, y, gr.e.path, GRID);
  const ok = spot !== null && trapSpotFree(spot, gr.e.traps, GRID) && gr.e.traps.length < gr.e.trapSlots;
  // Off the road there is no tile to preview, so the refusal is drawn on the tile
  // the pointer is actually over.
  const gx = spot ? spot.x : (Math.floor(x / GRID) + 0.5) * GRID;
  const gy = spot ? spot.y : (Math.floor(y / GRID) + 0.5) * GRID;

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = ok ? '#3dff6a' : '#ff4d4d';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx - GRID / 2 + 2, gy - GRID / 2 + 2, GRID - 4, GRID - 4);
  ctx.restore();

  const key = `trap_${id}`;
  const img = gr.e.images.get(key);
  if (gr.e.imageOk(key) && img) {
    ctx.save();
    ctx.globalAlpha = ok ? 0.75 : 0.35;
    drawImageContain(gr, ctx, img, gx, gy, 22);
    ctx.restore();
  }

  // A chinchompa is bought for its reach, so the reach is what the ghost shows.
  const def = HUNTER_TRAP_BY_ID[id];
  if (def.kind === 'blast') {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#ff8a3d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gy, def.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

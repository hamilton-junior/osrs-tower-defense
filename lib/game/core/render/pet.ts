import type { GameRenderer } from '../renderer';
import { LOGIC_WIDTH, LOGIC_HEIGHT, GRID } from '../engine-state';
import { drawImageContain } from './shared';

/** Box the pet portrait is fit into, logic px. Deliberately near a tile: a pet is
 *  the smallest thing on the board, and a bigger one would read as an enemy. The
 *  bakes carry transparent margin, so a box much under a tile reads as a smudge. */
const PET_BOX = 40;
/** How far the pet paces either side of its anchor, logic px. */
const PATROL = 34;
/** Seconds for one there-and-back pace. */
const PATROL_PERIOD = 7;

/**
 * The active boss pet, pacing beside the road's last stretch.
 *
 * Cosmetic, and only cosmetic — it has no hitbox, blocks nothing and is never
 * targeted, so it draws under the enemies and takes no input. It stands near the
 * end of the path because that is where the player already looks: the tile the
 * leaks reach.
 *
 * Anchored to the last **on-board** path point, never `path.at(-1)`. `buildPath`
 * extends entry and exit stubs off-screen so enemies walk in and out of frame,
 * so the final point is outside the board and a pet parked there is invisible.
 */
export function drawActivePet(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const id = gr.e.activePet;
  if (!id) return;
  const key = `pet_${id}`;
  const img = gr.e.images.get(key);
  if (!img || !gr.e.imageOk(key)) return;

  const anchor = baseAnchor(gr);
  if (!anchor) return;

  // Real-world clock, like every other idle animation here: pausing the game
  // freezing the pet mid-stride would read as a broken sprite, not a paused game.
  const t = performance.now() / 1000;
  const phase = (t % PATROL_PERIOD) / PATROL_PERIOD;
  const sweep = Math.sin(phase * Math.PI * 2);
  const x = clamp(anchor.x + sweep * PATROL, PET_BOX, LOGIC_WIDTH - PET_BOX);
  const bob = Math.abs(Math.sin(t * 4)) * 2;
  const y = clamp(anchor.y - bob, PET_BOX, LOGIC_HEIGHT - PET_BOX);
  // The bake faces right, so mirror only while the pace runs the other way.
  const facingLeft = Math.cos(phase * Math.PI * 2) < 0;

  ctx.save();
  // A soft shadow, so the pet sits on the ground instead of floating over it.
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, anchor.y + PET_BOX * 0.3, PET_BOX * 0.24, PET_BOX * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.translate(x, y);
  if (facingLeft) ctx.scale(-1, 1);
  drawImageContain(gr, ctx, img, 0, 0, PET_BOX);
  ctx.restore();
}

/** Where the pet waits: one tile off the road, beside its last on-board point. */
function baseAnchor(gr: GameRenderer): { x: number; y: number } | null {
  const path = gr.e.path;
  for (let i = path.length - 1; i >= 0; i--) {
    const p = path[i];
    if (p.x < 0 || p.x > LOGIC_WIDTH || p.y < 0 || p.y > LOGIC_HEIGHT) continue;
    // Off the road, and on whichever side of it has board left to stand on.
    const below = p.y + GRID < LOGIC_HEIGHT - PET_BOX;
    return { x: p.x, y: below ? p.y + GRID : p.y - GRID };
  }
  return null;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

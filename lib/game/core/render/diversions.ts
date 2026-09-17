import type { GameRenderer } from '../renderer';
import { DIVERSION_BY_ID } from '../../data/diversions';
import { BALLOON_BODY_LIFT, DIVERSION_POP_MS, rewardImageKey } from '../../systems/diversions';
import { DIVERSION_ANIMS, diversionAnimKey, type DiversionView } from '../../data/diversion-anims';
import { clipFrame } from '../../data/enemy-anims';
import { drawImageContain } from './shared';

/** Box the static portrait fallback is fit into, logic px. */
const PORTRAIT_BOX = 34;
/**
 * Box a baked clip frame is drawn at. Smaller than the portrait box on purpose: a
 * portrait cell is baked with a 12% margin (the model fills ~0.79 of it) and an
 * animation cell with 6% (~0.91), so drawing both at 34 would make an NPC jump a
 * size the moment its sheet finished loading. This is the number that makes the
 * model itself the same height either way.
 */
const CLIP_BOX = 30;

/**
 * Distractions & Diversions — whoever has wandered onto the board between waves.
 *
 * Drawn after the towers and before the enemies, because they only ever exist while
 * there are no enemies: this layer is empty for the whole of a fight. The job here is
 * to make one small sprite on a big board impossible to miss without shouting — a
 * soft pulsing ring on the ground, OSRS's own overhead text, and the NPC's own
 * animation.
 *
 * Nothing here counts anything down. A diversion waits for as long as the prep phase
 * lasts, so a ring that drained would be telling the player a lie about urgency in a
 * frame whose whole rule is that it never asks for their attention.
 */
export function drawDiversions(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  drawPartyBalloons(gr, ctx);
  drawDiversionPops(gr, ctx);
  const list = gr.e.diversions;
  if (list.length === 0) return;

  // Real-world clock, like the other idle animations in this renderer: a walk cycle
  // that froze on pause would read as a broken sprite rather than a paused game.
  const t = performance.now() / 1000;

  for (const d of list) {
    const def = DIVERSION_BY_ID[d.defId];
    const walking = d.phase !== 'here';
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + d.y * 0.05);

    // Ground ring — the "there is something here" tell, and the click target's
    // footprint. It breathes rather than fills or drains. Only for someone standing
    // there to be clicked: a ring under a leaver would be promising a payout twice.
    if (d.phase !== 'leaving') {
      ctx.save();
      ctx.globalAlpha = (0.25 + pulse * 0.35) * (walking ? 0.5 : 1);
      ctx.strokeStyle = '#ffd45e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y + 12, 15 + pulse * 3, 6 + pulse * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // The NPC's own animation, baked from its own cache def — its standing loop while
    // it waits, its walking loop while it travels — from the camera yaw that faces the
    // way it is going. Someone standing on their tile is always `front`, looking at the
    // player, and dances there instead if they have a dance. A view that wasn't baked
    // falls back to `front`, and an NPC with no rig at all (the bird nest is an item on
    // the floor) falls through to its portrait below.
    const set = DIVERSION_ANIMS[d.defId];
    const view: DiversionView = set?.views[d.facing] ? d.facing : 'front';
    const clips = set?.views[view];
    const clipName = walking && clips?.walk ? 'walk' : d.phase === 'here' && clips?.dance ? 'dance' : 'stand';
    const clip = clipName === 'walk' ? clips!.walk! : clipName === 'dance' ? clips!.dance! : clips?.stand;
    const animKey = clip ? diversionAnimKey(d.defId, view, clipName) : '';
    const animated = !!clip && gr.e.imageOk(animKey);

    // Only the fallback fakes a walk: the sprite bobbing and rocking on a stride it
    // does not have. With real frames the body is already doing all of that.
    // Anchored on the tile it is walking to, not on `x`, or the cadence would speed
    // up and slow down with the NPC's own position.
    const seed = d.homeX * 0.05 + d.homeY * 0.11;
    const bob = animated ? 0 : walking ? -Math.abs(Math.sin(t * 7)) * 3 : Math.sin(t * 2 + seed) * 2;
    const lean = !animated && walking ? Math.sin(t * 7) * 0.09 : 0;

    ctx.save();
    ctx.translate(d.x, d.y + bob);
    if (lean) ctx.rotate(lean);
    // The side bake walks to the right, so walking left is the same sprite mirrored.
    // A sprite drawn from its centre needs no offset to flip.
    if (d.facing === 'side' && d.facingLeft) ctx.scale(-1, 1);
    if (animated) {
      // `seed` again, as a phase offset: two of the same NPC on the board at once
      // would otherwise step in perfect lockstep.
      const fi = clipFrame(clip!, t + seed);
      const fw = set!.frameW, fh = set!.frameH;
      ctx.drawImage(gr.e.images.get(animKey)!, fi * fw, 0, fw, fh, -CLIP_BOX / 2, -CLIP_BOX / 2, CLIP_BOX, CLIP_BOX);
    } else {
      // No sheet (yet). The static portrait is baked from the same model at the same
      // three yaws, so a slow load costs the animation, not the sprite.
      const turnedKey = d.facing === 'front' ? null : `diversion_${d.defId}_${d.facing}`;
      const key = turnedKey && gr.e.imageOk(turnedKey) ? turnedKey : `diversion_${d.defId}`;
      const img = gr.e.images.get(key);
      if (gr.e.imageOk(key) && img) {
        drawImageContain(gr, ctx, img, 0, 0, PORTRAIT_BOX);
      } else {
        // Nothing loaded at all. Something still has to be clickable where the ring
        // says it is, so fall back to a plain marker rather than empty ground.
        ctx.fillStyle = '#ffd45e';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Overhead text, in OSRS's own yellow-on-black-shadow. A walkby says its line —
    // that IS the whole of a walkby. The rest get named, so the player can tell a
    // genie from a nest without walking over to it. Nobody talks on the way in or
    // out: a line that arrived before they did would be shouted from off the board.
    if (d.phase !== 'here') continue;
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

/** How long a balloon takes to fade in on its spot, ms. */
const BALLOON_FADE_MS = 200;
/** Box a balloon is drawn in, logic px: smaller than a visitor, so a handful of them
 *  reads as what Pete left behind rather than a second crowd. */
const BALLOON_BOX = 28;

/**
 * Party Pete's balloons, lying on the ground where he left them until someone pops
 * one: the pose the Party Room's own drop animation lands them in. They fade in one
 * after another. Drawn first, under the payouts and the visitors.
 */
function drawPartyBalloons(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const list = gr.e.balloons;
  if (list.length === 0) return;
  const now = performance.now();
  for (const b of list) {
    if (now < b.born) continue;
    const k = Math.min(1, (now - b.born) / BALLOON_FADE_MS);
    ctx.save();
    ctx.globalAlpha = 0.25 * k;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 3, 11, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = k;
    ctx.translate(b.x, b.y - BALLOON_BODY_LIFT);
    const key = `party_balloon_${b.variant}`;
    const img = gr.e.images.get(key);
    if (gr.e.imageOk(key) && img) {
      drawImageContain(gr, ctx, img, 0, 0, BALLOON_BOX);
    } else {
      ctx.fillStyle = '#e04040';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** How far a payout rises over its whole life, logic px. */
const POP_RISE = 24;

/**
 * What a click just paid, rising off the spot it was paid at: the reward's own icon
 * and a green `+N`, fading out over the back half of its rise. Drawn before the
 * visitors so a payout never hides the next one to click. Gold reads number first,
 * then coins, like every price in the game.
 */
function drawDiversionPops(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const pops = gr.e.diversionPops;
  if (pops.length === 0) return;
  const now = performance.now();
  const s = gr.e.uiScale;
  const icon = 16 * s;
  const gap = 3 * s;
  for (const p of pops) {
    const k = (now - p.born) / DIVERSION_POP_MS;
    if (k < 0 || k >= 1) continue;
    const text = `+${p.reward.amount}`;
    const key = rewardImageKey(p.reward);
    const img = gr.e.imageOk(key) ? gr.e.images.get(key) : undefined;
    ctx.save();
    ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    ctx.font = `bold ${13 * s}px 'RuneScape', Arial`;
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const w = img ? tw + gap + icon : tw;
    const y = p.y - 30 - POP_RISE * k;
    let x = p.x - w / 2;
    const iconFirst = p.reward.kind !== 'gold';
    if (img && iconFirst) {
      drawImageContain(gr, ctx, img, x + icon / 2, y, icon);
      x += icon + gap;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = '#4be23c';
    ctx.fillText(text, x, y);
    if (img && !iconFirst) drawImageContain(gr, ctx, img, x + tw + gap + icon / 2, y, icon);
    ctx.restore();
  }
}

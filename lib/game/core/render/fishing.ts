import type { GameRenderer } from '../renderer';
import { GRID } from '../engine-state';
import { spotStage, wavesUntilRestock } from '../../systems/fishing';
import { liquidPalette } from './terrain';

/** How long one frame of a spot's strip holds. Sequence 7634 runs eight frames of
 *  five game units each, and a unit is 20 ms — so the loop closes in 800 ms, the
 *  speed the client itself plays the water at. */
const FRAME_MS = 100;

/** The glow a pool with fish in it carries. Cyan rather than the biome's own foam:
 *  Morytania's foam is swamp-olive, and a green halo would read as a ripe herb.
 *  Lava takes its own, because cyan over molten rock reads as a bug. */
const GLOW = '120,226,255';
const GLOW_LAVA = '255,176,58';

/** How long a pool takes to change its look: one OSRS tick. A spot that has just been
 *  fished out fades from the busy treatment into the quiet one, and a restocked pool
 *  fades back. This is presentation, not simulation, so it runs off the wall clock. */
const FADE_MS = 600;

/**
 * One spot, in one of the two looks a pool has, each off its own sheet. The cache
 * bakes the ordinary spot and the Tempoross one from the same bubble model but at
 * different alpha, so the sprites already differ the way the game differs them: the
 * busy pool is white foam, the spent one dark ripples the water reads through.
 * The drawing leans the rest of the way. A pool with fish left in it glows, breathes
 * and bobs, and gets a second pass to carry the halo. A spent one gets one pass, no
 * halo to invite a cast, and sits smaller and still.
 *
 * The clip itself is played as a continuous thing rather than eight slides. Each
 * frame dissolves into the next instead of replacing it, and the loop rides a slow
 * swell of opacity that is at its lowest exactly where the strip wraps — so the
 * water breathes, and the seam where the last frame meets the first has nothing to
 * pop against.
 */
function drawSpot(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  x: number,
  y: number,
  ready: boolean,
  t: number,
  alpha: number,
  glow: string,
): void {
  if (alpha <= 0.01) return;
  // The strip is square cells laid left to right, so its own geometry gives the frame
  // count — nothing records how many there are, and a re-bake with a longer clip
  // cannot fall out of step.
  const cell = sheet.height;
  const frames = Math.max(1, Math.round(sheet.width / cell));
  // Where the loop stands, as one continuous number: which frame is up, how far it
  // has travelled towards the next one, and where the whole loop is in its breath.
  const pos = ((t * 1000) / FRAME_MS) % frames;
  const f = Math.floor(pos);
  const blend = pos - f;
  const next = (f + 1) % frames;
  // A cosine of the loop's own phase, so the swell is continuous across the wrap:
  // it bottoms out at the seam and is fullest halfway through the clip. Shallow on
  // purpose — this is water moving, not a thing blinking on and off.
  const breath = 0.78 + 0.22 * (0.5 - 0.5 * Math.cos((pos / frames) * Math.PI * 2));
  const a = alpha * breath;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + x * 0.03 + y * 0.05);
  const size = GRID * (ready ? 0.9 + pulse * 0.06 : 0.78);
  const dx = x - size / 2;
  const dy = y - size / 2 + (ready ? Math.sin(t * 1.8 + x * 0.05) * 1.6 : 0);

  // One frame dissolving into the next: the frame that is up, then the one after it
  // laid over at how far the clip has come, which is a cross-dissolve cheap enough to
  // run twice for the halo pass.
  const paint = () => {
    ctx.globalAlpha = a;
    ctx.drawImage(sheet, f * cell, 0, cell, cell, dx, dy, size, size);
    if (blend > 0.001) {
      ctx.globalAlpha = a * blend;
      ctx.drawImage(sheet, next * cell, 0, cell, cell, dx, dy, size, size);
    }
  };

  ctx.save();
  if (ready) {
    // Faint, and deliberately fainter than a ripe herb's halo: fish in a pool is an
    // invitation, not the alarm a crop about to be lost is. One pass, where the
    // allotment stacks three.
    ctx.shadowColor = `rgba(${glow},${0.28 + pulse * 0.18})`;
    ctx.shadowBlur = 5;
    paint();
    ctx.shadowBlur = 0;
    paint();
  } else {
    // No dimming here: the plain sheet is already faint, because that faintness is
    // the cache's own answer for what a spot with nothing in it looks like.
    paint();
  }
  ctx.restore();
}

/**
 * The fishing spots and the cast bar — the only parts of the water that move.
 * The pool underneath is baked into the static background (`render/terrain.ts`).
 *
 * A pool with fish left in it breaks the water like a Tempoross Cove spot; a spent
 * one keeps breaking it, quietly, the way any ordinary fishing spot does — its own
 * sprite, not a dimmed copy of the busy one — and carries the wave count it is
 * waiting on in the same corner and the same type as an allotment's. Neither look ever cuts to the other: a pool crosses between them over
 * one tick, the old one fading out on the tile it was standing on while the new one
 * fades in on the tile the pool holds now.
 */
export function drawFishing(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const spots = gr.e.fishingSpots;
  if (spots.length === 0) return;
  const t = performance.now() / 1000;
  const idle = !gr.e.waveActive && !gr.e.gameOver;
  const busy = gr.e.imageOk('fishing_spot_active') ? gr.e.images.get('fishing_spot_active') : null;
  const spent = gr.e.imageOk('fishing_spot') ? gr.e.images.get('fishing_spot') : null;
  // Lava holds one sheet where water holds two, so a spent lava pool is the same
  // sprite drawn quieter — `drawSpot` already sits it smaller and still.
  const lava = gr.e.imageOk('fishing_spot_lava') ? gr.e.images.get('fishing_spot_lava') : null;
  const sheetFor = (r: boolean, molten: boolean) => (molten ? lava : r ? busy : spent);
  const now = performance.now();

  // A new run brings new pools under new ids. Drop the fade state of any that have
  // gone, so a long session's worth of restarts cannot pile up in the map.
  if (gr.spotFade.size > spots.length) {
    const live = new Set(spots.map((s) => s.id));
    for (const id of gr.spotFade.keys()) if (!live.has(id)) gr.spotFade.delete(id);
  }

  for (const spot of spots) {
    const ready = spotStage(spot) === 'ready' && !gr.e.gameOver;
    const molten = spot.liquid === 'lava';
    // Every ring, bar and halo on this tile takes the pool's own colours, so a lava
    // spot is never outlined in the region's water blue.
    const { ripple, foam } = liquidPalette(gr, spot.liquid);
    const glow = molten ? GLOW_LAVA : GLOW;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + spot.x * 0.03 + spot.y * 0.05);

    // Where this pool is in the crossing between its two looks. A spot seen for the
    // first time starts already arrived — the board should not fade itself in on the
    // first frame of a run — and every later change of look or tile starts a fade,
    // with the old look and the old tile kept as the ghost to fade out.
    let fade = gr.spotFade.get(spot.id);
    if (!fade) {
      fade = { ready, x: spot.x, y: spot.y, from: null, at: 0 };
      gr.spotFade.set(spot.id, fade);
    } else if (fade.ready !== ready || fade.x !== spot.x || fade.y !== spot.y) {
      fade.from = { ready: fade.ready, x: fade.x, y: fade.y };
      fade.ready = ready;
      fade.x = spot.x;
      fade.y = spot.y;
      fade.at = now;
    }
    let k = 1;
    if (fade.from) {
      k = Math.min(1, (now - fade.at) / FADE_MS);
      if (k >= 1) fade.from = null;
    }

    // The water breaking, off the cache-rendered NPC — the Tempoross spot while there
    // are fish left to break it, the ordinary one once there are not, and both at once
    // while the pool is crossing from one to the other.
    const ghost = fade.from ? sheetFor(fade.from.ready, molten) : null;
    if (fade.from && ghost) {
      drawSpot(ctx, ghost, fade.from.x, fade.from.y, fade.from.ready, t, 1 - k, glow);
    }
    const sheet = sheetFor(ready, molten);
    if (sheet) drawSpot(ctx, sheet, spot.x, spot.y, ready, t, k, glow);

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
      ctx.globalAlpha = (0.14 + pulse * 0.16) * k;
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
      ctx.globalAlpha = k;
      ctx.strokeText(`${left}`, tx, ty);
      ctx.globalAlpha = 0.85 * k;
      ctx.fillStyle = '#ffd45e';
      ctx.fillText(`${left}`, tx, ty);
      ctx.globalAlpha = 1;
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

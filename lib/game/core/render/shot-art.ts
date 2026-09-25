import type { HitsplatKind } from '../engine';
import { spotAnimDurationS, type SpotAnimMeta } from '../../data/spotanims';
import { HITSPLAT_COLORS } from './shared';

/**
 * The art of a shot, its impact and its hitsplat, drawn onto any 2D context
 * with no renderer behind it. The board draws through these, and so does the
 * start screen's lobby, so a stray shot there looks exactly like one in a wave.
 * Sizes are board pixels; a caller at another scale sets the transform first.
 */

/** Frame of a spotanim sheet `elapsedMs` into it: clamped to the last frame, or
 *  wrapped round for a sheet that loops (a spell's flight). */
export function spotAnimFrame(meta: SpotAnimMeta, elapsedMs: number, loop = false): number {
  let rem = elapsedMs * meta.speed;
  if (loop) rem %= meta.frameMs.reduce((a, b) => a + b, 0);
  let fi = 0;
  for (; fi < meta.frames - 1; fi++) {
    if (rem < meta.frameMs[fi]) break;
    rem -= meta.frameMs[fi];
  }
  return fi;
}

/**
 * A one-shot spotanim (an impact, a flash) `ageS` seconds in, centred on (x, y)
 * at side `size`. Drawn additively for the energy GFX, with a short fade at the
 * tail so it dissolves rather than cutting off.
 */
export function drawSpotAnimGfx(
  ctx: CanvasRenderingContext2D, img: CanvasImageSource, meta: SpotAnimMeta,
  ageS: number, x: number, y: number, size: number,
) {
  const fi = spotAnimFrame(meta, ageS * 1000);
  const prog = ageS / spotAnimDurationS(meta);
  const fade = prog > 0.7 ? Math.max(0, 1 - (prog - 0.7) / 0.3) : 1;
  ctx.save();
  // 'add' glows (energy/light GFX); 'alpha' is the client's plain
  // translucency — dark GFX (smoke/shadow) vanish under additive.
  ctx.globalCompositeOperation = meta.blend === 'add' ? 'lighter' : 'source-over';
  ctx.globalAlpha = 0.92 * fade;
  ctx.drawImage(img, fi * meta.frameW, 0, meta.frameW, meta.frameH, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

/** Motion trail: a fading streak through the recent positions, `width` at its head. */
export function drawShotTrail(
  ctx: CanvasRenderingContext2D, trail: ReadonlyArray<{ x: number; y: number }>, color: string, width: number,
) {
  if (trail.length < 2) return;
  const alpha = ctx.globalAlpha;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  for (let i = 1; i < trail.length; i++) {
    ctx.globalAlpha = alpha * (i / trail.length) * 0.5;
    ctx.lineWidth = (i / trail.length) * width;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
}

/**
 * The archer's procedural dragon arrow, at the origin pointing +x: rotate the
 * context to the flight angle first. Dark shaft, crimson dragon-metal head with
 * a bright edge, red fletching.
 */
export function drawDragonArrow(ctx: CanvasRenderingContext2D) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4a3320'; // shaft (dark wood)
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(7, 0);
  ctx.stroke();
  ctx.fillStyle = '#a3242a'; // fletching (crimson feathers)
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-11, -3); ctx.lineTo(-4, -1); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-11, 3); ctx.lineTo(-4, 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5e1414'; // arrowhead (dark dragon metal)
  ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(6, -3.5); ctx.lineTo(6, 3.5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#c2483c'; // bright leading edge
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(6, -3.5); ctx.moveTo(11, 0); ctx.lineTo(6, 3.5); ctx.stroke();
}

/** A plain bolt (tzhaar / slayer / toxic), at the origin pointing +x. */
export function drawPlainBolt(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(-8, -1, 16, 2);
}

/** A glowing ball: the magic or cannon shot with no flight sprite. */
export function drawShotGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Where a hitsplat sprite's painted blob sits in its image box, as the offset
 * (fractions of the box) that, added to the -w/2/-h/2 corner, lands the blob's
 * centre on the origin. Reads pixels, so callers cache it per sprite.
 */
export function splatBlobAnchor(img: HTMLImageElement): { ox: number; oy: number } {
  const w = img.naturalWidth, h = img.naturalHeight;
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return { ox: 0, oy: 0 };
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    let minX = w, maxX = -1, minY = h, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return { ox: 0, oy: 0 };
    return { ox: (w / 2 - (minX + maxX + 1) / 2) / w, oy: (h / 2 - (minY + maxY + 1) / 2) / h };
  } catch {
    return { ox: 0, oy: 0 }; // tainted or unreadable — leave the splat image-centred
  }
}

/** Splat size tracks the number: a 1-digit poke reads smaller than a 3-digit
 *  slam, so big hits shout and chip damage whispers. */
export function splatScale(value: number, minor = false): number {
  const digits = Math.abs(Math.trunc(value)).toString().length;
  return (minor ? 0.7 : 1) * (digits <= 1 ? 0.82 : digits === 2 ? 1 : 1.18);
}

/**
 * An OSRS hitsplat centred on (x, y) — the real interface sprite with the value
 * in white on top, or the Template:Hitsplat-coloured lozenge while the sprite
 * hasn't decoded (`img` null).
 */
export function paintSplat(
  ctx: CanvasRenderingContext2D, x: number, y: number, value: number, kind: HitsplatKind, s: number,
  img: HTMLImageElement | null, anchor: { ox: number; oy: number },
) {
  ctx.save();
  ctx.translate(x, y);
  if (img) {
    // The sprites are ~24px; draw at 1.25× so values stay legible at game zoom.
    const dw = img.naturalWidth * 1.25 * s;
    const dh = img.naturalHeight * 1.25 * s;
    // Centre the painted blob (not the image box) on the origin so the value,
    // which is drawn at the origin below, sits in the middle of the splat.
    ctx.imageSmoothingEnabled = false; // keep the pixel art crisp
    ctx.drawImage(img, -dw / 2 + anchor.ox * dw, -dh / 2 + anchor.oy * dh, dw, dh);
    ctx.imageSmoothingEnabled = true;
  } else {
    const hw = 14 * s; // half width
    const hh = 10 * s; // half height
    const p = 5 * s; // point inset
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    ctx.lineTo(-hw + p, -hh);
    ctx.lineTo(hw - p, -hh);
    ctx.lineTo(hw, 0);
    ctx.lineTo(hw - p, hh);
    ctx.lineTo(-hw + p, hh);
    ctx.closePath();
    ctx.fillStyle = HITSPLAT_COLORS[kind] ?? HITSPLAT_COLORS.hit;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
  }
  // The value in the OSRS pixel font — no synthetic bold (it smears the
  // pixels) and the client's hard 1px drop shadow instead of a blur.
  // Centre optically from the measured glyph bounds rather than trusting
  // baseline metrics, which sit pixel fonts visibly off-centre.
  const text = String(value);
  ctx.font = `${Math.round(14 * s)}px 'RuneScape', Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(text);
  const yOff = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillText(text, 1, yOff + 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 0, yOff);
  ctx.restore();
}

import type { HitsplatKind } from '../engine';
import { SPOTANIMS } from '../../data/spotanims';
import type { GameRenderer } from '../renderer';
import { HITSPLAT_COLORS, drawImageContain } from './shared';

/**
 * What combat throws off: projectiles in flight, particles, the procedural
 * behaviour FX, and the hitsplats — OSRS's own splat sprites, anchored on the
 * painted blob rather than the image box.
 */

export function splatAnchor(gr: GameRenderer, key: string, img: HTMLImageElement): { ox: number; oy: number } {
  const cached = gr.splatAnchorCache.get(key);
  if (cached) return cached;
  const w = img.naturalWidth, h = img.naturalHeight;
  let anchor = { ox: 0, oy: 0 };
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      let minX = w, maxX = -1, minY = h, maxY = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 16) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      if (maxX >= 0) {
        // Offset that, added to the -dw/2/-dh/2 corner, lands the blob's
        // centre (not the image's) on the origin.
        anchor = { ox: (w / 2 - (minX + maxX + 1) / 2) / w, oy: (h / 2 - (minY + maxY + 1) / 2) / h };
      }
    }
  } catch { /* tainted or unreadable — leave the splat image-centred */ }
  gr.splatAnchorCache.set(key, anchor);
  return anchor;
}

export function drawProjectiles(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const p of gr.e.projectiles) {
    // Motion trail: a fading streak through the recent positions.
    const trail = p.trail;
    if (trail && trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = p.color;
      for (let i = 1; i < trail.length; i++) {
        ctx.globalAlpha = (i / trail.length) * 0.5;
        ctx.lineWidth = (i / trail.length) * (p.type === 'cannonball' ? 5 : 3);
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = p.color;
    if (p.type === 'arrow') {
      const target = gr.e.enemies.find(en => en.id === p.targetId);
      const angle = target
        ? Math.atan2(target.y - p.y, target.x - p.x)
        : Math.atan2((p.destY ?? p.y) - p.y, (p.destX ?? p.x) - p.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      if (p.arrowIcon) {
        // Archer: a single procedural dragon arrow, drawn pointing +x — i.e.
        // already along the travel direction (we rotated to `angle`), so no
        // sprite/orientation guesswork. Dragon look: dark shaft, crimson
        // dragon-metal head with a bright edge, red fletching.
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
      } else {
        ctx.fillRect(-8, -1, 16, 2); // plain bolt (tzhaar / slayer / toxic)
      }
      ctx.restore();
    } else if (p.projAnim && SPOTANIMS[p.projAnim] && gr.e.imageOk(`spotanim_${p.projAnim}`)) {
      // The spell's REAL flight GFX from the cache — a looping baked spotanim
      // riding the bolt (frame picked from game time so all bolts animate).
      // Sheets are baked side-on with the nose pointing +x, so rotate the
      // sprite to the live flight angle — same convention as the arrows.
      const meta = SPOTANIMS[p.projAnim];
      let rem = (gr.e.runSeconds * 1000 * meta.speed) % meta.frameMs.reduce((a, b) => a + b, 0);
      let fi = 0;
      for (; fi < meta.frames - 1; fi++) {
        if (rem < meta.frameMs[fi]) break;
        rem -= meta.frameMs[fi];
      }
      const target = gr.e.enemies.find(en => en.id === p.targetId);
      const angle = target
        ? Math.atan2(target.y - p.y, target.x - p.x)
        : Math.atan2((p.destY ?? p.y) - p.y, (p.destX ?? p.x) - p.x);
      const img = gr.e.images.get(`spotanim_${p.projAnim}`)!;
      const s = meta.size;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.drawImage(img, fi * meta.frameW, 0, meta.frameW, meta.frameH, -s / 2, -s / 2, s, s);
      ctx.restore();
    } else if (p.spellIcon && gr.e.imageOk(`spell_${p.spellIcon}`)) {
      // Fallback: the spell's icon sprite, with a coloured glow.
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      drawImageContain(gr, ctx, gr.e.images.get(`spell_${p.spellIcon}`)!, p.x, p.y, 18);
      ctx.restore();
    } else {
      // glow for magic/cannon shots
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.type === 'cannonball' ? 4 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export function drawParticles(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  // Pass 1: solid physical debris (shatter motes), drawn normally.
  for (const p of gr.e.particles) {
    if (p.twinkle) continue;
    const t = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = t * t; // ease-out for a softer tail
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.size ?? 2.5) * (0.6 + t * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  // Pass 2: mystical arcane sparks — additive shimmering 4-point stars that glow
  // in the element's colour, laid over the debris for the "magic" sheen.
  ctx.globalCompositeOperation = 'lighter';
  for (const p of gr.e.particles) {
    if (!p.twinkle) continue;
    const t = Math.max(0, p.life / p.maxLife);
    const flicker = 0.55 + 0.45 * Math.sin(p.life * 42 + p.x); // twinkle
    ctx.globalAlpha = Math.min(1, t * 1.2) * flicker;
    ctx.fillStyle = p.color;
    drawSpark(gr, ctx, p.x, p.y, (p.size ?? 2.5) * (0.7 + t * 0.7));
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** A four-point arcane sparkle (a slim star) — the magical accent on spell hits. */
export function drawSpark(gr: GameRenderer, ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const w = r * 0.28; // waist of the star points
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + w, y - w);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - w, y + w);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - w, y - w);
  ctx.closePath();
  ctx.fill();
}

/** Procedural roguelite VFX: expanding rings (cleave / shockwave / heal) and
 *  jagged energy bolts (ricochet / pierce / chain-freeze jump). */
export function drawFx(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const f of gr.e.fx) {
    const t = Math.min(1, f.age / f.life); // 0 → 1 over its life
    if (f.kind === 'ring') {
      const r = f.r0 + (f.r1 - f.r0) * (1 - (1 - t) * (1 - t)); // ease-out expand
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.width * (1 - t * 0.5);
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 6;
      strokeBolt(gr, ctx, f.x0, f.y0, f.x1, f.y1);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/** A jagged lightning-style polyline between two points (re-jittered each frame
 *  so a short-lived bolt flickers like energy). */
export function strokeBolt(gr: GameRenderer, ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const segs = 5;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // unit perpendicular
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    const off = (Math.random() - 0.5) * 12;
    ctx.lineTo(x0 + dx * k + nx * off, y0 + dy * k + ny * off);
  }
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function drawHitsplats(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  // Direct hits last so they sit on top of any DoT splats drifting below.
  const splats = [...gr.e.hitsplats].sort((a, b) => Number(!!b.minor) - Number(!!a.minor));
  for (const h of splats) {
    ctx.globalAlpha = Math.min(1, h.life / 0.3) * (h.minor ? 0.92 : 1); // fade near the end
    drawSplat(gr, ctx, h.x, h.y, h.value, h.kind, !!h.minor);
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw an OSRS hitsplat — the real interface sprite (cache-extracted, keyed
 * `hitsplat_<kind>`) with the value in white on top. Falls back to the
 * Template:Hitsplat-coloured lozenge while the sprite hasn't decoded.
 */
export function drawSplat(gr: GameRenderer, 
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: number,
  kind: HitsplatKind,
  minor = false,
) {
  // Splat size tracks the number: a 1-digit poke reads smaller than a
  // 3-digit slam, so big hits shout and chip damage whispers.
  const digits = Math.abs(Math.trunc(value)).toString().length;
  const s = (minor ? 0.7 : 1) * (digits <= 1 ? 0.82 : digits === 2 ? 1 : 1.18);
  ctx.save();
  ctx.translate(x, y);
  if (gr.e.imageOk(`hitsplat_${kind}`)) {
    const img = gr.e.images.get(`hitsplat_${kind}`)!;
    // The sprites are ~24px; draw at 1.25× so values stay legible at game zoom.
    const dw = img.naturalWidth * 1.25 * s;
    const dh = img.naturalHeight * 1.25 * s;
    // Centre the painted blob (not the image box) on the origin so the value,
    // which is drawn at the origin below, sits in the middle of the splat.
    const a = splatAnchor(gr, `hitsplat_${kind}`, img);
    ctx.imageSmoothingEnabled = false; // keep the pixel art crisp
    ctx.drawImage(img, -dw / 2 + a.ox * dw, -dh / 2 + a.oy * dh, dw, dh);
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

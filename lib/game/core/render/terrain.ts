import { SPOTANIMS, spotAnimDurationS } from '../../data/spotanims';
import { distance } from '../../systems/geometry';
import type { GameRenderer } from '../renderer';
import { GRID, shade, hash2 } from './shared';

/**
 * The board itself: biome ground, terrain features, the road and its gravel, and
 * the spawn portal. The static half is baked into an offscreen canvas once per
 * map (see `bgCache` on the renderer) and blitted every frame.
 */

export function drawBackground(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const w = gr.e.width;
  const h = gr.e.height;
  const scale = gr.e.deviceScale;
  if (
    gr.bgCache === null || gr.bgCtx === null ||
    gr.bgTerrain !== gr.e.terrain || gr.bgBiome !== gr.e.biome.id ||
    gr.bgW !== w || gr.bgH !== h || gr.bgScale !== scale
  ) {
    if (!gr.bgCache) {
      gr.bgCache = document.createElement('canvas');
      gr.bgCtx = gr.bgCache.getContext('2d');
    }
    // Cache at the board's displayed resolution so the static terrain/grid is
    // crisp too, then scale the buffer's context so it still draws in logic units.
    gr.bgCache.width = Math.round(w * scale);
    gr.bgCache.height = Math.round(h * scale);
    if (gr.bgCtx) {
      gr.bgCtx.setTransform(scale, 0, 0, scale, 0, 0);
      renderStaticBackground(gr, gr.bgCtx, w, h);
    }
    gr.bgTerrain = gr.e.terrain;
    gr.bgBiome = gr.e.biome.id;
    gr.bgW = w;
    gr.bgH = h;
    gr.bgScale = scale;
  }
  // The parent ctx is already scaled by `deviceScale`; draw the buffer back into
  // the logic rect so it lands 1:1 on the backing store.
  ctx.drawImage(gr.bgCache, 0, 0, w, h);
}

export function renderStaticBackground(gr: GameRenderer, ctx: CanvasRenderingContext2D, w: number, h: number) {
  const biome = gr.e.biome;

  // Ground base with a soft vertical gradient (biome-themed).
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, biome.bgTop);
  grad.addColorStop(1, biome.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Texture: scattered ground tufts (two tones) for a less flat field.
  for (let i = 0; i < 220; i++) {
    const x = (i * 137.5) % w;
    const y = (i * 224.7) % h;
    ctx.fillStyle = i % 3 === 0 ? biome.tuft[0] : biome.tuft[1];
    ctx.fillRect(x, y, 2, 2);
    ctx.fillRect(x + 2, y + 2, 2, 4);
  }

  drawTerrain(gr, ctx);

  // Faint tile grid (biome-tinted).
  ctx.strokeStyle = biome.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += GRID) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += GRID) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/**
 * Draw the run's terrain field (from the engine): non-buildable zones as textured
 * rough ground, hard obstacles as shaded boulders, and cosmetic scenery (bushes /
 * rocks / flowers / grass) on open ground — all derived from the active biome's
 * palette, so obstacles read as impassable while the field re-skins per region.
 * Rendered once per run into the background cache, so it can afford the detail.
 */
export function drawTerrain(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const t = gr.e.terrain;
  if (t.cols === 0) return;
  const { bush, rock, rockHi, flowers } = gr.e.biome.decor;
  const rockDark = shade(rock, 0.6);
  const rockCrack = shade(rock, 0.45);
  const bushDark = shade(bush, 0.62);
  const bushLight = shade(bush, 1.28);
  const cols = t.cols;

  // ── Non-buildable zones: rough ground — a soft tint plus scattered grass blades,
  // so it reads as marshy/overgrown terrain you can't build on (not a flat wash). ──
  for (let i = 0; i < t.tiles.length; i++) {
    if (t.tiles[i] !== 'unbuildable') continue;
    const c = i % cols;
    const r = (i / cols) | 0;
    const x0 = c * GRID;
    const y0 = r * GRID;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = bush;
    ctx.fillRect(x0, y0, GRID, GRID);
    ctx.globalAlpha = 0.5;
    for (let b = 0; b < 5; b++) {
      const bx = x0 + hash2(c * 7.1 + b, r * 3.3) * GRID;
      const by = y0 + 6 + hash2(c * 2.7, r * 9.4 + b) * (GRID - 8);
      const len = 4 + hash2(c + b, r) * 4;
      const lean = (hash2(c * 5.5, r * 4.2 + b) - 0.5) * 3;
      ctx.strokeStyle = b % 2 === 0 ? bushDark : bushLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + lean, by - len);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ── Hard obstacles: shaded boulders that fill the tile (impassable). Per-tile
  // variation keeps a cluster of tiles reading as one lumpy rock formation. ──
  for (let i = 0; i < t.tiles.length; i++) {
    if (t.tiles[i] !== 'blocked') continue;
    const c = i % cols;
    const r = (i / cols) | 0;
    const cx = c * GRID + GRID / 2;
    const cy = r * GRID + GRID / 2;
    const s = 0.82 + hash2(c * 1.7, r * 2.3) * 0.24; // per-boulder size
    const rx = GRID * 0.46 * s;
    const ry = GRID * 0.4 * s;

    // cast shadow, offset down-right
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx + 2.5, cy + 3.5, rx, ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // dark base
    ctx.fillStyle = rockDark;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // main body, faceted with a couple of lumps
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    const lumps = 1 + ((c + r) % 2);
    for (let l = 0; l < lumps; l++) {
      const lx = cx + (hash2(c * 3.1 + l, r) - 0.5) * rx;
      const ly = cy - ry * 0.15 + (hash2(c, r * 3.7 + l) - 0.5) * ry * 0.5;
      ctx.beginPath();
      ctx.ellipse(lx, ly, rx * 0.42, ry * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // top-left highlight facet
    ctx.fillStyle = rockHi;
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.3, cy - ry * 0.35, rx * 0.34, ry * 0.26, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // a dark crack and a fleck of moss
    ctx.strokeStyle = rockCrack;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + rx * 0.1, cy - ry * 0.2);
    ctx.lineTo(cx + rx * 0.25, cy + ry * 0.45);
    ctx.stroke();
    if (hash2(c * 8.1, r * 6.3) > 0.55) {
      ctx.fillStyle = bushDark;
      ctx.beginPath();
      ctx.arc(cx - rx * 0.4, cy + ry * 0.35, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Cosmetic decorations on open ground, jittered off the grid. ──
  for (const d of t.decorations) {
    const jx = (hash2(d.col * 12.9, d.row * 7.1) - 0.5) * GRID * 0.5;
    const jy = (hash2(d.col * 3.7, d.row * 19.3) - 0.5) * GRID * 0.5;
    const x = d.col * GRID + GRID / 2 + jx;
    const y = d.row * GRID + GRID / 2 + jy;
    if (d.kind === 0 || d.kind === 1) {
      // leafy bush: shaded underside, body, top highlight, a couple of berries
      ctx.fillStyle = bushDark;
      ctx.beginPath();
      ctx.arc(x, y + 2, 7, 0, Math.PI * 2);
      ctx.arc(x + 6, y + 3, 5, 0, Math.PI * 2);
      ctx.arc(x - 5, y + 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bush;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.arc(x + 5, y + 1, 4, 0, Math.PI * 2);
      ctx.arc(x - 4, y + 1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bushLight;
      ctx.beginPath();
      ctx.arc(x - 2, y - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flowers[(d.col + d.row) % flowers.length];
      ctx.beginPath();
      ctx.arc(x + 3, y - 1, 1.3, 0, Math.PI * 2);
      ctx.arc(x - 3, y + 2, 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === 2) {
      // small boulder with shadow + highlight
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + 1.5, y + 2.5, 7, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rockDark;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rockHi;
      ctx.beginPath();
      ctx.ellipse(x - 2, y - 1.5, 2.4, 1.6, -0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === 3) {
      // flower: stem + petals + centre
      ctx.strokeStyle = bushDark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = flowers[(d.col + d.row) % flowers.length];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = bushLight;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // grass tuft: a fan of blades
      for (let b = 0; b < 5; b++) {
        const lean = (b - 2) * 2.2;
        ctx.strokeStyle = b % 2 === 0 ? bush : bushLight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x + lean, y - 5 - (b % 2));
        ctx.stroke();
      }
    }
  }
}

export function drawPath(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const path = gr.e.path;
  if (path.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  };
  const road = gr.e.biome.road;
  const layers: [number, string][] = [
    [50, road.shadow],   // faint ground shadow rim
    [46, road.border],   // dark border
    [40, road.mid],      // mid surface
    [32, road.walked],   // walked path
  ];
  for (const [width, color] of layers) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    trace();
  }
  // Lighter packed centre where the traffic wears the surface thin.
  ctx.strokeStyle = road.centre;
  ctx.lineWidth = 18;
  trace();
  drawRoadGravel(gr, ctx);
}

/**
 * Grit scattered across the road surface.
 *
 * This used to be a dashed line straight down the centre — which is a *car*
 * road's lane marking, and read as one: nothing in RuneScape paints a stripe on
 * a dirt track. A worn track is scattered gravel instead, spread across the full
 * width rather than lined up along the middle.
 *
 * Placement is hashed off the stone's index, not `Math.random`, so the same road
 * draws identically every frame — grit that danced between frames would be worse
 * than the stripe. Spacing is measured in real arc length, so a corner gets the
 * same stone density as a straight, and the biome's own `road.dash` colour keeps
 * each region's palette.
 */
export function drawRoadGravel(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const path = gr.e.path;
  const hash = (n: number) => {
    const v = Math.sin(n) * 43758.5453;
    return v - Math.floor(v);
  };
  ctx.fillStyle = gr.e.biome.road.dash;
  const STEP = 13;      // arc-length between stones
  const HALF_WIDTH = 15; // keep them on the packed surface, off the border
  let carried = 0;      // leftover distance from the previous segment
  let i = 0;            // stone index — the hash seed, so it never repeats a pattern
  for (let s = 1; s < path.length; s++) {
    const ax = path[s - 1].x, ay = path[s - 1].y;
    const len = distance(ax, ay, path[s].x, path[s].y);
    if (len <= 0) continue;
    const ux = (path[s].x - ax) / len, uy = (path[s].y - ay) / len;
    for (let d = STEP - carried; d < len; d += STEP, i++) {
      // Lateral offset across the road, and a size that varies stone to stone.
      const off = (hash(i * 12.9898) * 2 - 1) * HALF_WIDTH;
      const r = 1 + hash(i * 78.233) * 1.8;
      ctx.beginPath();
      ctx.arc(ax + ux * d - uy * off, ay + uy * d + ux * off, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Carry the remainder so spacing doesn't reset at every path vertex.
    carried = (len + carried) % STEP;
  }
}

/**
 * Spawn portal at the road's entry point. The real OSRS Pest Control void
 * portal (NPC 1739), baked to a looping sprite sheet and played here at the
 * portal point, over a soft procedural halo. Drawn *before* enemies so they
 * materialise out of its glowing face. Falls back to a procedural vortex if
 * the baked sheet hasn't loaded.
 */
export function drawSpawnPortal(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  const path = gr.e.path;
  if (path.length < 2) return;
  const t = performance.now() / 1000;
  const pp = gr.e.portalPoint; // on-screen point where enemies materialise
  // The road can now enter from any edge, so face the portal along the road's
  // heading (path[0] → path[1]) instead of always standing it upright. Keep the
  // half-crop on the entry edge (the axis the road crosses) and clamp along the
  // edge so the disc never slides off a corner.
  const a = path[0];
  const b = path[1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const x = horizontal ? pp.x : Math.max(56, Math.min(gr.e.width - 56, pp.x));
  const y = horizontal ? Math.max(56, Math.min(gr.e.height - 56, pp.y)) : pp.y;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);

  ctx.save();
  ctx.translate(x, y);

  // Soft otherworldly halo behind the disc, breathing with the pulse (drawn before
  // the rotation — it's a radial gradient, so orientation doesn't matter).
  const haloR = 64 + pulse * 6;
  const halo = ctx.createRadialGradient(0, 0, 6, 0, 0, haloR);
  halo.addColorStop(0, `rgba(170,90,235,${0.34 + pulse * 0.16})`);
  halo.addColorStop(0.5, `rgba(120,60,190,${0.12 + pulse * 0.07})`);
  halo.addColorStop(1, 'rgba(110,50,180,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Orient the disc/vortex to the road heading. The sprite's default (unrotated)
  // face points along +x, which is the classic left→right entry, so ang=0 leaves
  // those maps exactly as before.
  ctx.rotate(ang);

  const portal = SPOTANIMS.portal;
  if (gr.e.imageOk('spotanim_portal')) {
    // Looping baked void-portal disc — current frame from wall-clock time.
    const img = gr.e.images.get('spotanim_portal')!;
    const total = spotAnimDurationS(portal) * 1000;
    let rem = ((performance.now() % total) + total) % total;
    let fi = 0;
    for (; fi < portal.frames - 1; fi++) {
      if (rem < portal.frameMs[fi]) break;
      rem -= portal.frameMs[fi];
    }
    const s = portal.size + pulse * 4;
    ctx.drawImage(img, fi * portal.frameW, 0, portal.frameW, portal.frameH, -s / 2, -s / 2, s, s);
    ctx.restore();
    return;
  }

  // ---- Fallback: procedural vortex (until the baked sheet loads) ----------
  const RX = 26 + pulse * 2;
  const RY = 50 + pulse * 3;

  // 2) Inward-rippling tunnel: vertical ellipses that continuously march toward
  // the throat (phase wraps over time) and fade at both ends, so the energy
  // reads as being *pulled in* — the classic portal funnel.
  const RINGS = 6;
  for (let i = 0; i < RINGS; i++) {
    const phase = ((i / RINGS) + t * 0.35) % 1; // 0 at rim → 1 at throat
    const k = 1 - phase * 0.85; // radius fraction: rim (1) → throat (~0.15)
    const fade = Math.sin(phase * Math.PI); // fade in at rim, out at throat
    const r = Math.round(150 + 90 * k);
    const g = Math.round(50 + 25 * (1 - k));
    const b = Math.round(180 + 50 * k);
    ctx.save();
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 1.5 + k * 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, RX * k, RY * k, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 2b) Two spiral arms slowly rotating, to give the swirl a clear direction.
  ctx.save();
  ctx.rotate(t * 0.8);
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#c98bff';
  ctx.lineWidth = 2;
  for (let arm = 0; arm < 2; arm++) {
    ctx.beginPath();
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const ang = arm * Math.PI + s * Math.PI * 1.6;
      const ex = Math.cos(ang) * RX * s;
      const ey = Math.sin(ang) * RY * s;
      if (s === 0) ctx.moveTo(ex, ey);
      else ctx.lineTo(ex, ey);
    }
    ctx.stroke();
  }
  ctx.restore();

  // 3) Bright energy rim around the gateway mouth.
  ctx.save();
  ctx.globalAlpha = 0.55 + pulse * 0.3;
  ctx.strokeStyle = '#d59bff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 4) A couple of bright sparks orbiting the throat (clipped to the mouth).
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let k = 0; k < 5; k++) {
    const a = t * 1.6 + (k * Math.PI * 2) / 5;
    const rr = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.9 + k * 1.7));
    const ex = Math.cos(a) * RX * rr;
    const ey = Math.sin(a) * RY * rr;
    ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + k);
    ctx.fillStyle = k % 2 ? '#e9c6ff' : '#8be0ff';
    ctx.beginPath();
    ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 5) Dark throat at the centre — the mouth enemies emerge from, drawn last so
  // freshly-spawned (still materialising) mobs read as stepping out of it.
  const mouth = ctx.createRadialGradient(0, 0, 1, 0, 0, RX * 0.85);
  mouth.addColorStop(0, 'rgba(6,2,14,0.95)');
  mouth.addColorStop(0.6, 'rgba(26,11,42,0.6)');
  mouth.addColorStop(1, 'rgba(52,23,72,0)');
  ctx.save();
  ctx.scale(1, RY / RX);
  ctx.fillStyle = mouth;
  ctx.beginPath();
  ctx.arc(0, 0, RX * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * Baked spotanim (GFX) effects — one-shot sprite-sheet animations the engine
 * queues at a point (e.g. the teleport-gem flash as an enemy materialises).
 * Drawn additively ('lighter') for the in-game energy glow, with a short
 * fade-out at the tail so it dissolves rather than cutting off.
 */
export function drawEffects(gr: GameRenderer, ctx: CanvasRenderingContext2D) {
  for (const fx of gr.e.spotEffects) {
    const meta = SPOTANIMS[fx.slug];
    const key = `spotanim_${fx.slug}`;
    if (!meta || !gr.e.imageOk(key)) continue;
    const img = gr.e.images.get(key)!;

    // Current frame from accumulated per-frame timings (scaled by speed).
    let rem = fx.age * 1000 * meta.speed;
    let fi = 0;
    for (; fi < meta.frames - 1; fi++) {
      if (rem < meta.frameMs[fi]) break;
      rem -= meta.frameMs[fi];
    }
    const prog = fx.age / spotAnimDurationS(meta);
    const fade = prog > 0.7 ? Math.max(0, 1 - (prog - 0.7) / 0.3) : 1;

    ctx.save();
    // 'add' glows (energy/light GFX); 'alpha' is the client's plain
    // translucency — dark GFX (smoke/shadow) vanish under additive.
    ctx.globalCompositeOperation = meta.blend === 'add' ? 'lighter' : 'source-over';
    ctx.globalAlpha = 0.92 * fade;
    const s = meta.size * (fx.scale ?? 1);
    ctx.drawImage(img, fi * meta.frameW, 0, meta.frameW, meta.frameH, fx.x - s / 2, fx.y - s / 2, s, s);
    ctx.restore();
  }
}

/**
 * Shared software rasteriser for the offline OSRS cache bakers
 * (render-osrs-spotanims / render-osrs-npc-anims / render-osrs-npcs / items).
 *
 * Fixes and features over the old per-script copies:
 *  - **Unsigned face alpha.** The cache stores per-face alpha as a byte; the
 *    loader hands it back as a *signed* int8, so translucent faces (e.g. the
 *    128+ range every energy/GFX effect uses) went negative, and `255 - alpha`
 *    clamped them to fully opaque — THE "white box" bug. All spell impacts are
 *    big stacks of ~44%-alpha white faces; drawn opaque they merge into a slab.
 *    Masking with `& 0xff` restores the client's translucent layering.
 *  - **Textured faces.** Faces with `faceTextures[f] != -1` are filled with the
 *    real cache texture (index 9 def → index 8 sprite), affine-mapped through
 *    the loader's precomputed per-corner UVs, wrapped via a repeating pattern
 *    (PMN texture planes legally exceed [0,1]). Black texels are the client's
 *    transparent palette slot. A singular mapping falls back to the texture's
 *    average colour so degenerate faces never vanish.
 */
import { createCanvas } from 'canvas';
import { IndexType, ConfigType } from 'osrscachereader';

// ----------------------------------------------------------- OSRS HSL palette
const HUE_OFFSET = 0.5 / 64;
const SATURATION_OFFSET = 0.5 / 8;
const BRIGHTNESS = 0.7;

export function hslToRgb(hsl) {
  const hue = ((hsl >> 10) & 63) / 64 + HUE_OFFSET;
  const sat = ((hsl >> 7) & 7) / 8 + SATURATION_OFFSET;
  const lum = (hsl & 127) / 128;
  const chroma = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = lum - chroma / 2;
  let r = m, g = m, b = m;
  switch (Math.trunc(hue * 6)) {
    case 0: r += chroma; g += x; break;
    case 1: g += chroma; r += x; break;
    case 2: g += chroma; b += x; break;
    case 3: b += chroma; g += x; break;
    case 4: b += chroma; r += x; break;
    default: r += chroma; b += x; break;
  }
  return [r, g, b].map((c) => Math.min(255, Math.pow(Math.max(c, 0), BRIGHTNESS) * 255));
}

/** Rotate (yaw about Y, pitch about X) then orthographically project a vertex. */
export function project(x, y, z, sy, cy, sp, cp) {
  const rx = x * cy - z * sy;
  let rz = x * sy + z * cy;
  const ry = y * cp - rz * sp;
  rz = y * sp + rz * cp;
  return [rx, ry, rz];
}

export function percentile(arr, q) {
  const s = Float64Array.from(arr).sort();
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i];
}

/** Compute one shared fit (scale + centre) from every vertex of every frame, so
 *  animation frames line up and the subject never jitters in scale. */
export function computeFit(frames, sy, cy, sp, cp, size, margin = 0.08) {
  const allX = [], allY = [];
  for (const verts of frames) {
    for (const v of verts) {
      const [a, b] = project(v[0], v[1], v[2], sy, cy, sp, cp);
      allX.push(a); allY.push(b);
    }
  }
  const TRIM = 0.01;
  const xLo = percentile(allX, TRIM), xHi = percentile(allX, 1 - TRIM);
  const yLo = percentile(allY, TRIM), yHi = percentile(allY, 1 - TRIM);
  const robustH = (yHi - yLo) || 1, robustW = (xHi - xLo) || 1;
  const usable = size * (1 - 2 * margin);
  return { scale: usable / Math.max(robustH, robustW), cx: (xLo + xHi) / 2, cy: (yLo + yHi) / 2 };
}

// ------------------------------------------------------------------- textures

/**
 * Load the cache textures a model references into repeat-pattern-ready canvases.
 * Returns Map<texId, { canvas, w, h, avg: [r,g,b] }> — `avg` is the fallback
 * fill for degenerate UV mappings. Black texels (the transparent palette slot)
 * become alpha-0 pixels. Unknown ids are skipped (caller falls back to colour).
 */
export async function loadTextures(cache, texIds) {
  const out = new Map();
  for (const id of new Set(texIds)) {
    if (id === -1 || id === undefined) continue;
    try {
      // Texture defs all live in index 9 / archive 0, one file per texture id.
      const texFile = await cache.getFile(IndexType.TEXTURES.id, 0, id).catch(() => null);
      const def = texFile?.def;
      const spriteId = def?.fileIds?.[0];
      if (spriteId === undefined) continue;
      const sprFile = await cache.getFile(IndexType.SPRITES.id, spriteId);
      const sprite = sprFile?.def?.sprites?.[0];
      if (!sprite?.pixels?.length) continue;
      const w = sprite.getWidth(), h = sprite.getHeight();
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(w, h);
      let rSum = 0, gSum = 0, bSum = 0, nOpaque = 0;
      for (let i = 0; i < w * h; i++) {
        const px = sprite.pixels[i];
        const r = (px >> 16) & 0xff, g = (px >> 8) & 0xff, b = px & 0xff;
        const opaque = (px & 0xffffff) !== 0; // black = the transparent slot
        img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = opaque ? 255 : 0;
        if (opaque) { rSum += r; gSum += g; bSum += b; nOpaque++; }
      }
      ctx.putImageData(img, 0, 0);
      const n = Math.max(1, nOpaque);
      out.set(id, { canvas, w, h, avg: [rSum / n, gSum / n, bSum / n] });
    } catch { /* missing texture → colour fallback */ }
  }
  return out;
}

/** Every texture id a model's faces reference (deduped, -1 excluded). */
export function modelTextureIds(model) {
  return [...new Set((model.faceTextures ?? []).filter((t) => t !== -1 && t !== undefined))];
}

// ------------------------------------------------------------------ animation

/**
 * Like `model.loadAnimation`, but ALSO applies the sequence's **type-5 alpha
 * transforms** — the transparency animation osrscachereader parses but never
 * applies. Spell GFX rely on it heavily: e.g. Ice Barrage's white veil is baked
 * ~44% translucent and *animated* toward invisible; without type 5 it renders
 * as a solid slab all clip long (the other half of the "white box" bug).
 *
 * Returns `{ vertexData, lengths, alphaData }` where `alphaData[frame]` is a
 * per-face unsigned alpha array (or null when that frame has no alpha
 * transform — caller falls back to the model's static faceAlphas).
 * Client rule: `alpha = clamp(faceAlpha + dx * 8)` per label group.
 */
export async function loadAnimationWithAlpha(cache, model, animationId) {
  const seq = (await cache.getFile(IndexType.CONFIGS.id, ConfigType.SEQUENCE.id, animationId)).def;
  if (seq.animMayaID !== undefined && seq.animMayaID !== -1) {
    // Maya-rigged sequences carry no classic alpha transforms — plain path.
    const anim = await model.loadAnimation(cache, animationId);
    return { ...anim, alphaData: null };
  }
  const frames = await Promise.all(
    seq.frameIDs.map((frameId) => cache.getDef(IndexType.FRAMES.id, frameId >> 16, frameId & 0xffff)),
  );
  const baseAlphas = new Array(model.faceCount).fill(0).map((_, f) => (model.faceAlphas?.[f] ?? 0) & 0xff);
  const vertexData = [];
  const alphaData = [];
  for (const frame of frames) {
    vertexData.push(model.loadFrame(model, frame, true).vertices);
    let alphas = null;
    const fm = frame.framemap;
    for (let j = 0; j < frame.translator_x.length; j++) {
      const t = frame.indexFrameIds[j];
      if (fm.types[t] !== 5) continue;
      if (!alphas) alphas = baseAlphas.slice();
      const dx = frame.translator_x[j];
      for (const label of fm.frameMaps[t]) {
        const faces = model.faceLabelsAlpha?.[label];
        if (!faces) continue;
        for (const f of faces) alphas[f] = Math.max(0, Math.min(255, alphas[f] + dx * 8));
      }
    }
    alphaData.push(alphas);
  }
  return { vertexData, lengths: seq.frameLengths, alphaData };
}

// ------------------------------------------------------------------ rendering

/**
 * Render one frame's (possibly animated) vertices into a size×size canvas and
 * return its ImageData. `fit`/angles come from computeFit so frames align.
 * `textures` is the loadTextures map (optional — flat colours without it).
 * `alphaOverride` is loadAnimationWithAlpha's per-face alpha for this frame
 * (optional — the model's static faceAlphas otherwise).
 */
export function renderModelFrame(model, verts, fit, sy, cy, sp, cp, size, textures, alphaOverride, cull = true) {
  const n = verts.length;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [a, b, c] = project(verts[i][0], verts[i][1], verts[i][2], sy, cy, sp, cp);
    px[i] = a; py[i] = b; pz[i] = c;
  }
  const sx = (i) => size / 2 + (px[i] - fit.cx) * fit.scale;
  const syc = (i) => size / 2 + (py[i] - fit.cy) * fit.scale;

  const L = [-0.4, -0.5, -0.75];
  const Lmag = Math.hypot(...L);

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const fa = model.faceVertexIndices1, fb = model.faceVertexIndices2, fc = model.faceVertexIndices3;
  const order = [];
  for (let f = 0; f < model.faceCount; f++) {
    order.push([f, (pz[fa[f]] + pz[fb[f]] + pz[fc[f]]) / 3]);
  }
  order.sort((p, q) => q[1] - p[1]);

  for (const [f] of order) {
    const renderType = model.faceRenderTypes ? (model.faceRenderTypes[f] ?? 0) : 0;
    if (renderType === 2) continue; // hidden face
    // Face alpha is a *byte* — the loader hands back signed int8s, so mask.
    // 255 = fully transparent (invisible), 0 = opaque.
    const alpha = alphaOverride ? alphaOverride[f] : (model.faceAlphas?.[f] ?? 0) & 0xff;
    if (alpha >= 254) continue; // 254 quantises to invisible too

    const i1 = fa[f], i2 = fb[f], i3 = fc[f];
    // Flat lighting from the face normal (screen space).
    const ux = px[i2] - px[i1], uy = py[i2] - py[i1], uz = pz[i2] - pz[i1];
    const vx = px[i3] - px[i1], vy = py[i3] - py[i1], vz = pz[i3] - pz[i1];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nmag = Math.hypot(nx, ny, nz) || 1;
    const dot = (nx * L[0] + ny * L[1] + nz * L[2]) / (nmag * Lmag);
    const shade = 0.6 + 0.4 * Math.abs(dot);

    const x1 = sx(i1), y1 = syc(i1), x2 = sx(i2), y2 = syc(i2), x3 = sx(i3), y3 = syc(i3);
    // Client-style backface culling: OSRS models are authored with consistent
    // winding and the software rasteriser skips faces wound away from the
    // camera. Without this, a model's BACK (e.g. a kiteshield's wooden rear)
    // paints over its front wherever the painter's depth sort ties.
    if (cull && (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1) >= 0) continue;
    ctx.globalAlpha = (255 - alpha) / 255;

    const texId = model.faceTextures?.[f] ?? -1;
    const tex = texId !== -1 ? textures?.get(texId) : undefined;
    if (tex) {
      // Client rule: a texture replaces the face colour's hue/sat but KEEPS its
      // lightness (& 127, linear multiply in the texture raster). Most textured
      // faces are authored at L127 (no-op); e.g. Magic shortbow (i)'s string is
      // L49 — pale-yellow texture 34 lit down to the dark strand the client shows.
      const texLight = ((model.faceColors[f] ?? 127) & 127) / 127;
      drawTexturedTriangle(ctx, model, f, tex, shade * texLight, x1, y1, x2, y2, x3, y3);
    } else {
      const hsl = model.faceColors[f];
      if (hsl === undefined || hsl < 0) continue;
      const [r, g, b] = hslToRgb(hsl);
      ctx.fillStyle = `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Fill one screen triangle with a cache texture, affine-mapped through the
 * loader's per-corner UVs (faceTextureU/VCoordinates), then darken by `shade`.
 * UVs may exceed [0,1] (PMN planes), so the fill is a repeating pattern.
 */
function drawTexturedTriangle(ctx, model, f, tex, shade, x1, y1, x2, y2, x3, y3) {
  const U = model.faceTextureUCoordinates?.[f], V = model.faceTextureVCoordinates?.[f];
  const fallback = () => {
    const [r, g, b] = tex.avg;
    ctx.fillStyle = `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
    ctx.fill();
  };
  if (!U || !V) return fallback();
  // Texture-space corners (texels).
  const tx1 = U[0] * tex.w, ty1 = V[0] * tex.h;
  const tx2 = U[1] * tex.w, ty2 = V[1] * tex.h;
  const tx3 = U[2] * tex.w, ty3 = V[2] * tex.h;
  // Solve the affine M mapping texture space → screen space.
  const a1 = tx2 - tx1, b1 = ty2 - ty1;
  const a2 = tx3 - tx1, b2 = ty3 - ty1;
  const det = a1 * b2 - a2 * b1;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) return fallback();
  const e1 = x2 - x1, f1 = y2 - y1;
  const e2 = x3 - x1, f2 = y3 - y1;
  const ma = (e1 * b2 - e2 * b1) / det;
  const mc = (e2 * a1 - e1 * a2) / det;
  const mb = (f1 * b2 - f2 * b1) / det;
  const md = (f2 * a1 - f1 * a2) / det;
  const me = x1 - ma * tx1 - mc * ty1;
  const mf = y1 - mb * tx1 - md * ty1;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
  ctx.clip();
  ctx.transform(ma, mb, mc, md, me, mf);
  ctx.fillStyle = ctx.createPattern(tex.canvas, 'repeat');
  // Cover the UV triangle's bbox (texel units) with the repeating pattern.
  const lox = Math.floor(Math.min(tx1, tx2, tx3)) - 1, hix = Math.ceil(Math.max(tx1, tx2, tx3)) + 1;
  const loy = Math.floor(Math.min(ty1, ty2, ty3)) - 1, hiy = Math.ceil(Math.max(ty1, ty2, ty3)) + 1;
  ctx.fillRect(lox, loy, hix - lox, hiy - loy);
  ctx.restore();
  // Client-style lighting: darken the textured face by its shade inside the tri.
  if (shade < 0.999) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
    ctx.clip();
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * (1 - shade);
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.min(x1, x2, x3), Math.min(y1, y2, y3), Math.abs(Math.max(x1, x2, x3) - Math.min(x1, x2, x3)) + 1, Math.abs(Math.max(y1, y2, y3) - Math.min(y1, y2, y3)) + 1);
    ctx.globalAlpha = ga;
    ctx.restore();
  }
}

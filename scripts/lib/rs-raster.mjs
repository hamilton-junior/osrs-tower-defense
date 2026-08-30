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
 *  - **Gouraud shading.** The client shades per *vertex* and interpolates across
 *    the face; a flat per-face shade only passes while the cell is small enough
 *    to blur the seams away. Baked bigger, every triangle of a spell burst turns
 *    into a visible facet — the mesh showing through art that is smooth in game.
 *    Vertex normals are averaged from the faces meeting at each vertex, the way
 *    `Model.calculateVertexNormals` does, and the interpolation is exact: a
 *    scalar shade across a triangle is an affine field, so its level sets are
 *    parallel straight lines and one canvas linear gradient reproduces it with no
 *    error. Faces the cache marks flat (render type 1) stay flat.
 *  - **Supersampling.** Optional `ss`: render the cell at `size * ss` and box it
 *    down. Polygon silhouettes are the other half of "the mesh is showing" — a
 *    hard-edged triangle outline reads as geometry even when the shading across
 *    it is smooth. Averaged in premultiplied alpha, so translucent GFX stacks do
 *    not pull black in at their edges. It also takes over antialiasing entirely:
 *    the canvas's own is switched off while supersampling, because per-triangle
 *    antialiasing is what draws the wireframe (see below).
 *  - **No per-triangle antialiasing.** Faces are drawn one at a time, so canvas
 *    antialiasing smooths each triangle against whatever is already there — and
 *    two triangles sharing an edge each cover about half of the pixels along it.
 *    Composited one after the other at face alpha `a`, a shared-edge pixel ends
 *    up at `a - a*a/4` instead of `a`: every interior edge of the mesh comes out
 *    a shade lighter than the faces it joins. On an opaque model that is a hint;
 *    on a translucent one — an Ice Barrage veil is a slab of ~44%-alpha faces —
 *    it is a visible wireframe drawn over the spell. Rasterising hard-edged
 *    makes adjacent triangles tile exactly, and the supersample box-down puts
 *    the smooth edges back on the silhouette where they belong.
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
      // animSpeed/animDir: the client's texture animation (a u/v scroll of
      // `animationSpeed` px per 20ms engine tick along `animationDirection`).
      // 0/0 = static. Bakers that animate (item APNGs) read these; everything
      // else ignores them.
      out.set(id, {
        canvas, w, h, avg: [rSum / n, gSum / n, bSum / n],
        animSpeed: def?.animationSpeed ?? 0, animDir: def?.animationDirection ?? 0,
      });
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
export function renderModelFrame(model, verts, fit, sy, cy, sp, cp, size, textures, alphaOverride, cull = true, ss = 1) {
  const S = size * ss;
  const n = verts.length;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [a, b, c] = project(verts[i][0], verts[i][1], verts[i][2], sy, cy, sp, cp);
    px[i] = a; py[i] = b; pz[i] = c;
  }
  // `fit` is computed for the final cell, so a supersampled render is the same
  // framing at ss times the resolution — nothing about the crop changes.
  const sx = (i) => S / 2 + (px[i] - fit.cx) * fit.scale * ss;
  const syc = (i) => S / 2 + (py[i] - fit.cy) * fit.scale * ss;

  const L = [-0.4, -0.5, -0.75];
  const Lmag = Math.hypot(...L);

  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  // Hard-edged only when the box-down is there to antialias for us; a cell baked
  // at 1x still wants the canvas's antialiasing, seams and all.
  if (ss > 1) ctx.antialias = 'none';

  const fa = model.faceVertexIndices1, fb = model.faceVertexIndices2, fc = model.faceVertexIndices3;
  // Vertex normals: every face meeting a vertex, summed. A model that wants a hard
  // edge duplicates the vertex, so this smooths exactly what the artist meant to be
  // smooth — the same contract the client relies on.
  const vnx = new Float64Array(n), vny = new Float64Array(n), vnz = new Float64Array(n);
  for (let f = 0; f < model.faceCount; f++) {
    const a1 = fa[f], a2 = fb[f], a3 = fc[f];
    const ux = px[a2] - px[a1], uy = py[a2] - py[a1], uz = pz[a2] - pz[a1];
    const vx = px[a3] - px[a1], vy = py[a3] - py[a1], vz = pz[a3] - pz[a1];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nmag = Math.hypot(nx, ny, nz);
    if (!nmag) continue;
    for (const i of [a1, a2, a3]) {
      vnx[i] += nx / nmag; vny[i] += ny / nmag; vnz[i] += nz / nmag;
    }
  }
  /** The shade at one vertex, or `flat` where it has no usable normal. */
  const vertexShade = (i, flat) => {
    const m = Math.hypot(vnx[i], vny[i], vnz[i]);
    if (m < 1e-6) return flat;
    const d = (vnx[i] * L[0] + vny[i] * L[1] + vnz[i] * L[2]) / (m * Lmag);
    return 0.6 + 0.4 * Math.abs(d);
  };
  const order = [];
  for (let f = 0; f < model.faceCount; f++) {
    order.push([f, (pz[fa[f]] + pz[fb[f]] + pz[fc[f]]) / 3]);
  }
  // Depth alone can't order a model whose parts are coplanar: an amulet's gem
  // sits *inside* its setting, both discs within a unit of each other, and a
  // painter's sort picks whichever face happened to come first. The cache
  // answers that with faceRenderPriorities, and the client's Model.draw walks
  // the priority groups in ascending order, using depth only *within* a group.
  // So priority is the primary key wherever the model carries one — that is
  // what puts the gem on top of the setting (and the clasp on top of both).
  const prio = model.faceRenderPriorities;
  if (prio) order.sort((p, q) => (prio[p[0]] & 0xff) - (prio[q[0]] & 0xff) || q[1] - p[1]);
  else order.sort((p, q) => q[1] - p[1]);

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
      // Render type 1 is the cache's own "keep this face flat"; everything else gets
      // the interpolated shade the client would give it.
      ctx.fillStyle = renderType === 1
        ? `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`
        : shadeGradient(
            ctx, r, g, b,
            x1, y1, vertexShade(i1, shade),
            x2, y2, vertexShade(i2, shade),
            x3, y3, vertexShade(i3, shade),
          );
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const img = ctx.getImageData(0, 0, S, S);
  return ss === 1 ? img : boxDown(img, size, ss);
}

/**
 * A triangle's shade as one linear gradient.
 *
 * The shade is a single scalar over the triangle with a value at each corner, so it
 * is an affine field `s = a*x + b*y + c`: its contours are parallel straight lines
 * perpendicular to `(a, b)`, which is exactly what a canvas linear gradient paints.
 * Anchoring the ramp at the darkest corner and running it `(hi - lo)/|(a,b)|` pixels
 * along `(a, b)` puts the far stop precisely on the brightest corner — so this is not
 * an approximation of Gouraud, it is Gouraud.
 *
 * A degenerate triangle, or one whose corners agree, falls back to a flat fill.
 */
function shadeGradient(ctx, r, g, b, x1, y1, s1, x2, y2, s2, x3, y3, s3) {
  const rgb = (s) => `rgb(${Math.round(r * s)},${Math.round(g * s)},${Math.round(b * s)})`;
  const lo = Math.min(s1, s2, s3), hi = Math.max(s1, s2, s3);
  const det = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
  if (!det || hi - lo < 1 / 512) return rgb((s1 + s2 + s3) / 3);
  const ga = ((s2 - s1) * (y3 - y1) - (s3 - s1) * (y2 - y1)) / det;
  const gb = ((s3 - s1) * (x2 - x1) - (s2 - s1) * (x3 - x1)) / det;
  const mag2 = ga * ga + gb * gb;
  if (!mag2) return rgb((s1 + s2 + s3) / 3);
  const [ax, ay] = s1 === lo ? [x1, y1] : s2 === lo ? [x2, y2] : [x3, y3];
  const k = (hi - lo) / mag2;
  const grad = ctx.createLinearGradient(ax, ay, ax + ga * k, ay + gb * k);
  grad.addColorStop(0, rgb(lo));
  grad.addColorStop(1, rgb(hi));
  return grad;
}

/** Box-filter a supersampled cell down to its final size, averaging in premultiplied
 *  alpha so a translucent edge does not pull black in with it. */
function boxDown(img, size, ss) {
  const out = createCanvas(size, size).getContext('2d').createImageData(size, size);
  const n = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const s = (((y * ss + dy) * img.width) + x * ss + dx) * 4;
          const al = img.data[s + 3];
          r += img.data[s] * al; g += img.data[s + 1] * al; b += img.data[s + 2] * al; a += al;
        }
      }
      const d = (y * size + x) * 4;
      out.data[d] = a ? Math.round(r / a) : 0;
      out.data[d + 1] = a ? Math.round(g / a) : 0;
      out.data[d + 2] = a ? Math.round(b / a) : 0;
      out.data[d + 3] = Math.round(a / n);
    }
  }
  return out;
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

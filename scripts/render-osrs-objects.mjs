/**
 * Offline scenery (LOC / object) renderer — companion to render-osrs-npcs.mjs.
 * Rasterises 3D **object models** (trees, farming patches, the dwarf
 * multicannon assembly stages) from the cache to PNGs so scenery icons no
 * longer hot-link the wiki.
 *
 * Pipeline: raw object config → parseObjectDef (opcode walker) → model ids →
 * merge (ModelGroup) → recolour → shared rs-raster rasterise → PNG into
 * public/assets/objects/<slug>.png. Build-time/offline only.
 *
 *   node scripts/render-osrs-objects.mjs                # render every TARGET
 *   node scripts/render-osrs-objects.mjs --only tree    # render one TARGET
 *
 * Why a hand-rolled parser: osrscachereader 1.1.3's ObjectLoader desyncs on
 * the current cache (object model ids outgrew 16 bits; the old model opcodes
 * 1/5 were replaced by **6** = u8 count × (u32 model + u8 type) and **7** =
 * u8 count × u32 model). We patch the loader so getFile doesn't throw, then
 * walk the bytes ourselves. Layout confirmed against known defs (Dwarf
 * multicannon → model 2328, cannon base/stand/barrels → 1800/1801/1802).
 */
import { RSCache, IndexType, ConfigType, ModelGroup } from 'osrscachereader';
import { createCanvas } from 'canvas';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { renderModelFrame, loadTextures, modelTextureIds, computeFit } from './lib/rs-raster.mjs';

// Survive the lib's opcode desync: getFile keeps the raw bytes we parse below.
const ObjectLoader = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules/osrscachereader/src/cacheReader/loaders/ObjectLoader.js')).href)).default;
const origLoad = ObjectLoader.prototype.load;
ObjectLoader.prototype.load = function (bytes, id) {
  try { return origLoad.call(this, bytes, id); } catch { return { id }; }
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

const SIZE = 256;
/** Supersampling: render each cell this many times over and box it down. Cache models
 *  are low-poly, so their hard polygon silhouettes read as "the mesh is showing" long
 *  before their shading does. Costs bake time only — the output size is unchanged. */
const SS = 2;
const MARGIN = 0.12;

/**
 * Render targets: slug → object id (+ optional camera overrides).
 * Ground-plane scenery (farming patches) needs a high pitch to read at all.
 */
const TARGETS = {
  tree: { obj: 1276 },                        // classic "Tree" (Chop down)

  // Cannon tower tier icons — four *distinct*, fully-built cannons (a
  // half-assembled multicannon firing made no sense), weakest → strongest:
  // the Goblin paint cannon (2014 event; item 12727's model — no placed LOC
  // exists, so borrow the multicannon def purely as the config shell), the
  // ship cannon (Cabin Fever, armed), the Dwarf multicannon, and the
  // Shattered Relics ornament-kit multicannon.
  // Yaws picked from an 8-way contact sheet so every cannon reads side-on
  // with the muzzle to the RIGHT (the game's canonical facing) — a tower
  // model must look like it's aiming down the lane, not at the camera.
  goblin_paint_cannon: { obj: 6, models: [3075], yaw: 45 },
  ship_cannon: { obj: 11214, yaw: 45 },
  dwarf_multicannon: { obj: 6, yaw: 225 },
  shattered_cannon: { obj: 43027, yaw: 225 },

  // The allotment's ground (patch shell 8550/8150). patch_empty is a raked-soil
  // overlay quad coplanar with the black base quad; the client separates them by
  // render priority, our painter sort can't — so render just the brown tilled-soil
  // overlay (model 8223). Ground-decor quads are wound for the client's no-cull
  // decor path, so backface culling must be off or the quad vanishes.
  //
  // Straight down (pitch 90) and square to the axes (yaw 0): the board is top-down,
  // and at the isometric default the quad landed as a diamond squeezed into a tile,
  // which is most of why players couldn't tell a patch from the grass.
  //
  // `margin: 0` because this one is not a portrait of an object — it is a floor,
  // and the drawing code stretches the whole PNG across one tile. At the default
  // 12% the soil came out inset on every side, so the tile's own edge fell on
  // empty pixels and the plot had no border to read.
  //
  // `groundTex` is the last piece. Model 8223 is two untextured triangles: the
  // client paints it in one flat colour and lets the *ground* under it carry the
  // grain, which our board has no equivalent of, so the plot arrived as a plain
  // olive square that a green herb icon disappeared into. Texture 32 is OSRS's own
  // dirt, multiplied over the model's own colour — every pixel still comes out of
  // the cache, and the herb now sits on soil instead of on a swatch.
  //
  // The crop stages are NOT baked. Objects 8558/8559/8562 are the *potato* ladder,
  // and the board grows whatever seed the player bought — so what stands in the
  // soil is that seed's own item icon (core/render/farming.ts), not scenery.
  patch_empty: { obj: 8573, pitch: 90, yaw: 0, models: [8223], cull: false, margin: 0, groundTex: 32, groundTile: 128 },

  // The water a fishing spot sits in — the farming patch's soil, for the sea.
  //
  // There is no LOC to render here: water in OSRS is a **ground overlay**, and its
  // look is texture 1, the classic blue the client scrolls across every river and
  // shoreline. So this target names a texture instead of an object, and what comes
  // out is that texture tiled edge-to-edge over the same 256 square every other
  // ground bake fills. No model means no silhouette to clip to and no flat colour to
  // multiply back, which is the point: the patch's olive tint is what makes soil read
  // as soil, and the same treatment turned the sea brown.
  water: { tex: 1, tile: 128 },

  // The wooden direction signpost — the one standing beside the Lumbridge Guide,
  // and OSRS's own symbol for "the road splits here". Model 1402 is shared by every
  // classic signpost def; 15522 is just the shell we read it out of. Yaw 0 on
  // purpose: swept 0/20/40/60/90, and only flat-on keeps the board wide enough to
  // read at the 1.4em the travel modal draws it.
  signpost: { obj: 15522, yaw: 0 },

  /**
   * **The Bandos symbol**, cut out of his own altar (LOC 26366): the god's sigil stands
   * on a pole above the altar's skulls, and this is the only place in the cache the
   * emblem exists as *geometry* — everywhere else (kiteshield, platebody, godsword) it
   * is a texture painted onto armour, which this flat rasteriser cannot render.
   *
   * So: face-on (yaw 180, pitch 0), then `crop` keeps the sigil and drops the altar
   * under it. It marks a body General Graardor's slam has shaken free of crowd control,
   * and lives in `ui/` because nothing in the game is this scenery object — it is an
   * interface mark that happens to be built from a piece of scenery.
   */
  bandos_symbol: { obj: 26366, yaw: 180, pitch: 0, crop: [78, 4, 182, 101], dir: 'ui' },
};

// -------------------------------------------------------- object def parsing
/** Opcode walker for the current (rev-233) object config layout. */
export function parseObjectDef(content) {
  const b = new Uint8Array(content.buffer ?? content);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u8 = () => b[p++];
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const skipStr = () => { while (b[p] !== 0) p++; p++; };
  const out = { name: '', models: [], recolorToFind: [], recolorToReplace: [] };

  for (let guard = 0; guard < 512; guard++) {
    const op = u8();
    if (op === 0) break;
    else if (op === 2) { const s = p; skipStr(); out.name = Buffer.from(b.slice(s, p - 1)).toString('latin1'); }
    else if (op === 6) { const n = u8(); for (let i = 0; i < n; i++) { out.models.push(u32()); u8(); /* type */ } }
    else if (op === 7) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u32()); }
    else if (op === 14 || op === 15 || op === 19 || op === 28 || op === 29 || op === 39 || op === 69 || op === 75 || op === 81) p += 1;
    else if (op === 17 || op === 18 || op === 21 || op === 22 || op === 23 || op === 27 || op === 62 || op === 64 || op === 73 || op === 74 || op === 89) { /* flag */ }
    else if (op === 24 || op === 61 || op === 65 || op === 66 || op === 67 || op === 68 || op === 70 || op === 71 || op === 72 || op === 78 || op === 82) p += 2;
    else if (op >= 30 && op < 35) skipStr();
    else if (op === 40 || op === 41) { const n = u8(); for (let i = 0; i < n; i++) { const f = u16(), r = u16(); if (op === 40) { out.recolorToFind.push(f); out.recolorToReplace.push(r); } } }
    else if (op === 77 || op === 92) { u16(); u16(); if (op === 92) u16(); const n = u8(); p += 2 * (n + 1); }
    else if (op === 79) { u16(); u16(); u8(); const n = u8(); p += 2 * n; }
    else if (op === 249) { const n = u8(); for (let i = 0; i < n; i++) { const isS = u8() === 1; p += 3; if (isS) skipStr(); else p += 4; } }
    else { console.warn(`  ! unknown object opcode ${op} at ${p - 1} — stopping parse`); break; }
  }
  return out;
}

// --------------------------------------------------------------- model render
export async function buildObjectModel(cache, def, modelOverride) {
  const models = [];
  for (const mid of modelOverride ?? def.models) {
    const m = await cache.getDef(IndexType.MODELS, mid).catch(() => null);
    if (m) models.push(m);
  }
  if (!models.length) return null;
  const merged = models.length === 1 ? models[0] : new ModelGroup(models).getMergedModel();
  if (def.recolorToFind?.length) {
    const map = new Map();
    def.recolorToFind.forEach((f, i) => map.set(f & 0xffff, def.recolorToReplace[i] & 0xffff));
    for (let i = 0; i < merged.faceColors.length; i++) {
      const r = map.get(merged.faceColors[i] & 0xffff);
      if (r !== undefined) merged.faceColors[i] = r;
    }
  }
  return merged;
}

/**
 * The merged mesh of one scenery object (LOC) id — the hand-rolled parse plus the
 * loader patch above, in one call, so anything outside this script can borrow a
 * scenery model without re-deriving either. Used by the enemy exporter when a clip
 * is animated on an object's model rather than on the NPC's own (see
 * scripts/lib/anim-source.mjs).
 */
export async function objectModelById(cache, objId, modelOverride) {
  const file = await cache.getFile(IndexType.CONFIGS, ConfigType.OBJECT, objId);
  if (!file?.content) return null;
  return buildObjectModel(cache, parseObjectDef(file.content), modelOverride);
}

/**
 * One cache texture, tiled edge-to-edge over the standard square — a floor with no
 * object standing on it. The drawing code stretches the whole PNG across one board
 * tile, so this is full-bleed by construction; `tile` decides how many times the
 * texture repeats inside that tile.
 */
function renderTextureTile(tex, tile) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < SIZE; y += tile) {
    for (let x = 0; x < SIZE; x += tile) ctx.drawImage(tex.canvas, x, y, tile, tile);
  }
  return canvas.toBuffer('image/png');
}

function renderObject(model, { yaw = 30, pitch = 12, zoom = 1, cull = true, crop, margin = MARGIN, groundTex, groundTile = 128 } = {}, textures) {
  const n = model.vertexCount;
  const verts = new Array(n);
  for (let i = 0; i < n; i++) {
    verts[i] = [model.vertexPositionsX[i], model.vertexPositionsY[i], model.vertexPositionsZ[i]];
  }
  const yawR = (yaw * Math.PI) / 180, pitchR = (pitch * Math.PI) / 180;
  const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);
  const fit = computeFit([verts], sy, cy, sp, cp, SIZE, margin);
  fit.scale *= zoom;
  const img = renderModelFrame(model, verts, fit, sy, cy, sp, cp, SIZE, textures, undefined, cull, SS);
  const canvas = createCanvas(SIZE, SIZE);
  canvas.getContext('2d').putImageData(img, 0, 0);
  if (groundTex !== undefined) paintGroundTexture(canvas, textures.get(groundTex), groundTile);
  if (!crop) return canvas.toBuffer('image/png');
  // A target that wants one *piece* of an object (the sigil off the top of an altar)
  // names the box in the 256-space above, and what comes out is that box trimmed back
  // to its own painted pixels — so the PNG's edges are the piece's edges and the
  // drawing code can centre it without carrying the parent object's empty margin.
  return cropToContent(canvas, crop);
}

/**
 * Multiply a cache texture over what was just rendered, tiled at `tile` pixels and
 * clipped back to the model's own silhouette.
 *
 * For flat floor quads only. Their faces carry no texture and no UVs, so the
 * rasteriser has nothing to map — but the client never shows them bare either; the
 * grain a player sees is the ground itself. Tiling one of OSRS's own ground textures
 * over the model's colour is the closest this flat rasteriser gets to that, and it
 * keeps every pixel cache-sourced. The texture is laid down at its own brightness —
 * it is already the colour of dug earth — and the model's flat colour is multiplied
 * back over it at a quarter strength, as a tint rather than as the base. Multiplying
 * the two at full strength lands nearly black, and at tile size that read as a hole
 * in the ground rather than as soil.
 */
function paintGroundTexture(canvas, tex, tile) {
  if (!tex) return;
  const ctx = canvas.getContext('2d');
  const flat = createCanvas(canvas.width, canvas.height);
  flat.getContext('2d').drawImage(canvas, 0, 0);
  ctx.save();
  for (let y = 0; y < canvas.height; y += tile) {
    for (let x = 0; x < canvas.width; x += tile) ctx.drawImage(tex.canvas, x, y, tile, tile);
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.25;
  ctx.drawImage(flat, 0, 0);
  ctx.globalAlpha = 1;
  // The two passes above paint the whole square; this trims them back to the shape
  // the model actually covered.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(flat, 0, 0);
  ctx.restore();
}

/** The sub-rect `[x0, y0, x1, y1]` of `canvas`, shrunk to the alpha it actually holds. */
function cropToContent(canvas, [x0, y0, x1, y1]) {
  const src = canvas.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0);
  let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (src.data[(y * src.width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return canvas.toBuffer('image/png'); // nothing in the box — keep the whole render
  const out = createCanvas(maxX - minX + 1, maxY - minY + 1);
  out.getContext('2d').drawImage(
    canvas, x0 + minX, y0 + minY, out.width, out.height, 0, 0, out.width, out.height,
  );
  return out.toBuffer('image/png');
}

// ----------------------------------------------------------------------- main
async function main() {
  if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
    console.error(`No cache at ${CACHE_DIR}\nSet OSRS_CACHE_DIR.`);
    process.exit(1);
  }
  console.log(`Loading cache: ${CACHE_DIR}`);
  const cache = new RSCache(CACHE_DIR);
  await cache.onload;

  const argv = process.argv;
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
  const yawIdx = argv.indexOf('--yaw');
  const pitchIdx = argv.indexOf('--pitch');
  const camOverride = {};
  if (yawIdx !== -1) camOverride.yaw = Number(argv[yawIdx + 1]);
  if (pitchIdx !== -1) camOverride.pitch = Number(argv[pitchIdx + 1]);

  const entries = Object.entries(TARGETS).filter(([slug]) => !only || slug === only);
  const write = (slug, cfg, buf) => {
    const dir = cfg.dir ?? 'objects';
    const outPath = join(REPO, 'public', 'assets', dir, `${slug}.png`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
    return `public/assets/${dir}/${slug}.png`;
  };
  for (const [slug, cfg] of entries) {
    // Texture-only target (a ground overlay): no object def, no model, no camera.
    if (cfg.tex !== undefined) {
      const tex = (await loadTextures(cache, [cfg.tex])).get(cfg.tex);
      if (!tex) { console.warn(`! texture ${cfg.tex} (${slug}) not found`); continue; }
      const out = write(slug, cfg, renderTextureTile(tex, cfg.tile ?? 128));
      console.log(`✓ ${slug}: texture ${cfg.tex} ${tex.w}x${tex.h} → ${out}`);
      continue;
    }
    const file = await cache.getFile(IndexType.CONFIGS, ConfigType.OBJECT, cfg.obj);
    if (!file?.content) { console.warn(`! object ${cfg.obj} (${slug}) not found`); continue; }
    const def = parseObjectDef(file.content);
    const model = await buildObjectModel(cache, def, cfg.models);
    if (!model) { console.warn(`! ${slug}: no model geometry (models=[${def.models}])`); continue; }
    const texIds = modelTextureIds(model);
    if (cfg.groundTex !== undefined) texIds.push(cfg.groundTex);
    const textures = await loadTextures(cache, texIds);
    const out = write(slug, cfg, renderObject(model, { ...cfg, ...camOverride }, textures));
    console.log(`✓ ${slug}: object ${cfg.obj} "${def.name}" models=[${def.models}] → ${out}`);
  }
  process.exit(0);
}

// Guarded: this module also exports its object-def parser and model builder, and an
// importer (the enemy glTF exporter) must not re-render every scenery PNG.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

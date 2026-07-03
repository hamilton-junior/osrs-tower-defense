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

  // Allotment patch states (morph targets of patch shell 8550/8150).
  // patch_empty is a raked-soil overlay quad coplanar with the black base
  // quad; the client separates them by render priority, our painter sort
  // can't — so render just the brown tilled-soil overlay (model 8223).
  // Ground-decor quads are wound for the client's no-cull decor path, so
  // backface culling must be off or the quad vanishes.
  patch_empty: { obj: 8573, pitch: 40, models: [8223], cull: false },
  patch_growing: { obj: 8559, pitch: 40 },    // potato plant (mid growth)
  patch_ready: { obj: 8562, pitch: 40 },      // potato, Harvest
};

// -------------------------------------------------------- object def parsing
/** Opcode walker for the current (rev-233) object config layout. */
function parseObjectDef(content) {
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
async function buildObjectModel(cache, def, modelOverride) {
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

function renderObject(model, { yaw = 30, pitch = 12, zoom = 1, cull = true } = {}, textures) {
  const n = model.vertexCount;
  const verts = new Array(n);
  for (let i = 0; i < n; i++) {
    verts[i] = [model.vertexPositionsX[i], model.vertexPositionsY[i], model.vertexPositionsZ[i]];
  }
  const yawR = (yaw * Math.PI) / 180, pitchR = (pitch * Math.PI) / 180;
  const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);
  const fit = computeFit([verts], sy, cy, sp, cp, SIZE, MARGIN);
  fit.scale *= zoom;
  const img = renderModelFrame(model, verts, fit, sy, cy, sp, cp, SIZE, textures, undefined, cull);
  const canvas = createCanvas(SIZE, SIZE);
  canvas.getContext('2d').putImageData(img, 0, 0);
  return canvas.toBuffer('image/png');
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
  for (const [slug, cfg] of entries) {
    const file = await cache.getFile(IndexType.CONFIGS, ConfigType.OBJECT, cfg.obj);
    if (!file?.content) { console.warn(`! object ${cfg.obj} (${slug}) not found`); continue; }
    const def = parseObjectDef(file.content);
    const model = await buildObjectModel(cache, def, cfg.models);
    if (!model) { console.warn(`! ${slug}: no model geometry (models=[${def.models}])`); continue; }
    const textures = await loadTextures(cache, modelTextureIds(model));
    const buf = renderObject(model, { ...cfg, ...camOverride }, textures);
    const outPath = join(REPO, 'public', 'assets', 'objects', `${slug}.png`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
    console.log(`✓ ${slug}: object ${cfg.obj} "${def.name}" models=[${def.models}] → public/assets/objects/${slug}.png`);
  }
  process.exit(0);
}

main();

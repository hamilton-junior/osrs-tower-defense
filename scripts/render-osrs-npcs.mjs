/**
 * Offline NPC-model renderer — the "model render" track companion to
 * extract-osrs-sprites.mjs. Where that script pulls flat 2D interface sprites,
 * this one rasterises the 3D **NPC models** from the cache to PNGs, so enemy
 * art no longer hot-links the wiki.
 *
 * Pipeline: getNPC(id) → model ids → merge (ModelGroup) → apply NPC recolour →
 * software-rasterise (painter's algorithm + flat directional shading, OSRS HSL
 * palette) → PNG into public/assets/models/<slug>.png. Runtime is untouched;
 * this is build-time/offline only (osrscachereader can't run in a static export).
 *
 *   node scripts/render-osrs-npcs.mjs                 # render every TARGET
 *   node scripts/render-osrs-npcs.mjs --only goblin   # render one TARGET
 *   node scripts/render-osrs-npcs.mjs --find bloodveld # discover NPC ids by name
 *
 * NPC ids come from the cache itself (--find scans names), not hard-coded guesses.
 */
import { RSCache, IndexType, ConfigType, ModelGroup } from 'osrscachereader';
import { createCanvas } from 'canvas';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

// Output canvas size; the model is auto-fit inside this with a margin.
const SIZE = 256;
const MARGIN = 0.12; // fraction of the canvas kept empty around the model

/**
 * Render targets: slug → NPC id (+ optional camera/recolour overrides).
 * `yaw`/`pitch` are degrees; defaults give a front-facing ¾ view. Start with
 * the four superior slayer variants (the ones that were wrong) plus a couple of
 * baseline mobs to sanity-check the pipeline. Fill in ids via `--find`.
 */
const TARGETS = {
  // npc: id is required; everything else optional (yaw/pitch in degrees).
  superior_bloodveld: { npc: 7397 },     // Insatiable Bloodveld
  superior_abyssal_demon: { npc: 7410 }, // Greater abyssal demon
  superior_gargoyle: { npc: 7407, cullBelowGround: true }, // Marble gargoyle (drop red ground disc)
  superior_nechryael: { npc: 7411 },     // Nechryarch
};

// ----------------------------------------------------------- OSRS HSL palette
const HUE_OFFSET = 0.5 / 64;
const SATURATION_OFFSET = 0.5 / 8;
const BRIGHTNESS = 0.7; // 0.6 = client default; nudge up so sprites read on dark UI

function hslToRgb(hsl) {
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
  // brightness curve (client raises colours to `BRIGHTNESS` power)
  return [r, g, b].map((c) => Math.min(255, Math.pow(Math.max(c, 0), BRIGHTNESS) * 255));
}

// ------------------------------------------------------------ NPC def parsing
/**
 * Parse model ids + recolour from a raw NPC config file.
 *
 * Why we don't use `cache.getNPC().models`: in the current LIVE cache, model
 * ids outgrew 16 bits, so OSRS moved them from the old opcode 1 (u8 count +
 * u16 ids) to **opcode 61** (u8 count + **u32** ids). osrscachereader 1.1.3
 * predates this, so its NpcLoader yields an empty `models` for every NPC. We
 * walk the byte stream ourselves and read opcode 61 (and the still-u16
 * recolour opcode 40); everything else we let the lib handle.
 */
function parseNpcDef(content) {
  const b = new Uint8Array(content.buffer ?? content);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u8 = () => b[p++];
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const i8 = () => dv.getInt8(p++);
  const skipStr = () => { while (b[p] !== 0) p++; p++; };
  const out = { models: [], recolorToFind: [], recolorToReplace: [] };

  for (let guard = 0; guard < 512; guard++) {
    const op = u8();
    if (op === 0) break;
    else if (op === 1) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u16()); }
    else if (op === 61) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u32()); } // 32-bit models
    else if (op === 2) skipStr();
    else if (op === 12) p += 1;
    else if (op === 13 || op === 14 || op === 15 || op === 16 || op === 18) p += 2;
    else if (op === 17) p += 8;
    else if (op >= 30 && op < 35) skipStr();
    else if (op === 40 || op === 41) { const n = u8(); for (let i = 0; i < n; i++) { const f = u16(), r = u16(); if (op === 40) { out.recolorToFind.push(f); out.recolorToReplace.push(r); } } }
    else if (op === 60) { const n = u8(); p += 2 * n; }
    else if (op >= 74 && op <= 79) p += 2;
    else if (op === 93) { /* flag */ }
    else if (op === 95) p += 2;
    else if (op === 97 || op === 98) p += 2;
    else if (op === 99 || op === 107 || op === 109 || op === 111 || op === 122 || op === 123 || op === 129 || op === 145) { /* flag */ }
    else if (op === 100 || op === 101) i8();
    else if (op === 102) { const bf = u8(); let len = 0; for (let v = bf; v !== 0; v >>= 1) len++; for (let i = 0; i < len; i++) if (bf & (1 << i)) p += 4; }
    else if (op === 103) p += 2;
    else if (op === 106) { u16(); u16(); const n = u8(); p += 2 * (n + 1); }
    else if (op === 118) { u16(); u16(); u16(); const n = u8(); p += 2 * (n + 1); }
    else if (op === 114 || op === 116 || op === 124 || op === 126 || op === 146) p += 2;
    else if (op === 115 || op === 117) p += 8;
    else if (op === 249) { const n = u8(); for (let i = 0; i < n; i++) { const isS = u8() === 1; p += 3; if (isS) skipStr(); else p += 4; } }
    else break; // unknown opcode → stop (avoid desync garbage)
  }
  return out;
}

// --------------------------------------------------------------- model render
/** Merge an NPC's models and apply its recolour table → one ModelDefinition. */
async function buildNpcModel(cache, def) {
  const models = [];
  for (const mid of def.models) {
    const m = await cache.getDef(IndexType.MODELS, mid).catch(() => null);
    if (m) models.push(m);
  }
  if (!models.length) return null;
  const merged = new ModelGroup(models).getMergedModel();

  // NPC-level recolour: swap stored face HSLs (find → replace).
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

/** Rotate (yaw about Y, pitch about X) then orthographically project a vertex. */
function project(x, y, z, sinYaw, cosYaw, sinPitch, cosPitch) {
  // yaw around vertical axis
  let rx = x * cosYaw - z * sinYaw;
  let rz = x * sinYaw + z * cosYaw;
  // pitch around horizontal axis
  let ry = y * cosPitch - rz * sinPitch;
  rz = y * sinPitch + rz * cosPitch;
  return [rx, ry, rz];
}

/** Value at percentile `q` (0..1) of a numeric array (sorted copy). */
function percentile(arr, q) {
  const s = Float64Array.from(arr).sort();
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i];
}

function renderModel(model, { yaw = 30, pitch = 12, zoom = 1, cullBelowGround = false } = {}) {
  const n = model.vertexCount;
  const X = model.vertexPositionsX, Y = model.vertexPositionsY, Z = model.vertexPositionsZ;
  const yawR = (yaw * Math.PI) / 180, pitchR = (pitch * Math.PI) / 180;
  const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);

  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [a, b, c] = project(X[i], Y[i], Z[i], sy, cy, sp, cp);
    px[i] = a; py[i] = b; pz[i] = c;
  }

  // Robust auto-fit: frame to the dense body via percentile bounds, so stray
  // effect geometry (energy shards, ground discs) doesn't shrink the creature.
  // Normalise primarily by HEIGHT so every NPC reads at a similar on-screen
  // size; only fall back to width when a model is wider than tall (e.g. wings),
  // to avoid clipping the body.
  const TRIM = 0.03; // ignore the extreme 3% of verts per side when framing
  const xLo = percentile(px, TRIM), xHi = percentile(px, 1 - TRIM);
  const yLo = percentile(py, TRIM), yHi = percentile(py, 1 - TRIM);
  const robustH = (yHi - yLo) || 1, robustW = (xHi - xLo) || 1;
  const usable = SIZE * (1 - 2 * MARGIN);
  let scale = (usable / robustH) * zoom;
  if (robustW * scale > usable) scale = (usable / robustW) * zoom; // don't clip width
  const cx = (xLo + xHi) / 2, cyc = (yLo + yHi) / 2;
  const toScreen = (i) => [SIZE / 2 + (px[i] - cx) * scale, SIZE / 2 + (py[i] - cyc) * scale];

  // Light direction (in projected space) for flat per-face shading.
  const L = [-0.5, -0.6, -0.7];
  const Lmag = Math.hypot(...L);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // Painter's algorithm: sort faces back-to-front by average projected depth.
  const fa = model.faceVertexIndices1, fb = model.faceVertexIndices2, fc = model.faceVertexIndices3;
  const order = [];
  for (let f = 0; f < model.faceCount; f++) {
    const depth = (pz[fa[f]] + pz[fb[f]] + pz[fc[f]]) / 3;
    order.push([f, depth]);
  }
  order.sort((p, q) => q[1] - p[1]); // far (large z) first

  for (const [f] of order) {
    const renderType = model.faceRenderTypes ? model.faceRenderTypes[f] : 0;
    if (renderType === 2) continue; // hidden
    const alpha = model.faceAlphas?.[f] ?? 0;
    if (alpha === 255) continue; // fully transparent in OSRS
    const hsl = model.faceColors[f];
    if (hsl === undefined || hsl < 0) continue;

    const i1 = fa[f], i2 = fb[f], i3 = fc[f];
    // Optional: drop sub-ground decoration (shadow/contact discs sit just below
    // the feet at model-Y > 0; nothing legitimate is below the ground plane).
    if (cullBelowGround && Y[i1] > 4 && Y[i2] > 4 && Y[i3] > 4) continue;
    // Flat shade: face normal in projected space · light.
    const ux = px[i2] - px[i1], uy = py[i2] - py[i1], uz = pz[i2] - pz[i1];
    const vx = px[i3] - px[i1], vy = py[i3] - py[i1], vz = pz[i3] - pz[i1];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nmag = Math.hypot(nx, ny, nz) || 1;
    const dot = (nx * L[0] + ny * L[1] + nz * L[2]) / (nmag * Lmag);
    const shade = 0.55 + 0.45 * Math.abs(dot); // ambient + diffuse, both sides lit

    const [r, g, b] = hslToRgb(hsl);
    ctx.fillStyle = `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`;
    ctx.globalAlpha = (255 - alpha) / 255;
    const [x1, y1] = toScreen(i1), [x2, y2] = toScreen(i2), [x3, y3] = toScreen(i3);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
    ctx.fill();
  }

  // node-canvas → PNG buffer (keep transparency).
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const png = new PNG({ width: SIZE, height: SIZE });
  png.data.set(img.data);
  return PNG.sync.write(png);
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
  const findIdx = argv.indexOf('--find');
  if (findIdx !== -1) {
    const needle = (argv[findIdx + 1] || '').toLowerCase();
    const defs = await cache.getAllDefs(IndexType.CONFIGS, ConfigType.NPC);
    for (const d of defs) {
      if (d?.name && d.name.toLowerCase().includes(needle)) {
        console.log(`${String(d.id).padStart(6)}  ${d.name}  models=[${d.models}]`);
      }
    }
    process.exit(0);
  }

  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
  // CLI camera overrides for tuning (apply to every rendered target).
  const yawIdx = argv.indexOf('--yaw');
  const pitchIdx = argv.indexOf('--pitch');
  const camOverride = {};
  if (yawIdx !== -1) camOverride.yaw = Number(argv[yawIdx + 1]);
  if (pitchIdx !== -1) camOverride.pitch = Number(argv[pitchIdx + 1]);

  const entries = Object.entries(TARGETS).filter(([slug]) => !only || slug === only);
  if (!entries.length) { console.warn('No TARGETS to render (fill in NPC ids via --find).'); process.exit(0); }

  for (const [slug, cfg] of entries) {
    const file = await cache.getFile(IndexType.CONFIGS, ConfigType.NPC, cfg.npc);
    if (!file?.content) { console.warn(`! NPC ${cfg.npc} (${slug}) not found`); continue; }
    const def = { name: file.def?.name, ...parseNpcDef(file.content) };
    const model = await buildNpcModel(cache, def);
    if (!model) { console.warn(`! ${slug}: no model geometry`); continue; }
    const buf = renderModel(model, { ...cfg, ...camOverride });
    const outPath = join(REPO, 'public', 'assets', 'models', `${slug}.png`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
    console.log(`✓ ${slug}: NPC ${cfg.npc} "${def.name}" → public/assets/models/${slug}.png`);
  }
  process.exit(0);
}

main();

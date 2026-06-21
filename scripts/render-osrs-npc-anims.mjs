/**
 * Offline **animated-NPC** renderer — the moving-enemy companion to
 * render-osrs-npcs.mjs (which bakes a single static pose). This bakes a set of
 * named animation *clips* (walk / hurt / death / …) for one NPC into horizontal
 * sprite-sheet PNGs + a JSON manifest, so an enemy can play a walk loop, a hurt
 * flinch and a death collapse instead of being a frozen image.
 *
 * Pipeline (per clip): getNPC(id) → merge models + recolour → loadAnimation(seq)
 * → per-frame vertex positions → software-rasterise each frame with a *shared*
 * fit (so the creature doesn't jitter in scale across the clip) → tile frames
 * into one sheet. Output: public/assets/enemies/<slug>/<clip>.png + <slug>.json.
 *
 *   node scripts/render-osrs-npc-anims.mjs                 # bake every TARGET
 *   node scripts/render-osrs-npc-anims.mjs --only goblin   # bake one TARGET
 *   node scripts/render-osrs-npc-anims.mjs --only goblin --yaw 60 --pitch 6
 *
 * Animation ids are the NPC's sequence ids: the stand/walk live in the NPC def
 * (opcodes 13/14); attack/hurt/death sit in the same id block — discover them by
 * baking a range and eyeballing (a collapse-to-ground clip is the death).
 * Build-time/offline only (osrscachereader can't run in a static export).
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

const SIZE = 128;       // per-frame canvas; enemies read small on the map
const MARGIN = 0.06;
const MS_PER_UNIT = 20; // OSRS frame-length unit ≈ 20ms (one client cycle)

/**
 * Bake targets: slug → { npc, anims, … }. `anims` maps a clip name to its
 * sequence id. `yaw`/`pitch` (degrees) frame the creature (front 3/4 by
 * default, matching the static enemy art). `maxFrames` caps each sheet's width.
 */
const TARGETS = {
  // Goblin (NPC 655): stand 6181 / walk 6180 live in the def; the rest of the
  // 618x block holds death (6182, collapses), attack (6183, club raise) and the
  // hurt/block flinch (6184). Loop walk/idle; play hurt/death once.
  goblin: {
    npc: 655,
    yaw: 50,
    pitch: 6,
    maxFrames: 24,
    mirror: true, // face travel direction (enemies spawn moving right)
    anims: { walk: 6180, hurt: 6184, death: 6182, attack: 6183 },
    loop: { walk: true }, // others are one-shot
  },
};

// ----------------------------------------------------------- OSRS HSL palette
const HUE_OFFSET = 0.5 / 64;
const SATURATION_OFFSET = 0.5 / 8;
const BRIGHTNESS = 0.7;

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
  return [r, g, b].map((c) => Math.min(255, Math.pow(Math.max(c, 0), BRIGHTNESS) * 255));
}

/** Rotate (yaw about Y, pitch about X) then orthographically project a vertex. */
function project(x, y, z, sy, cy, sp, cp) {
  const rx = x * cy - z * sy;
  let rz = x * sy + z * cy;
  const ry = y * cp - rz * sp;
  rz = y * sp + rz * cp;
  return [rx, ry, rz];
}

function percentile(arr, q) {
  const s = Float64Array.from(arr).sort();
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i];
}

/**
 * Parse an NPC config's model ids (opcode 61 / u32) + recolour (opcode 40).
 * Same byte-walking as the other scripts — the 1.1.3 NpcLoader misses 32-bit
 * models. (We don't need stand/walk anim here; clips come from TARGETS.)
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
    else if (op === 61) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u32()); }
    else if (op === 2) skipStr();
    else if (op === 12) p += 1;
    else if (op === 13 || op === 14 || op === 15 || op === 16 || op === 18) p += 2;
    else if (op === 17) p += 8;
    else if (op >= 30 && op < 35) skipStr();
    else if (op === 40) { const n = u8(); for (let i = 0; i < n; i++) { out.recolorToFind.push(u16()); out.recolorToReplace.push(u16()); } }
    else if (op === 41) { const n = u8(); p += 4 * n; }
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
    else break;
  }
  return out;
}

/** Build an NPC's merged + recoloured model. */
async function buildNpcModel(cache, npcId) {
  const file = await cache.getFile(IndexType.CONFIGS, ConfigType.NPC, npcId);
  if (!file?.content) return null;
  const def = parseNpcDef(file.content);
  const models = [];
  for (const mid of def.models) {
    const m = await cache.getDef(IndexType.MODELS, mid).catch(() => null);
    if (m) models.push(m);
  }
  if (!models.length) return null;
  const model = models.length === 1 ? models[0] : new ModelGroup(models).getMergedModel();
  if (def.recolorToFind?.length) {
    const map = new Map();
    def.recolorToFind.forEach((f, i) => map.set(f & 0xffff, def.recolorToReplace[i] & 0xffff));
    for (let i = 0; i < model.faceColors.length; i++) {
      const r = map.get(model.faceColors[i] & 0xffff);
      if (r !== undefined) model.faceColors[i] = r;
    }
  }
  return model;
}

/** Render one frame's vertices into a SIZE×SIZE canvas using a shared fit. */
function renderFrame(model, verts, fit, sy, cy, sp, cp, mirror) {
  const n = verts.length;
  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // loadAnimation yields Y negated vs the static model space, so negate it back
    // (else the creature renders upside down). Optionally mirror X so it faces
    // its travel direction.
    const [a, b, c] = project(verts[i][0], -verts[i][1], verts[i][2], sy, cy, sp, cp);
    px[i] = mirror ? -a : a; py[i] = b; pz[i] = c;
  }
  const toScreen = (i) => [SIZE / 2 + (px[i] - fit.cx) * fit.scale, SIZE / 2 + (py[i] - fit.cy) * fit.scale];

  const L = [-0.5, -0.6, -0.7];
  const Lmag = Math.hypot(...L);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  const fa = model.faceVertexIndices1, fb = model.faceVertexIndices2, fc = model.faceVertexIndices3;
  const order = [];
  for (let f = 0; f < model.faceCount; f++) order.push([f, (pz[fa[f]] + pz[fb[f]] + pz[fc[f]]) / 3]);
  order.sort((p, q) => q[1] - p[1]);

  for (const [f] of order) {
    const renderType = model.faceRenderTypes ? model.faceRenderTypes[f] : 0;
    if (renderType === 2) continue;
    const alpha = model.faceAlphas?.[f] ?? 0;
    if (alpha === 255) continue;
    const hsl = model.faceColors[f];
    if (hsl === undefined || hsl < 0) continue;

    const i1 = fa[f], i2 = fb[f], i3 = fc[f];
    const ux = px[i2] - px[i1], uy = py[i2] - py[i1], uz = pz[i2] - pz[i1];
    const vx = px[i3] - px[i1], vy = py[i3] - py[i1], vz = pz[i3] - pz[i1];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nmag = Math.hypot(nx, ny, nz) || 1;
    const dot = (nx * L[0] + ny * L[1] + nz * L[2]) / (nmag * Lmag);
    const shade = 0.55 + 0.45 * Math.abs(dot);

    const [r, g, b] = hslToRgb(hsl);
    ctx.fillStyle = `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`;
    ctx.globalAlpha = (255 - alpha) / 255;
    const [x1, y1] = toScreen(i1), [x2, y2] = toScreen(i2), [x3, y3] = toScreen(i3);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
    ctx.fill();
  }
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/**
 * Shared fit across **every frame of every clip** so the creature stays the same
 * scale and ground line whether it's walking or dying (no pop between clips).
 */
function computeFit(allFrames, sy, cy, sp, cp, mirror) {
  const allX = [], allY = [];
  for (const verts of allFrames) {
    for (const v of verts) {
      const [a, b] = project(v[0], -v[1], v[2], sy, cy, sp, cp); // negate Y (see renderFrame)
      allX.push(mirror ? -a : a); allY.push(b);
    }
  }
  const TRIM = 0.01;
  const xLo = percentile(allX, TRIM), xHi = percentile(allX, 1 - TRIM);
  const yLo = percentile(allY, TRIM), yHi = percentile(allY, 1 - TRIM);
  const usable = SIZE * (1 - 2 * MARGIN);
  const scale = usable / Math.max((yHi - yLo) || 1, (xHi - xLo) || 1);
  return { scale, cx: (xLo + xHi) / 2, cy: (yLo + yHi) / 2 };
}

async function loadClip(cache, model, animId, maxFrames) {
  const anim = await model.loadAnimation(cache, animId);
  let frames = anim.vertexData;
  let lengths = anim.lengths;
  if (!frames?.length) return null;
  if (frames.length > maxFrames) {
    const picked = [], pickedLen = [];
    for (let i = 0; i < maxFrames; i++) {
      const idx = Math.round((i * (frames.length - 1)) / (maxFrames - 1));
      picked.push(frames[idx]); pickedLen.push(lengths[idx] ?? 3);
    }
    frames = picked; lengths = pickedLen;
  }
  return { frames, lengths };
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
  if (!entries.length) { console.warn('No TARGETS to bake.'); process.exit(0); }

  for (const [slug, cfgIn] of entries) {
    const cfg = { yaw: 40, pitch: 8, maxFrames: 24, loop: {}, ...cfgIn, ...camOverride };
    const model = await buildNpcModel(cache, cfg.npc);
    if (!model) { console.warn(`! ${slug}: NPC ${cfg.npc} has no model`); continue; }

    const yawR = (cfg.yaw * Math.PI) / 180, pitchR = (cfg.pitch * Math.PI) / 180;
    const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);

    // Load every clip first so the fit can be shared across all of them.
    const clips = {};
    for (const [name, animId] of Object.entries(cfg.anims)) {
      const clip = await loadClip(cache, model, animId, cfg.maxFrames);
      if (!clip) { console.warn(`! ${slug}.${name}: anim ${animId} produced no frames`); continue; }
      clips[name] = clip;
    }
    const everyFrame = Object.values(clips).flatMap((c) => c.frames);
    if (!everyFrame.length) { console.warn(`! ${slug}: no clips`); continue; }
    const fit = computeFit(everyFrame, sy, cy, sp, cp, cfg.mirror);

    const outDir = join(REPO, 'public', 'assets', 'enemies', slug);
    mkdirSync(outDir, { recursive: true });
    const manifest = { npc: cfg.npc, frameW: SIZE, frameH: SIZE, clips: {} };

    for (const [name, clip] of Object.entries(clips)) {
      const { frames, lengths } = clip;
      const sheet = new PNG({ width: SIZE * frames.length, height: SIZE });
      for (let fi = 0; fi < frames.length; fi++) {
        const img = renderFrame(model, frames[fi], fit, sy, cy, sp, cp, cfg.mirror);
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            const src = (y * SIZE + x) * 4;
            const dst = (y * (SIZE * frames.length) + fi * SIZE + x) * 4;
            sheet.data[dst] = img.data[src];
            sheet.data[dst + 1] = img.data[src + 1];
            sheet.data[dst + 2] = img.data[src + 2];
            sheet.data[dst + 3] = img.data[src + 3];
          }
        }
      }
      writeFileSync(join(outDir, `${name}.png`), PNG.sync.write(sheet));
      manifest.clips[name] = {
        anim: cfg.anims[name],
        frames: frames.length,
        frameMs: lengths.map((l) => Math.max(20, (l ?? 3) * MS_PER_UNIT)),
        loop: !!cfg.loop[name],
      };
      console.log(`  ✓ ${slug}/${name}.png  (${frames.length} frames, anim ${cfg.anims[name]})`);
    }

    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(manifest, null, 2));
    console.log(`✓ ${slug}: NPC ${cfg.npc} → public/assets/enemies/${slug}/ (${Object.keys(clips).length} clips)`);
  }
  process.exit(0);
}

main();

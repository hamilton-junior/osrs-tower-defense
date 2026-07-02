/**
 * Offline **spotanim** (GFX / "graphics" effect) renderer — the animated
 * companion to render-osrs-npcs.mjs. Where that bakes a single static NPC
 * model to a PNG, this bakes a *spot animation* (spell impact, teleport poof,
 * prayer aura, …) to a horizontal **sprite sheet** PNG + a JSON sidecar, which
 * the runtime plays frame-by-frame over the scene (see GameRenderer effects).
 *
 * Pipeline: getSpotAnim(id) → model + sequence → model.loadAnimation() gives
 * the per-frame vertex positions → render each frame with a *shared* fit (so
 * the effect doesn't jitter in scale) → tile frames into one sheet PNG.
 *
 *   node scripts/render-osrs-spotanims.mjs                  # bake every TARGET
 *   node scripts/render-osrs-spotanims.mjs --only fire_hit  # bake one TARGET
 *   node scripts/render-osrs-spotanims.mjs --list           # list spotanims (id/name/model/anim)
 *   node scripts/render-osrs-spotanims.mjs --list barrage   # filter the list by name
 *
 * Build-time/offline only (osrscachereader can't run in a static export).
 */
import { RSCache, IndexType, ConfigType, ModelGroup } from 'osrscachereader';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { computeFit, renderModelFrame, loadTextures, modelTextureIds, loadAnimationWithAlpha } from './lib/rs-raster.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

const SIZE = 96; // per-frame canvas; effects are small, kept tight for sheet size
const MARGIN = 0.08;
const MS_PER_UNIT = 20; // OSRS frame-length unit ≈ 20ms (one client cycle)

/**
 * Bake targets: slug → spotanim config. `id` is the SpotAnim id (ConfigType
 * SPOTANIM). Optional `yaw`/`pitch` (degrees) frame the effect; impacts read
 * best near front-on. `maxFrames` caps the sheet width for very long anims.
 * Discover ids with `--list`.
 */
const TARGETS = {
  // An NPC target (`{ npc }` instead of `{ id }`) bakes that NPC's *standing*
  // animation — for cache effects that live on an NPC (e.g. the spawn portal)
  // rather than a spotanim. Tuning: `--only portal --yaw N --pitch N`.
  // The Pest Control void portal disc, viewed at a 3/4 side angle (yaw 72 /
  // pitch 28) so the swirling face reads with perspective and the stone frame's
  // bottom rim curves toward the viewer (the "belly") instead of a flat disc.
  // The Pest Control void portal disc, viewed nearly edge-on (yaw 12) — a
  // literal side profile: the stone frame is a thin vertical silhouette and the
  // swirling energy bulges out as the portal's "belly". Nudge yaw up (18-25)
  // for a wider belly, down toward 0 for a thinner profile.
  portal: { npc: 1739, yaw: 12, pitch: 0, maxFrames: 12 },
};

/**
 * The real spell GFX: every wizard spell's projectile + impact spotanim, keyed
 * to mirror the engine's `hit_<element>_<level>` sound keys (so `hitSound` doubles
 * as the impact-GFX slug, and `proj_…` as the flight loop). IDs verified
 * visually against the cache (contact-strip bakes, 2026-07-02):
 *  - Elemental levels 1-5 = Strike/Bolt/Blast/Wave/Surge. Each entry [proj, hit].
 *  - Ancients levels 1-4 = Rush/Burst/Blitz/Barrage. Blitz/Barrage fly with no
 *    cache projectile of their own — they reuse their element's rush/blitz orb
 *    (the closest authentic flight visual).
 */
const SPELL_GFX = {
  air:   [[91, 92], [118, 119], [133, 134], [159, 160], [1456, 1457]],
  water: [[94, 95], [121, 122], [136, 137], [162, 163], [1459, 1460]],
  earth: [[97, 98], [124, 125], [139, 140], [165, 166], [1462, 1463]],
  fire:  [[100, 101], [127, 128], [130, 131], [156, 157], [1465, 1466]],
  ice:    [[360, 361], [362, 363], [360, 367], [360, 369]],
  blood:  [[372, 373], [372, 376], [374, 375], [374, 377]],
  shadow: [[378, 379], [378, 382], [380, 381], [380, 383]],
  smoke:  [[384, 385], [384, 389], [386, 387], [386, 391]],
};
for (const [el, tiers] of Object.entries(SPELL_GFX)) {
  tiers.forEach(([proj, hit], i) => {
    TARGETS[`proj_${el}_${i + 1}`] = { id: proj, maxFrames: 12 };
    TARGETS[`hit_${el}_${i + 1}`] = { id: hit, maxFrames: 16 };
  });
}

/**
 * Parse a spotanim config's model id + animation id (+ recolour) ourselves.
 *
 * Why not osrscachereader's SpotAnimLoader: in the current LIVE cache the model
 * id moved to **opcode 3 (u32)** (model ids outgrew u16), which the 1.1.3 loader
 * doesn't know — it only reads the legacy opcode 1 (u16) — so it desyncs and
 * yields modelId=undefined / animationId=-1 for every spotanim. We walk the
 * byte stream and read opcode 3 (u32 model) + opcode 2 (u16 anim) directly.
 */
function parseSpotAnimDef(content) {
  const b = new Uint8Array(content.buffer ?? content);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u8 = () => b[p++];
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const skipStr = () => { while (b[p] !== 0) p++; p++; };
  const out = { modelId: undefined, animationId: -1, recolorToFind: [], recolorToReplace: [], retexToFind: [], retexToReplace: [] };
  for (let guard = 0; guard < 256; guard++) {
    const op = u8();
    if (op === 0) break;
    else if (op === 1) out.modelId = u16();        // legacy u16 model
    else if (op === 3) out.modelId = u32();        // 32-bit model
    else if (op === 2) out.animationId = u16();
    else if (op === 4 || op === 5 || op === 6) u16(); // resizeX / resizeY / rotation
    else if (op === 7 || op === 8) u8();             // ambient / contrast
    else if (op === 9) skipStr();                    // name
    else if (op === 40) { const n = u8(); for (let i = 0; i < n; i++) { out.recolorToFind.push(u16()); out.recolorToReplace.push(u16()); } }
    else if (op === 41) { const n = u8(); for (let i = 0; i < n; i++) { out.retexToFind.push(u16()); out.retexToReplace.push(u16()); } }
    else break; // unknown → stop (avoid desync garbage)
  }
  return out;
}

/**
 * Parse an NPC config's model ids (opcode 61 / u32) + standing animation
 * (opcode 13 / u16) + recolour (opcode 40). Same byte-walking approach as the
 * NPC renderer — the 1.1.3 NpcLoader misses 32-bit models.
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
  const out = { models: [], standAnim: -1, recolorToFind: [], recolorToReplace: [] };
  for (let guard = 0; guard < 512; guard++) {
    const op = u8();
    if (op === 0) break;
    else if (op === 1) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u16()); }
    else if (op === 61) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u32()); }
    else if (op === 2) skipStr();
    else if (op === 12) p += 1;
    else if (op === 13) out.standAnim = u16();
    else if (op === 14 || op === 15 || op === 16 || op === 18) p += 2;
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
    else break;
  }
  return out;
}

/** Build an NPC's (merged + recoloured) model and its standing-animation id. */
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
  return { model, animationId: def.standAnim };
}

// Rasterisation (projection, fit, per-face fill, textures, the unsigned-alpha
// fix that cures the old "white box" bakes) lives in ./lib/rs-raster.mjs and is
// shared with the other bakers.

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

  // --- discovery: list spotanims (optionally filtered by name substring) ----
  const listIdx = argv.indexOf('--list');
  if (listIdx !== -1) {
    const needle = argv[listIdx + 1];
    const wantId = needle != null && /^\d+$/.test(needle) ? Number(needle) : null;
    const files = await cache.getAllFiles(IndexType.CONFIGS, ConfigType.SPOTANIM);
    let shown = 0;
    for (const f of files) {
      if (!f?.content) continue;
      const id = f.id ?? f.fileId;
      if (wantId != null && id !== wantId) continue;
      const d = parseSpotAnimDef(f.content);
      if (d.modelId == null || d.animationId === -1) continue;
      console.log(`${String(id).padStart(5)}  model=${String(d.modelId).padStart(6)}  anim=${String(d.animationId).padStart(6)}`);
      if (++shown >= 4000) break;
    }
    console.log(`(${shown} spotanims with a model+animation)`);
    process.exit(0);
  }

  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
  const yawIdx = argv.indexOf('--yaw');
  const pitchIdx = argv.indexOf('--pitch');
  const camOverride = {};
  if (yawIdx !== -1) camOverride.yaw = Number(argv[yawIdx + 1]);
  if (pitchIdx !== -1) camOverride.pitch = Number(argv[pitchIdx + 1]);

  const entries = Object.entries(TARGETS).filter(([slug]) => !only || slug === only);
  if (!entries.length) { console.warn('No TARGETS to bake (fill ids via --list).'); process.exit(0); }

  for (const [slug, cfgIn] of entries) {
    const cfg = { yaw: 0, pitch: 0, maxFrames: 24, ...cfgIn, ...camOverride };
    // Two sources: a spotanim (`cfg.id`) or an NPC's standing anim (`cfg.npc`).
    let model, animationId;
    if (cfg.npc != null) {
      const built = await buildNpcModel(cache, cfg.npc);
      if (!built) { console.warn(`! ${slug}: NPC ${cfg.npc} has no model`); continue; }
      model = built.model; animationId = built.animationId;
    } else {
      const file = await cache.getFile(IndexType.CONFIGS, ConfigType.SPOTANIM, cfg.id);
      const sa = parseSpotAnimDef(file.content);
      if (sa.modelId == null) { console.warn(`! ${slug}: spotanim ${cfg.id} has no model`); continue; }
      model = await cache.getDef(IndexType.MODELS, sa.modelId);
      if (!model) { console.warn(`! ${slug}: model ${sa.modelId} not found`); continue; }
      if (sa.recolorToFind?.length) {
        const map = new Map();
        sa.recolorToFind.forEach((f, i) => map.set(f & 0xffff, sa.recolorToReplace[i] & 0xffff));
        for (let i = 0; i < model.faceColors.length; i++) {
          const r = map.get(model.faceColors[i] & 0xffff);
          if (r !== undefined) model.faceColors[i] = r;
        }
      }
      // Opcode 41: texture find/replace — swap face texture ids before baking.
      if (sa.retexToFind?.length && model.faceTextures?.length) {
        const map = new Map();
        sa.retexToFind.forEach((f, i) => map.set(f, sa.retexToReplace[i]));
        for (let i = 0; i < model.faceTextures.length; i++) {
          const r = map.get(model.faceTextures[i]);
          if (r !== undefined) model.faceTextures[i] = r;
        }
      }
      animationId = sa.animationId;
    }

    if (animationId === -1) { console.warn(`! ${slug}: no animation`); continue; }
    // Real cache textures for any textured faces (rare on GFX, common on NPCs).
    const textures = await loadTextures(cache, modelTextureIds(model));
    // Alpha-aware load: applies the sequence's type-5 transparency transforms
    // (fades) that plain loadAnimation drops — see lib/rs-raster.mjs.
    const anim = await loadAnimationWithAlpha(cache, model, animationId);
    let frames = anim.vertexData; // [frame][vertex] = [x,y,z]
    let lengths = anim.lengths;
    let alphas = anim.alphaData; // [frame] → per-face alpha (or null)
    if (!frames?.length) { console.warn(`! ${slug}: animation produced no frames`); continue; }

    // Cap frame count (sample evenly) to keep the sheet small.
    if (frames.length > cfg.maxFrames) {
      const picked = [], pickedLen = [], pickedA = [];
      for (let i = 0; i < cfg.maxFrames; i++) {
        const idx = Math.round((i * (frames.length - 1)) / (cfg.maxFrames - 1));
        picked.push(frames[idx]); pickedLen.push(lengths[idx] ?? 3); pickedA.push(alphas?.[idx] ?? null);
      }
      frames = picked; lengths = pickedLen; alphas = pickedA;
    }

    const yawR = (cfg.yaw * Math.PI) / 180, pitchR = (cfg.pitch * Math.PI) / 180;
    const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);
    const fit = computeFit(frames, sy, cy, sp, cp, SIZE, MARGIN);

    // Tile frames left→right into one sheet.
    const sheet = new PNG({ width: SIZE * frames.length, height: SIZE });
    for (let fi = 0; fi < frames.length; fi++) {
      const img = renderModelFrame(model, frames[fi], fit, sy, cy, sp, cp, SIZE, textures, alphas?.[fi] ?? undefined);
      // blit into the sheet at column fi
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

    const outDir = join(REPO, 'public', 'assets', 'spotanims');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${slug}.png`), PNG.sync.write(sheet));
    const meta = {
      frames: frames.length,
      frameW: SIZE,
      frameH: SIZE,
      frameMs: lengths.map((l) => Math.max(20, (l ?? 3) * MS_PER_UNIT)),
      spotanim: cfg.id,
    };
    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(meta));
    const srcLabel = cfg.npc != null ? `NPC ${cfg.npc}` : `spotanim ${cfg.id}`;
    console.log(`✓ ${slug}: ${srcLabel} → ${frames.length} frames → public/assets/spotanims/${slug}.png`);
  }
  process.exit(0);
}

main();

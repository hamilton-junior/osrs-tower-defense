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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { renderModelFrame, loadTextures, modelTextureIds, computeFit } from './lib/rs-raster.mjs';

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
  giant_mole: { npc: 5779 },             // Giant Mole (boss)
  // NOTE: the spawn portal is no longer a model render — OSRS portals are mostly
  // animated spotanims, so a static render reads poorly. It's now drawn
  // procedurally as a swirling vortex in renderer.drawSpawnPortal.

  // --- Skilling pets (ASSETS.pets) ---
  beaver: { npc: 12169 },
  rock_golem: { npc: 6725 },
  tangleroot: { npc: 7335 },
  heron: { npc: 6715 },
  rift_guardian: { npc: 7337 },          // fire variant (matches the old wiki art)
  baby_mole: { npc: 5780 },
  vorki: { npc: 8025 },
  snakeling: { npc: 2132 },              // tanzanite (matches the old wiki art)
  prince_black_dragon: { npc: 6636 },
  kalphite_princess: { npc: 6637 },      // 2nd form (matches the old wiki art)
  tzrek_jad: { npc: 5892 },
  ikkle_hydra: { npc: 8492 },            // serpentine (matches the old wiki art)

  // --- TzHaar tower tier icons (ASSETS.towers.tzhaar) ---
  // Tower icons face RIGHT-ish (front is yaw 0; yaw 60 turns them 60° toward
  // the lane on the right — check the forward-pointing flipper feet / held
  // weapons to judge facing, the faces are unreadable at 256px). They must
  // read as attacking, not posing for the camera. Hur uses the 2166
  // colour-morph — the warm pink-grey body + red joints of the wiki art
  // (2161 is the cool-grey morph).
  tzhaar_hur: { npc: 2166, yaw: 60 },
  tzhaar_mej: { npc: 2154, yaw: 60 },
  tzhaar_xil: { npc: 2167, yaw: 60 },    // knife (ranged) caste — obsidian-dark morph
  tzhaar_ket: { npc: 2173, yaw: 60 },

  // --- Misc NPC-model icons ---
  giant_snail: { npc: 5628 },            // "slow" debuff icon
  kalphite_larva: { npc: 966 },          // Swarm affix / wave-event icon
};

// Bestiary statics: reuse the exact NPC ids the anim baker renders clips from
// (scripts/enemy-anims.config.json — the single source of truth), so the
// static portrait always matches the animated model on the map.
const ANIM_CFG = JSON.parse(readFileSync(join(__dirname, 'enemy-anims.config.json'), 'utf8'));
for (const [slug, { npc }] of Object.entries(ANIM_CFG)) {
  if (!TARGETS[slug]) TARGETS[slug] = { npc };
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

/**
 * Static NPC portrait through the shared rasteriser (rs-raster: painter sort,
 * client backface culling, real cache textures with the face-lightness rule,
 * unsigned face alpha). Base-pose vertices, 3/4 view by default.
 */
function renderNpc(model, { yaw = 30, pitch = 12, zoom = 1, cullBelowGround = false } = {}, textures) {
  // Sub-ground decoration (shadow/contact discs sit just below the feet at
  // model-Y > 4): mark hidden so the shared renderer skips them.
  if (cullBelowGround) {
    const Y = model.vertexPositionsY;
    const fa = model.faceVertexIndices1, fb = model.faceVertexIndices2, fc = model.faceVertexIndices3;
    if (!model.faceRenderTypes) model.faceRenderTypes = new Array(model.faceCount).fill(0);
    for (let f = 0; f < model.faceCount; f++) {
      if (Y[fa[f]] > 4 && Y[fb[f]] > 4 && Y[fc[f]] > 4) model.faceRenderTypes[f] = 2;
    }
  }
  const n = model.vertexCount;
  const verts = new Array(n);
  for (let i = 0; i < n; i++) {
    verts[i] = [model.vertexPositionsX[i], model.vertexPositionsY[i], model.vertexPositionsZ[i]];
  }
  const yawR = (yaw * Math.PI) / 180, pitchR = (pitch * Math.PI) / 180;
  const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);
  const fit = computeFit([verts], sy, cy, sp, cp, SIZE, MARGIN);
  fit.scale *= zoom;
  const img = renderModelFrame(model, verts, fit, sy, cy, sp, cp, SIZE, textures);
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
    const textures = await loadTextures(cache, modelTextureIds(model));
    const buf = renderNpc(model, { ...cfg, ...camOverride }, textures);
    const outPath = join(REPO, 'public', 'assets', 'models', `${slug}.png`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
    console.log(`✓ ${slug}: NPC ${cfg.npc} "${def.name}" → public/assets/models/${slug}.png`);
  }
  process.exit(0);
}

main();

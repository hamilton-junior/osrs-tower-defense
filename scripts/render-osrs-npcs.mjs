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
import { parseNpcDef } from './lib/npc-def.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

// Output canvas size; the model is auto-fit inside this with a margin.
const SIZE = 256;
/** Supersampling: render each cell this many times over and box it down. Cache models
 *  are low-poly, so their hard polygon silhouettes read as "the mesh is showing" long
 *  before their shading does. Costs bake time only — the output size is unchanged. */
const SS = 2;
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
  // The common Gargoyle is NPC 412 — the level-111 Slayer Tower one. Its def carries
  // no name in the cache (level 111, 105 hp and size 3 identify it), which is why the
  // slug used to point at the Marble gargoyle by mistake.
  gargoyle: { npc: 412 },
  superior_gargoyle: { npc: 7407, cullBelowGround: true }, // Marble gargoyle (drop red ground disc)
  superior_nechryael: { npc: 7411 },     // Nechryarch
  brutus: { npc: 15626 },                // Brutus (boss) — the calm form the log shows
  giant_mole: { npc: 5779 },             // Giant Mole (boss)
  dusk: { npc: 7851 },                   // Grotesque Guardians — Dusk (boss)
  dawn: { npc: 7852 },                   // Grotesque Guardians — Dawn (boss, arrives with Dusk)
  cerberus: { npc: 5862 },               // Cerberus (boss)
  kbd: { npc: 239 },                     // King Black Dragon (boss)
  summoned_soul: { npc: 5869 },          // Summoned Soul (Cerberus's add; the melee one stands for all three)
  corporeal_beast: { npc: 319 },         // Corporeal Beast (boss)
  dark_core: { npc: 320 },               // Dark energy core (the Beast's add)
  // NOTE: the spawn portal is no longer a model render — OSRS portals are mostly
  // animated spotanims, so a static render reads poorly. It's now drawn
  // procedurally as a swirling vortex in renderer.drawSpawnPortal.

  // --- Misthalin locals (ASSETS.enemies) ---
  cave_bug: { npc: 481 },                // Lumbridge Swamp Caves
  cave_slime: { npc: 480 },
  big_frog: { npc: 478, pitch: 45 },       // squat, splayed rig — needs a top-down look
  giant_frog: { npc: 477, pitch: 45 },
  hobgoblin: { npc: 3049 },
  giant_bat: { npc: 2834, pitch: 35 },     // wings only read from above
  moss_giant: { npc: 2090, yaw: 0 },       // Varrock sewers — front on; yaw 30 shows its back

  // --- Kharidian locals (ASSETS.enemies) ---
  vulture: { npc: 1267, yaw: 60, pitch: 0 },   // flat side profile; the default look flew it overhead
  desert_lizard: { npc: 460, pitch: 20 },      // low, sprawled rig — a shallower look keeps the head readable
  jackal: { npc: 4185 },
  kalphite_worker: { npc: 955 },
  scarab_mage: { npc: 794 },
  mummy: { npc: 949 },
  locust_rider: { npc: 795 },
  dust_devil: { npc: 423, cullBelowGround: true }, // drop the black ground disc it stands on
  kalphite_guardian: { npc: 959, yaw: 60 },    // yaw 30 flattens it into a hedge; 60 shows the shell and the legs

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

  // --- Distractions & Diversions cast (lib/game/data/diversions.ts) ---
  // Walkbys: the townsfolk who wander across the board between waves and only
  // ever talk. Bob is 4221, the Lumbridge axe seller — 4231 is Bob the cat.
  hans: { npc: 3105 },
  bob: { npc: 4221 },
  lumbridge_guide: { npc: 306 },
  party_pete: { npc: 5792 },
  // Random events: the classic 2000s-era event NPCs, ids straight from the cache.
  drunken_dwarf: { npc: 322 },
  genie: { npc: 326 },
  strange_plant: { npc: 323 },
  rick_turpentine: { npc: 375 },

  // Turned round, so a walker can face the way it is going: the default render
  // above is the front (a ¾ view, which is what the infobox icon wants too),
  // `_side` is the same model in profile facing RIGHT, and `_back` is its back. The
  // renderer mirrors `_side` for anyone walking the other way, so three bakes cover
  // all four directions. Yaw 90 is the right-facing profile — 270 is the same profile
  // facing left, which had every walker moonwalking. Strange Plant and the nest never
  // walk anywhere.
  hans_side: { npc: 3105, yaw: 90 },
  hans_back: { npc: 3105, yaw: 180 },
  bob_side: { npc: 4221, yaw: 90 },
  bob_back: { npc: 4221, yaw: 180 },
  lumbridge_guide_side: { npc: 306, yaw: 90 },
  lumbridge_guide_back: { npc: 306, yaw: 180 },
  party_pete_side: { npc: 5792, yaw: 90 },
  party_pete_back: { npc: 5792, yaw: 180 },
  drunken_dwarf_side: { npc: 322, yaw: 90 },
  drunken_dwarf_back: { npc: 322, yaw: 180 },
  genie_side: { npc: 326, yaw: 90 },
  genie_back: { npc: 326, yaw: 180 },
  rick_turpentine_side: { npc: 375, yaw: 90 },
  rick_turpentine_back: { npc: 375, yaw: 180 },

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
  const img = renderModelFrame(model, verts, fit, sy, cy, sp, cp, SIZE, textures, undefined, true, SS);
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

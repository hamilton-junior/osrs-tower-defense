/**
 * Export each enemy NPC as an **animated glTF** using osrscachereader's own
 * GLTFExporter — the library's tested model+animation path (the same one used to
 * view these models in standard glTF viewers). One .glb per enemy, holding the
 * merged + recoloured mesh and a morph-target animation per clip (walk/hurt/death)
 * named after the clip. The browser then renders it live with three.js (real
 * z-buffer, real playback) — no hand-rolled rasteriser, no sign/order guessing.
 *
 *   node scripts/export-enemy-gltf.mjs                 # export every enemy
 *   node scripts/export-enemy-gltf.mjs --only hill_giant
 *   node scripts/export-enemy-gltf.mjs --group diversions
 *
 * Build-time/offline only (osrscachereader needs the local cache).
 */
import { RSCache, IndexType, ConfigType, GLTFExporter, ModelGroup } from 'osrscachereader';
import { gltfToGlb } from './lib/glb.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { buildNpcModel } from './render-osrs-npc-anims.mjs';
import { objectModelById } from './render-osrs-objects.mjs';
import { clipSource, isAltModel, altGltfName, sourceLabel } from './lib/anim-source.mjs';
import { pickGroup } from './lib/anim-group.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const GROUP = pickGroup(process.argv);
const CONFIG_PATH = join(__dirname, GROUP.config);
const OUT_DIR = join(REPO, ...GROUP.gltfDir);

/**
 * The mesh a clip is posed on. Normally the enemy's own NPC model; a clip that
 * names `npc`/`obj`/`model` borrows somebody else's, because the sequence was
 * authored on *that* skeleton (see scripts/lib/anim-source.mjs).
 */
async function modelFor(cache, src, ownNpc) {
  if (src.npc != null) return buildNpcModel(cache, src.npc);
  if (src.obj != null) return objectModelById(cache, src.obj);
  if (src.model != null) {
    const m = await cache.getDef(IndexType.MODELS, src.model).catch(() => null);
    return m ? new ModelGroup([m]).getMergedModel() : null;
  }
  return buildNpcModel(cache, ownNpc);
}

/** One .glb holding one model and the clips posed on it.
 *
 * The exporter emits JSON with every accessor as its own base64 `data:` URI —
 * hundreds of them for an animated NPC — so the document is packed into the binary
 * container before it is written (see lib/glb.mjs). Base64 costs a third more than
 * the bytes it carries, and these files ship to the browser. */
async function exportGltf(cache, model, entries, outName, label) {
  const exporter = new GLTFExporter(model);
  const clips = [];
  for (const [name, src] of entries) {
    const seqFile = await cache.getFile(IndexType.CONFIGS, ConfigType.SEQUENCE, src.anim);
    const def = seqFile?.def;
    if (!def) { console.warn(`! ${outName}.${name}: sequence ${src.anim} missing`); continue; }
    def.name = name; // glTF animation name = clip name
    await exporter.addSequence(cache, def);
    clips.push(name);
  }
  if (!clips.length) return null;
  exporter.addColors();
  const glb = gltfToGlb(exporter.export());
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${outName}.glb`), glb);
  console.log(`✓ ${outName}: ${label} → ${GROUP.gltfDir.at(-1)}/${outName}.glb (${clips.join('+')}, ${(glb.length / 1024).toFixed(0)} KB)`);
  return clips;
}

async function exportOne(cache, slug, cfg) {
  // Split the clips by the mesh they are posed on: the enemy's own goes in
  // <slug>.glb as always, and each borrowed-model clip gets a file of its own,
  // <slug>__<clip>.glb, which the baker loads into the same scene.
  const own = [], alt = [];
  for (const [name, value] of Object.entries(cfg.anims)) {
    (isAltModel(value) ? alt : own).push([name, clipSource(value), value]);
  }

  const clips = [];
  if (own.length) {
    const model = await buildNpcModel(cache, cfg.npc);
    if (!model) { console.warn(`! ${slug}: NPC ${cfg.npc} has no model`); return null; }
    const done = await exportGltf(cache, model, own.map(([n, s]) => [n, s]), slug, `NPC ${cfg.npc}`);
    if (!done) return null;
    clips.push(...done);
  }
  for (const [name, src, value] of alt) {
    const model = await modelFor(cache, src, cfg.npc);
    if (!model) { console.warn(`! ${slug}.${name}: ${sourceLabel(value)} has no model`); continue; }
    const done = await exportGltf(cache, model, [[name, src]], altGltfName(slug, name), sourceLabel(value));
    if (done) clips.push(name);
  }
  return clips.length ? clips : null;
}

async function main() {
  if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
    console.error(`No cache at ${CACHE_DIR}\nSet OSRS_CACHE_DIR.`); process.exit(1);
  }
  console.log(`Loading cache: ${CACHE_DIR}`);
  const cache = new RSCache(CACHE_DIR);
  await cache.onload;

  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;
  const targets = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const manifest = {};
  for (const [slug, cfg] of Object.entries(targets)) {
    if (only && slug !== only) continue;
    try {
      const clips = await exportOne(cache, slug, cfg);
      if (clips) manifest[slug] = { npc: cfg.npc, clips };
    } catch (e) {
      console.warn(`! ${slug}: ${e?.message || e}`);
    }
  }
  if (!only) {
    writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`✓ manifest.json (${Object.keys(manifest).length} ${GROUP.label})`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

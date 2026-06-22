/**
 * Export each enemy NPC as an **animated glTF** using osrscachereader's own
 * GLTFExporter — the library's tested model+animation path (the same one used to
 * view these models in standard glTF viewers). One .gltf per enemy, holding the
 * merged + recoloured mesh and a morph-target animation per clip (walk/hurt/death)
 * named after the clip. The browser then renders it live with three.js (real
 * z-buffer, real playback) — no hand-rolled rasteriser, no sign/order guessing.
 *
 *   node scripts/export-enemy-gltf.mjs                 # export every enemy
 *   node scripts/export-enemy-gltf.mjs --only hill_giant
 *
 * Build-time/offline only (osrscachereader needs the local cache).
 */
import { RSCache, IndexType, ConfigType, GLTFExporter } from 'osrscachereader';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { buildNpcModel } from './render-osrs-npc-anims.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CONFIG_PATH = join(__dirname, 'enemy-anims.config.json');
const OUT_DIR = join(REPO, 'public', 'assets', 'enemies-gltf');

async function exportOne(cache, slug, cfg) {
  const model = await buildNpcModel(cache, cfg.npc);
  if (!model) { console.warn(`! ${slug}: NPC ${cfg.npc} has no model`); return false; }

  const exporter = new GLTFExporter(model);
  const clips = [];
  for (const [name, animId] of Object.entries(cfg.anims)) {
    const seqFile = await cache.getFile(IndexType.CONFIGS, ConfigType.SEQUENCE, animId);
    const def = seqFile?.def;
    if (!def) { console.warn(`! ${slug}.${name}: sequence ${animId} missing`); continue; }
    def.name = name; // glTF animation name = clip name
    await exporter.addSequence(cache, def);
    clips.push(name);
  }
  exporter.addColors();
  const gltf = exporter.export();
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${slug}.gltf`);
  writeFileSync(outPath, gltf);
  const kb = (Buffer.byteLength(gltf) / 1024).toFixed(0);
  console.log(`✓ ${slug}: NPC ${cfg.npc} → enemies-gltf/${slug}.gltf (${clips.join('+')}, ${kb} KB)`);
  return true;
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
      const ok = await exportOne(cache, slug, cfg);
      if (ok) manifest[slug] = { npc: cfg.npc, clips: Object.keys(cfg.anims) };
    } catch (e) {
      console.warn(`! ${slug}: ${e?.message || e}`);
    }
  }
  if (!only) {
    writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`✓ manifest.json (${Object.keys(manifest).length} enemies)`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

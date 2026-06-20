/**
 * Offline asset-extraction PoC — pulls OSRS interface **sprites** straight from a
 * local game cache and writes them as PNGs into `public/`, so the game no longer
 * depends on the wiki being up (or on hot-linking).
 *
 * This only handles true 2D sprites (spellbook icons, hitsplats, prayer/skill
 * icons). NPC/item visuals are 3D *models* in the cache and need a renderer —
 * that is the separate "model rendering" track (RuneMonk / GLTF), out of scope
 * here.
 *
 * Cache source: any folder holding `main_file_cache.dat2` + `main_file_cache.idx*`.
 * A locally-installed RuneLite/Jagex client already has one; otherwise the lib can
 * pull a cache from https://archive.openrs2.org/ (pass a build number or a URL).
 *
 *   node scripts/extract-osrs-sprites.mjs                 # default cache + named targets
 *   OSRS_CACHE_DIR="/path/to/LIVE" node scripts/extract-osrs-sprites.mjs
 *   node scripts/extract-osrs-sprites.mjs --dump 300 340  # dump a sprite-id range to tmp/ for ID discovery
 *
 * Sprite IDs come from RuneLite's `net.runelite.api.SpriteID`.
 */
import { RSCache, IndexType } from 'osrscachereader';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

// Default to a locally-installed RuneLite cache; override with OSRS_CACHE_DIR.
const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

/** Named sprite targets → output PNG path. IDs from RuneLite SpriteID.java. */
const TARGETS = [
  { slug: 'stun', spriteId: 321, out: 'public/assets/debuffs/stun.png' }, // SPELL_ENTANGLE
  { slug: 'burn', spriteId: 1361, out: 'public/assets/debuffs/burn.png' }, // Burn hitsplat (orange)
  { slug: 'poison', spriteId: 1360, out: 'public/assets/debuffs/poison.png' }, // HITSPLAT_GREEN_POISON
  { slug: 'vuln', spriteId: 20, out: 'public/assets/debuffs/vuln.png' }, // SPELL_WEAKEN
];

/** Encode one Sprite (ARGB pixels on a maxWidth×maxHeight canvas) to a PNG buffer. */
function spriteToPng(sprite) {
  const w = sprite.maxWidth || sprite.width;
  const h = sprite.maxHeight || sprite.height;
  const png = new PNG({ width: w, height: h }); // zero-filled = transparent
  const ox = sprite.offsetX || 0;
  const oy = sprite.offsetY || 0;
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      const p = sprite.pixels[y * sprite.width + x] >>> 0;
      const a = (p >>> 24) & 0xff;
      if (a === 0) continue; // transparent
      const di = ((y + oy) * w + (x + ox)) * 4;
      png.data[di + 0] = (p >>> 16) & 0xff;
      png.data[di + 1] = (p >>> 8) & 0xff;
      png.data[di + 2] = p & 0xff;
      png.data[di + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

async function main() {
  if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
    console.error(`No cache at ${CACHE_DIR}\nSet OSRS_CACHE_DIR or pass an OpenRS2 build/URL.`);
    process.exit(1);
  }
  console.log(`Loading cache: ${CACHE_DIR}`);
  const cache = new RSCache(CACHE_DIR);
  await cache.onload;

  const dumpIdx = process.argv.indexOf('--dump');
  if (dumpIdx !== -1) {
    const from = Number(process.argv[dumpIdx + 1] ?? 0);
    const to = Number(process.argv[dumpIdx + 2] ?? from);
    const dir = join(REPO, 'tmp', 'osrs-sprites');
    mkdirSync(dir, { recursive: true });
    for (let id = from; id <= to; id++) {
      const def = await cache.getDef(IndexType.SPRITES, id).catch(() => null);
      if (!def?.sprites?.length) continue;
      def.sprites.forEach((s, f) => {
        if (!s.width || !s.height) return;
        writeFileSync(join(dir, `${id}_${f}.png`), spriteToPng(s));
      });
    }
    console.log(`Dumped sprites ${from}..${to} → ${dir}`);
    process.exit(0);
  }

  for (const t of TARGETS) {
    const def = await cache.getDef(IndexType.SPRITES, t.spriteId);
    const sprite = def?.sprites?.[0];
    if (!sprite) { console.warn(`! sprite ${t.spriteId} (${t.slug}) empty — skipped`); continue; }
    const outPath = join(REPO, t.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, spriteToPng(sprite));
    console.log(`✓ ${t.slug}: sprite ${t.spriteId} → ${t.out} (${sprite.width}×${sprite.height})`);
  }
  process.exit(0);
}

main();

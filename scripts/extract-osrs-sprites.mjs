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

// All IDs below come from RuneLite's `net.runelite.api.SpriteID`. Each group maps
// an output basename → the enabled-state sprite id; only true 2D interface sprites
// are here. NPC/item/pet visuals are 3D models (a separate render track).

/** Enemy status-effect badges (enemy hover panel). */
const DEBUFF_IDS = {
  stun: 321, // SPELL_ENTANGLE
  burn: 1361, // Burn hitsplat (orange)
  poison: 1360, // HITSPLAT_GREEN_POISON
  venom: 1632, // HITSPLAT_DARK_GREEN_VENOM
  vuln: 20, // SPELL_WEAKEN
  // slow stays wiki-hot-linked: it's the Giant snail NPC *model*, not a sprite.
};

/**
 * Spellbook icons (Standard elemental + Ancient + a few Arceuus support spells).
 * Keys mirror the wiki file names used by `assets.ts`' SPELL_ICONS; the same
 * sprite doubles as the tower badge and the projectile.
 */
const SPELL_IDS = {
  Wind_Strike: 15, Water_Strike: 17, Earth_Strike: 19, Fire_Strike: 21,
  Wind_Bolt: 23, Water_Bolt: 26, Earth_Bolt: 29, Fire_Bolt: 32,
  Wind_Blast: 35, Water_Blast: 38, Earth_Blast: 40, Fire_Blast: 44,
  Wind_Wave: 46, Water_Wave: 48, Earth_Wave: 51, Fire_Wave: 52,
  Ice_Rush: 325, Ice_Burst: 326, Ice_Blitz: 327, Ice_Barrage: 328,
  Blood_Rush: 333, Blood_Burst: 334, Blood_Blitz: 335, Blood_Barrage: 336,
  Shadow_Rush: 337, Shadow_Burst: 338, Shadow_Blitz: 339, Shadow_Barrage: 340,
  Smoke_Rush: 329, Smoke_Burst: 330, Smoke_Blitz: 331, Smoke_Barrage: 332,
  Death_Charge: 1310, Undead_Grasp: 1269, Vile_Vigour: 1317,
  Curse: 24, // wave-event "Curse of Darkness" icon
};

/** Prayer icons (enabled state) for the prayer panel. */
const PRAYER_IDS = {
  burst_of_strength: 116, sharp_eye: 133, mystic_will: 134, mystic_lore: 503,
  mystic_might: 505, hawk_eye: 502, ultimate_strength: 125,
  protect_from_magic: 127, protect_from_missiles: 128, protect_from_melee: 129,
  eagle_eye: 504, piety: 946, rigour: 1420, augury: 1421,
};

/** Skill / spellbook UI icons used across the HUD. */
const MISC_IDS = {
  attack_icon: 197, strength_icon: 198, ranged_icon: 200, prayer_icon: 201,
  magic_icon: 202, hp_icon: 203, skill_herblore: 205, skill_crafting: 207,
  skill_mining: 209, skill_woodcutting: 214, slayer_icon: 216, farming_icon: 217,
  // Spellbook selector tabs (Standard / Ancient / Arceuus).
  spellbook_standard: 780, spellbook_ancient: 1583, spellbook_arceuus: 1711,
};

/** Build flat targets from a {basename: id} group under a sub-folder. */
const group = (ids, sub) =>
  Object.entries(ids).map(([slug, spriteId]) => ({ slug, spriteId, out: `public/assets/${sub}/${slug}.png` }));

/** Named sprite targets → output PNG path. */
const TARGETS = [
  ...group(DEBUFF_IDS, 'debuffs'),
  ...group(SPELL_IDS, 'spells'),
  ...group(PRAYER_IDS, 'prayers'),
  ...group(MISC_IDS, 'misc'),
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

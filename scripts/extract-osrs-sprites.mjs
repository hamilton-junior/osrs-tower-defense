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

/**
 * Minimap data-orb glyph icons — the little status symbols inside the HUD orbs
 * (hitpoints heart, prayer star, run-energy boot). The run boot doubles as the
 * Hasted affix icon. IDs verified by eyeballing a --dump of the 1055-1085 range.
 */
const ORB_IDS = {
  hitpoints: 1067, // MINIMAP_ORB_HITPOINTS — red heart
  prayer: 1068, // MINIMAP_ORB_PRAYER — white/silver star
  run_energy: 1069, // MINIMAP_ORB_RUN — run-energy boot (run OFF: brown)
  run_energy_on: 1070, // MINIMAP_ORB_RUN_ACTIVATED — the same boot, gold (run ON)
};

/** Skill / spellbook UI icons used across the HUD. */
const MISC_IDS = {
  attack_icon: 197, strength_icon: 198, defence_icon: 199, ranged_icon: 200, prayer_icon: 201,
  magic_icon: 202, hp_icon: 203, skill_herblore: 205, skill_crafting: 207,
  skill_mining: 209, skill_woodcutting: 214, slayer_icon: 216, farming_icon: 217,
  // The Smithing anvil — the skill OSRS makes weapons at, so it heads the tower
  // shop's "Forge" section. Verified by eyeballing 209..211: pickaxe, anvil, fish.
  skill_smithing: 210,
  // The Hunter paw print — the skill the road traps belong to.
  hunter_icon: 220,
  // The Construction saw over a crate — OSRS's own symbol for a thing you build.
  // It labels the Towers half of the build dock, opposite the Hunter paw.
  // (Verified by eyeballing a --dump of 204..222: the skill block runs
  // agility 204 … farming 217, then 220 hunter and 221 construction.)
  construction_icon: 221,
  // OSRS "Stats" (Skills) tab icon — the coloured bar-chart glyph. Used for the
  // DPS-meter tab, since it's the game's own damage/stats symbol.
  stats_icon: 898,
  // Spellbook selector tabs (Standard / Ancient / Arceuus).
  spellbook_standard: 780, spellbook_ancient: 1583, spellbook_arceuus: 1711,
};

/**
 * Hitsplats — the real interface splats, keyed by the core engine's
 * HitsplatKind. `miss` is the blue zero-splat: OSRS shows it only when a hit
 * genuinely landed for nothing, so nothing else in the game may borrow it.
 *
 * These ids are not guesses. The cache's own HITSPLAT config table (config type
 * 32) names the sprite behind every splat the client can draw, and the ids below
 * are read straight off it — config 6 is the heal splat, and its sprite is 1629.
 * Each splat also has a darker twin (1630/1631…), which is the version drawn on
 * *someone else's* target; the game only ever draws its own, so the bright one of
 * each pair is the right one. The wiki's Hitsplat page lists the same set by name
 * if you need to match a picture to a kind.
 */
const HITSPLAT_IDS = {
  hit: 1359,  // red damage
  miss: 1358, // blue zero-splat
  poison: 1360, // green poison
  venom: 1632, // teal venom
  burn: 1361, // orange fire DoT
  heal: 1629, // purple cross — health going *back on* a bar
  armour: 1628, // orange chestplate — the hit was stopped by a defence
  shield: 1419, // teal shield — damage eaten by a shield pool
};

/** Interface chrome / HUD sprites. */
const UI_IDS = {
  multicombat_icon: 442, // MULTI_COMBAT_ZONE_CROSSED_SWORDS
  // The four corner brackets of OSRS's own click marker (the yellow X that blooms
  // where you tap the ground; 515-518 are its animation frames, 518 the last).
  // Framing a point is the game's targeting language, which is what the `closest`
  // priority needs. Picked over a full --dump of 0..2589: nothing in the cache
  // means *distance*, since OSRS has no targeting-priority concept, so this is a
  // metaphor either way — but it is the only clean one that collides with nothing
  // else on the grid (yellow is unique there, and the shape is no one else's).
  reticle: 518,
  orb_background: 1059, // MINIMAP_ORB_EMPTY
  // Bare white arrow glyphs (no button plate) — the "most / least" markers the
  // targeting-priority buttons pair with a dimension icon. Verified by eye from a
  // --dump: the neighbouring arrows (773/788/793/794) are scrollbar buttons and
  // carry their own wood plate, which reads as a button inside a button.
  arrow_up: 1185,
  arrow_down: 1186,
  // The game's own red circle-slash "prohibited" glyph, stamped on a tower Brutus
  // has knocked offline. Picked out of a --dump of 0..2589: the other circle-slashes
  // (666/667/674) are world-map key icons and carry the thing being prohibited
  // (rocks, a blob) baked into the sprite; 940 is the bare sign on transparency, so
  // it overlays a tower without dragging a second subject onto the board.
  blocked: 940,
};

/**
 * Combat Achievement tier icons — the game's own `CaTierSwords` set (RuneLite
 * gameval SpriteID), one sword per tier in ladder order: bronze for Easy up to
 * the last blade for Grandmaster. 3399-3404 are the same six at a smaller size,
 * left alone — the unlock popup draws at icon size.
 */
const CA_TIER_IDS = {
  easy: 3393, medium: 3394, hard: 3395, elite: 3396, master: 3397, grandmaster: 3398,
};

/** Build flat targets from a {basename: id} group under a sub-folder. */
const group = (ids, sub) =>
  Object.entries(ids).map(([slug, spriteId]) => ({ slug, spriteId, out: `public/assets/${sub}/${slug}.png` }));

/**
 * Overhead protection-prayer icons — the "headicons" OSRS draws above a praying
 * character's head. These are NOT the prayer-book icons (which are bare symbols):
 * they ship with the game's own gold-disc backdrop, which is what makes them read
 * against the map. All three are frames of a single sprite archive (440), so they
 * need the `frame` field rather than the plain {name: id} group helper.
 */
const OVERHEAD_HEADICONS = [
  { slug: 'overhead_melee', spriteId: 440, frame: 0 },     // sword
  { slug: 'overhead_missiles', spriteId: 440, frame: 1 },  // arrow
  { slug: 'overhead_magic', spriteId: 440, frame: 2 },     // wand
].map((t) => ({ ...t, out: `public/assets/prayers/${t.slug}.png` }));

/**
 * Redemption's prayer-book heart, in its *lit* (unlocked / usable) state — the bright
 * teal symbol as the prayer book draws it when the prayer is available, no gold disc
 * behind it (unlike the 440 headicons above). In this block the dimmed/un-activated
 * sprite is always the lit one + 20 (130 → 150, like 133 → 153), so if the ids ever
 * shift, look for that pairing rather than the absolute number.
 *
 * The game never casts Redemption, so this is not a prayer asset: it is borrowed as
 * the mark on the start screen's "passion project" notice, and lands in ui/ so nobody
 * hunts for the prayer behind it.
 */
const REDEMPTION_HEART = { slug: 'redemption_heart', spriteId: 130, frame: 0, out: 'public/assets/ui/redemption_heart.png' };

/** Named sprite targets → output PNG path. */
const TARGETS = [
  ...OVERHEAD_HEADICONS,
  REDEMPTION_HEART,
  ...group(DEBUFF_IDS, 'debuffs'),
  ...group(SPELL_IDS, 'spells'),
  ...group(PRAYER_IDS, 'prayers'),
  ...group(MISC_IDS, 'misc'),
  ...group(ORB_IDS, 'orbs'),
  ...group(HITSPLAT_IDS, 'hitsplats'),
  ...group(UI_IDS, 'ui'),
  ...group(CA_TIER_IDS, 'achievements'),
];

/**
 * Sprites whose backdrop is opaque **black** rather than the transparent index.
 * The binding-spell nets (Bind / Snare / Entangle) are drawn in the client over
 * a spellbook page that is nearly black already, so Jagex never had to key the
 * gaps out — on our brown panels the same art arrives as a black blob with a
 * few coloured stripes in it. Dropping pure black restores the mesh.
 */
const BLACK_BG_IDS = new Set([319, 320, 321]);

/** Encode one Sprite (ARGB pixels on a maxWidth×maxHeight canvas) to a PNG buffer. */
function spriteToPng(sprite, spriteId) {
  const w = sprite.maxWidth || sprite.width;
  const h = sprite.maxHeight || sprite.height;
  const png = new PNG({ width: w, height: h }); // zero-filled = transparent
  const dropBlack = BLACK_BG_IDS.has(spriteId);
  const ox = sprite.offsetX || 0;
  const oy = sprite.offsetY || 0;
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      const p = sprite.pixels[y * sprite.width + x] >>> 0;
      const a = (p >>> 24) & 0xff;
      if (a === 0) continue; // transparent
      // Black is this sprite's background, not ink. The cache stores it as
      // 0x000001, because index 0 of a sprite palette is the transparent one.
      if (dropBlack && (p & 0xffffff) <= 1) continue;
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
        writeFileSync(join(dir, `${id}_${f}.png`), spriteToPng(s, id));
      });
    }
    console.log(`Dumped sprites ${from}..${to} → ${dir}`);
    process.exit(0);
  }

  for (const t of TARGETS) {
    const def = await cache.getDef(IndexType.SPRITES, t.spriteId);
    // Most targets are single-sprite ids, but some are *archives* of many frames
    // (the prayer headicons all live in one). `frame` picks which one; default 0.
    const frame = t.frame ?? 0;
    const sprite = def?.sprites?.[frame];
    if (!sprite) { console.warn(`! sprite ${t.spriteId}[${frame}] (${t.slug}) empty — skipped`); continue; }
    const outPath = join(REPO, t.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, spriteToPng(sprite, t.spriteId));
    console.log(`✓ ${t.slug}: sprite ${t.spriteId}[${frame}] → ${t.out} (${sprite.width}×${sprite.height})`);
  }
  process.exit(0);
}

main();

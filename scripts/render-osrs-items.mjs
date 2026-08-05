/**
 * Offline **item icon** renderer — bakes authentic OSRS inventory icons from
 * the game cache, replacing the wiki hot-links. Each item def carries the
 * client's own 2D pose (xan2d/yan2d/zan2d rotation): we render its inventory
 * model at that pose through the shared rasteriser (scripts/lib/rs-raster.mjs,
 * real textures included), in the client's exact 36×32 framing at 2× — then add
 * the classic black outline + drop shadow so it reads like the in-game icon.
 *
 *   node scripts/render-osrs-items.mjs                    # bake every TARGET
 *   node scripts/render-osrs-items.mjs --only coins       # bake one TARGET
 *   node scripts/render-osrs-items.mjs --only coins_1,coins_2   # …or a few
 *   node scripts/render-osrs-items.mjs --find scimitar    # search cache names
 *
 * Targets resolve by exact cache item NAME (case-insensitive; first non-noted,
 * non-placeholder def wins) or by explicit `{ id }`. Output:
 * public/assets/items/<slug>.png (72×64).
 */
import { RSCache, IndexType, ConfigType } from 'osrscachereader';
import { createCanvas } from 'canvas';
import UPNG from 'upng-js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { renderModelFrame, loadTextures, modelTextureIds } from './lib/rs-raster.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

// 2× the client's native 36×32 icon: crisp at UI sizes, still reads "pixel".
const SCALE = 2;
const ICON_W = 36 * SCALE, ICON_H = 32 * SCALE;

/**
 * slug → item. `name` = exact cache name (preferred; survives id renumbering),
 * `id` pins an exact def.
 * Slugs are what the app references: public/assets/items/<slug>.png.
 */
const TARGETS = {
  // ---- tower tiers: archer ----
  shortbow: { name: 'Shortbow' },
  magic_shortbow: { name: 'Magic shortbow' },
  dark_bow: { name: 'Dark bow' },
  bow_of_faerdhinen: { name: 'Bow of faerdhinen' },
  // ---- tower tiers: wizard staves / sceptres ----
  staff_of_air: { name: 'Staff of air' },
  staff_of_water: { name: 'Staff of water' },
  staff_of_earth: { name: 'Staff of earth' },
  staff_of_fire: { name: 'Staff of fire' },
  ancient_staff: { name: 'Ancient staff' },
  tumekens_shadow: { name: "Tumeken's shadow" },
  ice_ancient_sceptre: { name: 'Ice ancient sceptre' },
  blood_ancient_sceptre: { name: 'Blood ancient sceptre' },
  shadow_ancient_sceptre: { name: 'Shadow ancient sceptre' },
  smoke_ancient_sceptre: { name: 'Smoke ancient sceptre' },
  lunar_staff: { name: 'Lunar staff' },
  // ---- tower tiers: cannon (real multicannon part items) ----
  cannon_base: { name: 'Cannon base' },
  cannon_stand: { name: 'Cannon stand' },
  cannon_barrels: { name: 'Cannon barrels' },
  cannon_furnace: { name: 'Cannon furnace' },
  // ---- tower tiers: slayer ----
  darklight: { name: 'Darklight' },
  arclight: { name: 'Arclight' },
  leaf_bladed_sword: { name: 'Leaf-bladed sword' },
  emberlight: { name: 'Emberlight' },
  // ---- tower tiers: toxic ----
  tanzanite_fang: { name: 'Tanzanite fang' },
  toxic_blowpipe: { name: 'Toxic blowpipe' },
  magic_fang: { name: 'Magic fang' },
  trident_of_the_swamp: { name: 'Trident of the swamp' },
  // ---- items.ts / consumables / loot ----
  amulet_of_power: { name: 'Amulet of power' },
  anti_dragon_shield: { name: 'Anti-dragon shield' },
  combat_bracelet: { name: 'Combat bracelet' },
  silverlight: { name: 'Silverlight' },
  dragon_scimitar: { name: 'Dragon scimitar' },
  logs: { name: 'Logs' },
  iron_ore: { name: 'Iron ore' },
  grimy_guam: { name: 'Grimy guam leaf' },
  vial: { name: 'Vial' },
  guam_seed: { name: 'Guam seed' },
  ranarr_seed: { name: 'Ranarr seed' },
  potato_seed: { name: 'Potato seed' },
  potato: { name: 'Potato' },
  guam_leaf: { name: 'Guam leaf' },
  ranarr_weed: { name: 'Ranarr weed' },
  bones: { name: 'Bones' },
  coins: { name: 'Coins', id: 617 }, // fixed id: many "Coins" defs; 617 is the stack the client shows
  // The client's own coin-pile ladder. Item 995 ("Coins") carries countObj/countCo
  // pairs — the id it swaps to at each stack size — and these are those ids, read
  // out of the cache rather than off the wiki. The slug is the threshold, so the
  // UI can pick a pile by comparing numbers. 995 itself is the single coin.
  coins_1: { name: 'Coins', id: 995 },
  coins_2: { name: 'Coins', id: 996 },
  coins_3: { name: 'Coins', id: 997 },
  coins_4: { name: 'Coins', id: 998 },
  coins_5: { name: 'Coins', id: 999 },
  coins_25: { name: 'Coins', id: 1000 },
  coins_100: { name: 'Coins', id: 1001 },
  coins_250: { name: 'Coins', id: 1002 },
  coins_1000: { name: 'Coins', id: 1003 },
  coins_10000: { name: 'Coins', id: 1004 },
  adamantite_ore: { name: 'Adamantite ore' },
  pure_essence: { name: 'Pure essence' },
  rune_essence: { name: 'Rune essence' },
  // ---- GE consumables shop (data/shop.ts) ----
  prayer_potion: { name: 'Prayer potion(4)' },
  super_restore: { name: 'Super restore(4)' },
  bronze_ore: { name: 'Copper ore' }, // "bronze ore" isn't a real item; copper reads bronze
  coal: { name: 'Coal' },
  mithril_ore: { name: 'Mithril ore' },
  rune_ore: { name: 'Runite ore' },
  grimy_ranarr: { name: 'Grimy ranarr weed' },
  vial_of_water: { name: 'Vial of water' },
  eye_of_newt: { name: 'Eye of newt' },
  limpwurt_root: { name: 'Limpwurt root' },
  red_spiders_eggs: { name: "Red spiders' eggs" },
  bird_nest: { name: 'Bird nest', id: 5070 }, // several nest defs; 5070 = red-egg nest
  snape_grass: { name: 'Snape grass' },
  harralander_seed: { name: 'Harralander seed' },
  toadflax_seed: { name: 'Toadflax seed' },
  snapdragon_seed: { name: 'Snapdragon seed' },
  torstol_seed: { name: 'Torstol seed' },
  onion_seed: { name: 'Onion seed' },
  cabbage_seed: { name: 'Cabbage seed' },
  sweetcorn_seed: { name: 'Sweetcorn seed' },
  watermelon_seed: { name: 'Watermelon seed' },
  snape_grass_seed: { name: 'Snape grass seed' },
  big_bones: { name: 'Big bones' },
  dragon_bones: { name: 'Dragon bones' },
  oak_logs: { name: 'Oak logs' },
  willow_logs: { name: 'Willow logs' },
  yew_logs: { name: 'Yew logs' },
  magic_logs: { name: 'Magic logs' },
  // ---- HUD / mode icons that are real items ----
  dwarf_multicannon: { name: 'Dwarf cannon set' }, // assembled multicannon item
  collection_log: { name: 'Collection log' },
  // ---- relics / affixes / events / draft-card icons ----
  abyssal_whip: { name: 'Abyssal whip' },
  ahrims_staff: { name: "Ahrim's staff" },
  amulet_of_fury: { name: 'Amulet of fury' },
  ancestral_robe_top: { name: 'Ancestral robe top' },
  ancient_sceptre: { name: 'Ancient sceptre' },
  anglerfish: { name: 'Anglerfish' },
  archers_ring: { name: 'Archers ring' },
  avas_assembler: { name: "Ava's assembler" },
  bandages: { name: 'Bandages' },
  bank_note: { name: "Banker's note" }, // no "Bank note" item def; Banker's note reads the same
  bastion_potion: { name: 'Bastion potion(4)' },
  battlemage_potion: { name: 'Battlemage potion(4)' },
  battlestaff: { name: 'Battlestaff' },
  berserker_helm: { name: 'Berserker helm' },
  berserker_necklace: { name: 'Berserker necklace' },
  berserker_ring: { name: 'Berserker ring' },
  blessed_bone_shards: { name: 'Blessed bone shards' },
  blood_rune: { name: 'Blood rune' },
  blood_shard: { name: 'Blood shard' },
  clan_vexillum: { name: 'Clan vexillum' },
  clue_scroll_master: { name: 'Clue scroll (master)' },
  daeyalt_essence: { name: 'Daeyalt essence' },
  dinhs_bulwark: { name: "Dinh's bulwark" },
  divine_ranging_potion: { name: 'Divine ranging potion(4)' },
  dragon_boots: { name: 'Dragon boots' },
  dragon_claws: { name: 'Dragon claws' },
  dragon_dart: { name: 'Dragon dart' },
  dragon_halberd: { name: 'Dragon halberd' },
  dragon_kiteshield: { name: 'Dragon kiteshield' },
  dragon_knife: { name: 'Dragon knife' },
  dragon_longsword: { name: 'Dragon longsword' },
  dragon_platebody: { name: 'Dragon platebody' },
  dragon_warhammer: { name: 'Dragon warhammer' },
  dragonstone: { name: 'Dragonstone' },
  elder_maul: { name: 'Elder maul' },
  elite_void_top: { name: 'Elite void top' },
  enchanted_gem: { name: 'Enchanted gem' },
  eternal_boots: { name: 'Eternal boots' },
  fire_cape: { name: 'Fire cape' },
  ghostly_hood: { name: 'Ghostly hood' },
  graceful_boots: { name: 'Graceful boots' },
  granite_maul: { name: 'Granite maul' },
  harmonised_nightmare_staff: { name: 'Harmonised nightmare staff' },
  heavy_ballista: { name: 'Heavy ballista' },
  hunter_potion: { name: 'Hunter potion(4)' },
  ibans_staff: { name: "Iban's staff" },
  imbued_heart: { name: 'Imbued heart' },
  inquisitors_great_helm: { name: "Inquisitor's great helm" },
  justiciar_chestguard: { name: 'Justiciar chestguard' },
  kodai_insignia: { name: 'Kodai insignia' },
  kodai_wand: { name: 'Kodai wand' },
  looting_bag: { name: 'Looting bag' },
  magic_longbow: { name: 'Magic longbow' },
  magic_shortbow_i: { name: 'Magic shortbow (i)' },
  magic_potion: { name: 'Magic potion(4)' },
  masori_body: { name: 'Masori body' },
  nightmare_staff: { name: 'Nightmare staff' },
  noxious_halberd: { name: 'Noxious halberd' },
  occult_necklace: { name: 'Occult necklace' },
  overload_4: { name: 'Overload (4)' },
  pegasian_boots: { name: 'Pegasian boots' },
  phoenix_necklace: { name: 'Phoenix necklace' },
  ranger_boots: { name: 'Ranger boots' },
  ranging_potion: { name: 'Ranging potion(4)' },
  regen_bracelet: { name: 'Regen bracelet' },
  reward_casket_elite: { name: 'Reward casket (elite)' },
  reward_casket_master: { name: 'Reward casket (master)' },
  ring_of_life: { name: 'Ring of life' },
  ring_of_wealth: { name: 'Ring of wealth' },
  rune_halberd: { name: 'Rune halberd' },
  rune_kiteshield: { name: 'Rune kiteshield' },
  rune_knife: { name: 'Rune knife' },
  rune_platebody: { name: 'Rune platebody' },
  rune_scimitar: { name: 'Rune scimitar' },
  saradomin_banner: { name: 'Saradomin banner' },
  saradomin_brew: { name: 'Saradomin brew(4)' },
  scythe_of_vitur: { name: 'Scythe of vitur' },
  seers_ring: { name: 'Seers ring' },
  shark: { name: 'Shark' },
  slayer_helmet: { name: 'Slayer helmet' },
  // Slayer-rewards shop: each unlock wears the item it actually is in game.
  slayer_helmet_i: { name: 'Slayer helmet (i)' },
  bracelet_of_slaughter: { name: 'Bracelet of slaughter' },
  slayer_ring: { name: 'Slayer ring (8)' },
  giant_pouch: { name: 'Giant pouch' },
  eternal_gem: { name: 'Eternal gem' },
  soul_rune: { name: 'Soul rune' },
  spirit_shield: { name: 'Spirit shield' },
  stamina_potion: { name: 'Stamina potion(4)' },
  strength_potion: { name: 'Strength potion(4)' },
  super_combat_potion: { name: 'Super combat potion(4)' },
  super_strength: { name: 'Super strength(4)' },
  tokkul: { name: 'Tokkul' },
  tome_of_fire: { name: 'Tome of fire' },
  trident_of_the_seas: { name: 'Trident of the seas' },
  twisted_bow: { name: 'Twisted bow' },
  void_knight_top: { name: 'Void knight top' },
  volatile_orb: { name: 'Volatile nightmare staff' }, // orb itself is untradeable attachment; staff icon reads better
  wolf_mask: { name: 'Wolf mask' },
  zenyte: { name: 'Zenyte' },
  // The clue-scroll compass — stands in for elapsed time / "survived" in the
  // end-of-run summary (OSRS has no clock sprite in the cache).
  compass: { name: 'Compass' },
  // ---- Classic-mode gear (data/gear.ts) — legacy weapon pool (superseded by
  // the ammo/jewellery rework below; left baked since other slugs still share
  // these keys, e.g. granite_cannonball/cannonball are reused by AMMO_TIERS) ----
  iron_scimitar: { name: 'Iron scimitar' },
  warhammer: { name: 'Warhammer' },
  tzhaar_ket_om: { name: 'Tzhaar-ket-om' },
  granite_cannonball: { name: 'Granite cannonball' },
  cannonball: { name: 'Steel cannonball', id: 2 }, // no plain "Cannonball" def; id 2 is THE classic cannonball
  mystic_staff: { name: 'Mystic air staff' }, // stand-in: no plain "Mystic staff" def exists
  // ---- Classic-mode gear: ammo/jewellery rework (data/gear.ts AMMO_TIERS /
  // JEWELLERY_TIERS / SIGNATURES) — slug === gear id, matched by exact cache
  // item name (confirmed via --find before baking; see task-3-report.md). ----
  bronze_arrow: { name: 'Bronze arrow' },
  iron_arrow: { name: 'Iron arrow' },
  steel_arrow: { name: 'Steel arrow' },
  mithril_arrow: { name: 'Mithril arrow' },
  adamant_arrow: { name: 'Adamant arrow' },
  rune_arrow: { name: 'Rune arrow' },
  amethyst_arrow: { name: 'Amethyst arrow' },
  dragon_arrow: { name: 'Dragon arrow' },
  bronze_dart: { name: 'Bronze dart' },
  iron_dart: { name: 'Iron dart' },
  steel_dart: { name: 'Steel dart' },
  black_dart: { name: 'Black dart' },
  mithril_dart: { name: 'Mithril dart' },
  adamant_dart: { name: 'Adamant dart' },
  rune_dart: { name: 'Rune dart' },
  // dragon_dart already baked above (relics group).
  mind_rune: { name: 'Mind rune' },
  chaos_rune: { name: 'Chaos rune' },
  death_rune: { name: 'Death rune' },
  wrath_rune: { name: 'Wrath rune' },
  tome_of_water: { name: 'Tome of water' },
  tome_of_earth: { name: 'Tome of earth' },
  mages_book: { name: "Mage's book" },
  // blood_rune / tome_of_fire already baked above (relics group).
  bronze_gloves: { name: 'Bronze gloves' },
  iron_gloves: { name: 'Iron gloves' },
  steel_gloves: { name: 'Steel gloves' },
  black_gloves: { name: 'Black gloves' },
  mithril_gloves: { name: 'Mithril gloves' },
  adamant_gloves: { name: 'Adamant gloves' },
  rune_gloves: { name: 'Rune gloves' },
  dragon_gloves: { name: 'Dragon gloves' },
  barrows_gloves: { name: 'Barrows gloves' },
  bronze_defender: { name: 'Bronze defender' },
  iron_defender: { name: 'Iron defender' },
  steel_defender: { name: 'Steel defender' },
  black_defender: { name: 'Black defender' },
  mithril_defender: { name: 'Mithril defender' },
  adamant_defender: { name: 'Adamant defender' },
  rune_defender: { name: 'Rune defender' },
  dragon_defender: { name: 'Dragon defender' },
  avernic_defender: { name: 'Avernic defender' },
  amulet_of_strength: { name: 'Amulet of strength' },
  amulet_of_glory: { name: 'Amulet of glory' },
  amulet_of_torture: { name: 'Amulet of torture' },
  // amulet_of_power / amulet_of_fury already baked above (relics group).
  amulet_of_blood_fury: { name: 'Amulet of blood fury' },
  salve_amulet_ei: { name: 'Salve amulet(ei)' }, // cache name has no space before "(ei)"
};

// ------------------------------------------------------------------- helpers

/**
 * Parse an item (obj) config ourselves — osrscachereader 1.1.3's ItemLoader
 * desyncs on the newer opcodes (43 subops / 44 / 45), leaving every def
 * name-less. Same byte-walking fix as the NPC/spotanim parsers. Only the
 * fields the icon renderer needs are kept.
 */
function parseItemDef(content, id) {
  const b = new Uint8Array(content.buffer ?? content);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u8 = () => b[p++];
  const i8 = () => dv.getInt8(p++);
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const i32 = () => { const v = dv.getInt32(p); p += 4; return v; };
  const str = () => { const s = p; while (b[p] !== 0) p++; const out = Buffer.from(b.slice(s, p)).toString('latin1'); p++; return out; };
  const def = {
    id, name: null, inventoryModel: -1, zoom2d: 2000, xan2d: 0, yan2d: 0, zan2d: 0,
    xOffset2d: 0, yOffset2d: 0, recolorToFind: [], recolorToReplace: [],
    retextureToFind: [], retextureToReplace: [], notedTemplate: -1, placeholderTemplateId: -1,
  };
  while (p < b.length) {
    const op = u8();
    if (op === 0) return def;
    else if (op === 1) def.inventoryModel = u16();
    else if (op === 2) def.name = str();
    else if (op === 3) str();                       // examine
    else if (op === 4) def.zoom2d = u16();
    else if (op === 5) def.xan2d = u16();
    else if (op === 6) def.yan2d = u16();
    else if (op === 7) { def.xOffset2d = u16(); if (def.xOffset2d > 32767) def.xOffset2d -= 65536; }
    else if (op === 8) { def.yOffset2d = u16(); if (def.yOffset2d > 32767) def.yOffset2d -= 65536; }
    else if (op === 9) str();
    else if (op === 11) { /* stackable */ }
    else if (op === 12) i32();                      // cost
    else if (op === 13 || op === 14 || op === 27) u8(); // wear positions
    else if (op === 16) { /* members */ }
    else if (op === 23 || op === 25) { u16(); u8(); }   // male/female model + offset
    else if (op === 24 || op === 26) u16();
    else if (op >= 30 && op <= 39) str();           // ground/inventory actions
    else if (op === 40 || op === 41) {
      const n = u8();
      for (let i = 0; i < n; i++) {
        const f = u16(), r = u16();
        if (op === 40) { def.recolorToFind.push(f); def.recolorToReplace.push(r); }
        else { def.retextureToFind.push(f); def.retextureToReplace.push(r); }
      }
    }
    else if (op === 42) i8();                       // shift-click drop index
    else if (op === 43) {                           // sub-ops: index + string list
      u8();
      for (;;) { const more = u8(); if (!more) break; str(); }
    }
    // rev-233 relocated model opcodes (verified by hand-walking defs 4587, 0,
    // 74, 2653, 12251, 13647): 44 = inventory model u32; 45/48 = male/female
    // wear model u32 + u8 offset; 46-47/49-50 secondary+tertiary wear models,
    // 51-54 head models — all u32. 15/160 are flags (160 only on stackables).
    else if (op === 44) def.inventoryModel = u32();
    else if (op === 45 || op === 48) { u32(); u8(); }
    else if (op === 46 || op === 47 || (op >= 49 && op <= 54)) u32();
    else if (op === 15 || op === 160) { /* flags */ }
    else if (op === 65) { /* tradeable */ }
    else if (op === 75) { p += 2; }                 // weight
    else if (op === 78 || op === 79 || (op >= 90 && op <= 94)) u16();
    else if (op === 95) def.zan2d = u16();
    else if (op === 97) u16();                      // notedID
    else if (op === 98) def.notedTemplate = u16();
    else if (op >= 100 && op <= 109) { u16(); u16(); } // count variants
    else if (op >= 110 && op <= 112) u16();         // resize
    else if (op === 113 || op === 114) i8();        // ambient / contrast
    else if (op === 115) u8();                      // team
    else if (op === 139 || op === 140) u16();       // bought link
    else if (op === 148) u16();                     // placeholderId
    else if (op === 149) def.placeholderTemplateId = u16();
    else if (op === 249) {                          // params map
      const n = u8();
      for (let i = 0; i < n; i++) { const isStr = u8() === 1; p += 3; if (isStr) str(); else p += 4; }
    }
    else return { ...def, _abortOp: op };           // unknown → bail, flag it
  }
  return def;
}

/**
 * Replicate the client's inventory-icon transform exactly (RuneLite
 * ItemSpriteFactory → Model.projectAndDraw): roll (zan2d) → yaw (yan2d) →
 * translate by the zoom2d camera offsets (+ model half-height + 2D offsets) →
 * pitch (xan2d) → perspective divide. Angles are 2048 = 2π. Cache Y is
 * down-positive like the canvas, so screen x/y pass straight through — any
 * extra flip or reordering shows up as the upside-down/mirrored icons this
 * replaced. Returns [sx, sy, depth] verts for renderModelFrame with an
 * identity camera (the focal constant is absorbed by the auto-fit scale).
 */
function clientIconVerts(model, def) {
  const rad = (a) => (a / 2048) * Math.PI * 2;
  const sinC = Math.sin(rad(def.zan2d)), cosC = Math.cos(rad(def.zan2d));
  const sinB = Math.sin(rad(def.yan2d)), cosB = Math.cos(rad(def.yan2d));
  const sinD = Math.sin(rad(def.xan2d)), cosD = Math.cos(rad(def.xan2d));
  // calculateBoundsCylinder's height: the highest point above ground (-y up).
  let height = 0;
  for (let i = 0; i < model.vertexCount; i++) height = Math.max(height, -model.vertexPositionsY[i]);
  // Client quirk (ItemSpriteFactory): yOffset2d is added to BOTH the y and z
  // translations (zOffset = cos·zoom + yOffset2d), not just y.
  const dy = sinD * def.zoom2d + height / 2 + def.yOffset2d;
  const dz = cosD * def.zoom2d + def.yOffset2d;
  const out = [];
  for (let i = 0; i < model.vertexCount; i++) {
    let x = model.vertexPositionsX[i], y = model.vertexPositionsY[i], z = model.vertexPositionsZ[i];
    if (def.zan2d) { const t = y * sinC + x * cosC; y = y * cosC - x * sinC; x = t; }
    if (def.yan2d) { const t = z * sinB + x * cosB; z = z * cosB - x * sinB; x = t; }
    x += def.xOffset2d; y += dy; z += dz;
    // Pitch sign check: it must take the translated origin (0, sin·zoom,
    // cos·zoom) to (0, 0, zoom) — centred on screen at camera distance.
    if (def.xan2d) { const t = y * cosD - z * sinD; z = y * sinD + z * cosD; y = t; }
    const zz = Math.max(z, 50); // guard degenerate defs from a behind-camera divide
    out.push([(x * 512) / zz, (y * 512) / zz, z]);
  }
  return out;
}

/** Classic icon treatment: black outline around the sprite + dark drop shadow. */
function outlineAndShadow(img, w, h) {
  const src = img.data;
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  const res = ctx.createImageData(w, h);
  const d = res.data;
  const a = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? src[(y * w + x) * 4 + 3] : 0);
  const OFF = SCALE; // shadow offset = 1px at native scale
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 8) {
        d[i] = src[i]; d[i + 1] = src[i + 1]; d[i + 2] = src[i + 2]; d[i + 3] = 255;
      } else if (a(x - 1, y) > 8 || a(x + 1, y) > 8 || a(x, y - 1) > 8 || a(x, y + 1) > 8) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255; // outline
      } else if (a(x - OFF, y - OFF) > 8) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 150; // shadow
      }
    }
  }
  ctx.putImageData(res, 0, 0);
  return out;
}

/** Render the icon pose once → 36×32-aspect crop → outline + shadow canvas. */
function renderIcon(model, verts, fit, size, textures) {
  const img = renderModelFrame(model, verts, fit, 0, 1, 0, 1, size, textures);
  const sq = createCanvas(size, size);
  sq.getContext('2d').putImageData(img, 0, 0);
  const iconRaw = createCanvas(ICON_W, ICON_H);
  iconRaw.getContext('2d').drawImage(sq, (size - ICON_W) / 2, (size - ICON_H) / 2, ICON_W, ICON_H, 0, 0, ICON_W, ICON_H);
  const raw = iconRaw.getContext('2d').getImageData(0, 0, ICON_W, ICON_H);
  return outlineAndShadow(raw, ICON_W, ICON_H);
}

/** A copy of texture `t` scrolled `off` px along its animation direction
 *  (odd dirs scroll v, even scroll u; 3/4 run negative), wrapping round. */
function scrollTexture(t, off) {
  const c = createCanvas(t.w, t.h);
  const ctx = c.getContext('2d');
  const vert = t.animDir % 2 === 1;
  const span = vert ? t.h : t.w;
  const o = (((t.animDir >= 3 ? -off : off) % span) + span) % span;
  if (vert) { ctx.drawImage(t.canvas, 0, o - span); ctx.drawImage(t.canvas, 0, o); }
  else { ctx.drawImage(t.canvas, o - span, 0); ctx.drawImage(t.canvas, o, 0); }
  return c;
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
  const onlyIdx = argv.indexOf('--only');
  // Comma-separated, because indexing the item archive is the slow part and it
  // happens once per run: baking a related set (the coin piles) one slug at a
  // time would pay that cost over again for each.
  const only = onlyIdx !== -1 ? new Set(argv[onlyIdx + 1].split(',').map((s) => s.trim())) : null;

  // One pass over the item configs: name → first real (non-noted/placeholder)
  // def. Parsed by parseItemDef (see above) — the packaged loader desyncs.
  console.log('Indexing item names…');
  const files = await cache.getAllFiles(IndexType.CONFIGS, ConfigType.ITEM);
  const byName = new Map();
  const byId = new Map();
  const aborts = new Map();
  for (const f of files) {
    if (!f?.content) continue;
    let def;
    try {
      def = parseItemDef(f.content, f.id ?? f.fileId);
    } catch {
      aborts.set('range', (aborts.get('range') ?? 0) + 1);
      continue;
    }
    if (def._abortOp !== undefined) { aborts.set(def._abortOp, (aborts.get(def._abortOp) ?? 0) + 1); continue; }
    byId.set(def.id, def);
    if (!def.name || def.name === 'null') continue;
    if (def.notedTemplate !== -1 || def.placeholderTemplateId !== -1) continue;
    const key = def.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, def);
  }
  console.log(`  ${byName.size} unique item names`);
  if (aborts.size) console.warn(`  ! parse aborts on opcodes: ${JSON.stringify([...aborts.entries()])}`);

  if (findIdx !== -1) {
    const needle = (argv[findIdx + 1] ?? '').toLowerCase();
    for (const [name, def] of byName) {
      if (name.includes(needle)) console.log(`${String(def.id).padStart(6)}  ${def.name}`);
    }
    process.exit(0);
  }

  const entries = Object.entries(TARGETS).filter(([slug]) => !only || only.has(slug));
  const outDir = join(REPO, 'public', 'assets', 'items');
  mkdirSync(outDir, { recursive: true });

  let ok = 0, missing = [];
  for (const [slug, cfg] of entries) {
    const def = cfg.id != null ? byId.get(cfg.id) : byName.get(cfg.name.toLowerCase());
    if (!def) { missing.push(`${slug} (${cfg.name ?? cfg.id})`); continue; }
    const model = await cache.getDef(IndexType.MODELS, def.inventoryModel).catch(() => null);
    if (!model) { missing.push(`${slug} (model ${def.inventoryModel})`); continue; }

    // Item recolour/retexture before rendering.
    if (def.recolorToFind?.length) {
      const map = new Map();
      def.recolorToFind.forEach((c, i) => map.set(c & 0xffff, def.recolorToReplace[i] & 0xffff));
      for (let i = 0; i < model.faceColors.length; i++) {
        const r = map.get(model.faceColors[i] & 0xffff);
        if (r !== undefined) model.faceColors[i] = r;
      }
    }
    const textures = await loadTextures(cache, modelTextureIds(model));

    // The def's own icon pose, transformed exactly like the client would.
    const verts = clientIconVerts(model, def);
    const size = Math.max(ICON_W, ICON_H);
    // Client framing, not an auto-fit: the icon raster is 36×32 with its
    // centre at (16,16) (ItemSpriteFactory does setOffset(16,16)) and zoom2d
    // already baked into the perspective divide — so a dagger really is
    // smaller than a 2h sword in its slot. Mapping that raster onto our
    // square 2× canvas (72×72, later centre-cropped to 72×64) gives
    // sx = 2·px+32, sy = 2·py+36 ⇒ fit {scale: SCALE, cx: 2, cy: 0}.
    const fit = { scale: SCALE, cx: ICON_W / (2 * SCALE) - 16, cy: ICON_H / (2 * SCALE) - 16 };

    // Animated textures (fire cape's lava, magic logs' sparkle, the msbi
    // string): the client scrolls the texture `animSpeed` px per 20ms engine
    // tick along `animDir`. Bake one full wrap as an APNG — browsers animate
    // it in <img>; canvas drawImage falls back to the first frame. Everything
    // else stays a plain single-frame PNG.
    const animated = [...textures.values()].filter((t) => t.animDir !== 0 && t.animSpeed !== 0);
    if (animated.length) {
      // Ticks for the slowest animated texture to wrap = the seamless loop.
      const period = Math.max(...animated.map((t) => (t.animDir % 2 === 1 ? t.h : t.w) / t.animSpeed));
      const N = Math.min(16, Math.max(2, Math.round(period)));
      const step = period / N; // ticks per APNG frame
      const frames = [], delays = [];
      for (let i = 0; i < N; i++) {
        const scrolled = new Map(textures);
        for (const [id, t] of textures) {
          if (t.animDir === 0 || t.animSpeed === 0) continue;
          scrolled.set(id, { ...t, canvas: scrollTexture(t, Math.round(i * step * t.animSpeed)) });
        }
        const icon = renderIcon(model, verts, fit, size, scrolled);
        frames.push(icon.getContext('2d').getImageData(0, 0, ICON_W, ICON_H).data.buffer);
        delays.push(Math.round(step * 20)); // client engine tick = 20ms
      }
      writeFileSync(join(outDir, `${slug}.png`), Buffer.from(UPNG.encode(frames, ICON_W, ICON_H, 0, delays)));
      console.log(`  ~ ${slug}: animated (${N} frames @ ${delays[0]}ms)`);
    } else {
      const icon = renderIcon(model, verts, fit, size, textures);
      writeFileSync(join(outDir, `${slug}.png`), icon.toBuffer('image/png'));
    }
    ok++;
  }
  console.log(`✓ ${ok}/${entries.length} icons → public/assets/items/`);
  if (missing.length) console.warn(`! unresolved:\n  ${missing.join('\n  ')}`);
  process.exit(0);
}

main();

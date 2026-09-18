/**
 * Offline scenery (LOC / object) renderer — companion to render-osrs-npcs.mjs.
 * Rasterises 3D **object models** (trees, farming patches, the dwarf
 * multicannon assembly stages) from the cache to PNGs so scenery icons no
 * longer hot-link the wiki.
 *
 * Pipeline: raw object config → parseObjectDef (opcode walker) → model ids →
 * merge (ModelGroup) → recolour → shared rs-raster rasterise → PNG into
 * public/assets/objects/<slug>.png. Build-time/offline only.
 *
 *   node scripts/render-osrs-objects.mjs                # render every TARGET
 *   node scripts/render-osrs-objects.mjs --only tree    # render one TARGET
 *   node scripts/render-osrs-objects.mjs --find oak    # search cache names
 *   node scripts/render-osrs-objects.mjs --only a,b      # re-bake a subset
 *
 * Why a hand-rolled parser: osrscachereader 1.1.3's ObjectLoader desyncs on
 * the current cache (object model ids outgrew 16 bits; the old model opcodes
 * 1/5 were replaced by **6** = u8 count × (u32 model + u8 type) and **7** =
 * u8 count × u32 model). We patch the loader so getFile doesn't throw, then
 * walk the bytes ourselves. Layout confirmed against known defs (Dwarf
 * multicannon → model 2328, cannon base/stand/barrels → 1800/1801/1802).
 */
import { RSCache, IndexType, ConfigType, ModelGroup } from 'osrscachereader';
import { createCanvas } from 'canvas';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { renderModelFrame, loadTextures, modelTextureIds, computeFit } from './lib/rs-raster.mjs';
import { Obj } from '@abextm/cache2';
import { defsCache } from './lib/npc-def.mjs';

// Survive the lib's opcode desync: getFile keeps the raw bytes we parse below.
const ObjectLoader = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules/osrscachereader/src/cacheReader/loaders/ObjectLoader.js')).href)).default;
const origLoad = ObjectLoader.prototype.load;
ObjectLoader.prototype.load = function (bytes, id) {
  try { return origLoad.call(this, bytes, id); } catch { return { id }; }
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || DEFAULT_CACHE;

const SIZE = 256;
/** Supersampling: render each cell this many times over and box it down. Cache models
 *  are low-poly, so their hard polygon silhouettes read as "the mesh is showing" long
 *  before their shading does. Costs bake time only — the output size is unchanged. */
const SS = 2;
const MARGIN = 0.12;

/**
 * Render targets: slug → object id (+ optional camera overrides).
 * Ground-plane scenery (farming patches) needs a high pitch to read at all.
 */
const TARGETS = {

  tree: { obj: 1276 },                        // classic "Tree" (Chop down)

  // Cannon tower tier icons — four *distinct*, fully-built cannons (a
  // half-assembled multicannon firing made no sense), weakest → strongest:
  // the Goblin paint cannon (2014 event; item 12727's model — no placed LOC
  // exists, so borrow the multicannon def purely as the config shell), the
  // ship cannon (Cabin Fever, armed), the Dwarf multicannon, and the
  // Shattered Relics ornament-kit multicannon.
  // Yaws picked from an 8-way contact sheet so every cannon reads side-on
  // with the muzzle to the RIGHT (the game's canonical facing) — a tower
  // model must look like it's aiming down the lane, not at the camera.
  goblin_paint_cannon: { obj: 6, models: [3075], yaw: 45 },
  ship_cannon: { obj: 11214, yaw: 45 },
  dwarf_multicannon: { obj: 6, yaw: 225 },
  shattered_cannon: { obj: 43027, yaw: 225 },

  // The allotment's ground (patch shell 8550/8150). patch_empty is a raked-soil
  // overlay quad coplanar with the black base quad; the client separates them by
  // render priority, our painter sort can't — so render just the brown tilled-soil
  // overlay (model 8223). Ground-decor quads are wound for the client's no-cull
  // decor path, so backface culling must be off or the quad vanishes.
  //
  // Straight down (pitch 90) and square to the axes (yaw 0): the board is top-down,
  // and at the isometric default the quad landed as a diamond squeezed into a tile,
  // which is most of why players couldn't tell a patch from the grass.
  //
  // `margin: 0` because this one is not a portrait of an object — it is a floor,
  // and the drawing code stretches the whole PNG across one tile. At the default
  // 12% the soil came out inset on every side, so the tile's own edge fell on
  // empty pixels and the plot had no border to read.
  //
  // `groundTex` is the last piece. Model 8223 is two untextured triangles: the
  // client paints it in one flat colour and lets the *ground* under it carry the
  // grain, which our board has no equivalent of, so the plot arrived as a plain
  // olive square that a green herb icon disappeared into. Texture 32 is OSRS's own
  // dirt, multiplied over the model's own colour — every pixel still comes out of
  // the cache, and the herb now sits on soil instead of on a swatch.
  //
  // The crop stages are NOT baked. Objects 8558/8559/8562 are the *potato* ladder,
  // and the board grows whatever seed the player bought — so what stands in the
  // soil is that seed's own item icon (core/render/farming.ts), not scenery.
  patch_empty: { obj: 8573, pitch: 90, yaw: 0, models: [8223], cull: false, margin: 0, groundTex: 32, groundTile: 128 },

  // ── The board's ground and its two liquids ─────────────────────────────────
  //
  // There is no LOC to render for any of these: ground in OSRS is a **floor
  // overlay**, so what a player recognises is the texture itself, not a model.
  // These targets therefore name a texture instead of an object, and `raw` writes
  // it at its own size with no repeat — the board tiles it as a canvas pattern,
  // one texture square per tile, the way the client maps it to the terrain.
  //
  // Which id is which ground was picked by eye off a contact sheet of the whole
  // texture index (three passes, tiled 2x2 so the seams showed, then a zoom pass
  // over the shortlist tiled 3x3). Two rules came out of it and both are load
  // bearing: a texture whose palette holds the transparent slot (the black in the
  // sheet) is a *detail overlay* the client lays over a colour, so tiling it as a
  // floor reads as noise rather than as ground; and a floor has to stay low in
  // contrast, because the board repeats it 225 times.
  //
  // Each region names the floor it is mostly paved with first, and then one or two
  // accents `core/render/terrain.ts` scatters over it as soft blots. The base is a
  // pattern fill now, so it wants the flattest, least directional texture of the set
  // — a texture with lines in it is fine as an accent and reads as a ruled seam when
  // it is the floor.
  //
  // A region's floors also have to differ from its neighbours'. Morytania and the
  // Wilderness were paved from the same two textures and read as one region with
  // the lights turned down; each now owns its palette outright — Morytania a wet
  // swamp under the Slayer Tower, the Wilderness burnt earth and charred grit.
  ground_lumbridge_a: { tex: 129, raw: true, dir: 'terrain' },  // meadow grass
  // 25 stood here and paved the shire teal: it is a blue-green moss, not pasture.
  ground_lumbridge_b: { tex: 191, raw: true, dir: 'terrain' },  // leafy grass
  ground_lumbridge_c: { tex: 32, raw: true, dir: 'terrain' },   // trodden dirt
  ground_lumbridge_d: { tex: 203, raw: true, dir: 'terrain' },  // dry grass tufts
  ground_alkharid_a: { tex: 18, raw: true, dir: 'terrain' },    // flat sand
  // 38 was the dune ripples, and ripples are ruled lines: every blot of it laid a
  // streak across the desert and the eye joined the streaks into paths. 42 is the
  // same sand with no direction in it at all, so a blot only ever reads as sand.
  ground_alkharid_b: { tex: 42, raw: true, dir: 'terrain' },    // drifted sand
  ground_alkharid_c: { tex: 118, raw: true, dir: 'terrain' },   // wind-packed grit
  ground_morytania_a: { tex: 190, raw: true, dir: 'terrain' },  // swamp moss
  ground_morytania_b: { tex: 178, raw: true, dir: 'terrain' },  // standing silt
  ground_morytania_c: { tex: 201, raw: true, dir: 'terrain' },  // rotted mulch
  ground_morytania_d: { tex: 193, raw: true, dir: 'terrain' },  // churned bog
  ground_wilderness_a: { tex: 117, raw: true, dir: 'terrain' }, // burnt earth
  ground_wilderness_b: { tex: 119, raw: true, dir: 'terrain' }, // charred grit
  ground_wilderness_c: { tex: 204, raw: true, dir: 'terrain' }, // dead scrub
  ground_trollweiss_a: { tex: 91, raw: true, dir: 'terrain' },  // snow
  ground_trollweiss_b: { tex: 1, raw: true, dir: 'terrain' },   // packed ice
  ground_karamja_a: { tex: 32, raw: true, dir: 'terrain' },     // jungle mud
  ground_karamja_b: { tex: 129, raw: true, dir: 'terrain' },    // clearing grass
  // Texture 25 used to sit here and cast the whole jungle floor teal — it is a
  // blue-green moss, and against the mud base it read as swamp rather than
  // rainforest. 195 replaced it and went too far the other way: a high-contrast
  // yellow lichen the jungle's own dark trees disappeared into. 192 and 199 are
  // the quiet ones, so what the eye picks out of the floor is the tree on it.
  ground_karamja_c: { tex: 192, raw: true, dir: 'terrain' },    // leaf litter
  ground_karamja_d: { tex: 199, raw: true, dir: 'terrain' },    // shaded undergrowth
  // Mor Ul Rek is black rock and molten seams, and it was paved with 89 — the same
  // dark moss Morytania rots on — which under the cavern's own tint came out as
  // recoloured sand. 119 is the basalt grit, 59 the cooling crust that cracks
  // orange, 95 the obsidian sheet the city is cut from.
  ground_tzhaar_a: { tex: 119, raw: true, dir: 'terrain' },     // black basalt
  ground_tzhaar_b: { tex: 59, raw: true, dir: 'terrain' },      // cooling crust
  ground_tzhaar_c: { tex: 95, raw: true, dir: 'terrain' },      // obsidian sheet
  liquid_water: { tex: 24, raw: true, dir: 'terrain' },
  liquid_lava: { tex: 31, raw: true, dir: 'terrain' },

  // The wooden direction signpost — the one standing beside the Lumbridge Guide,
  // and OSRS's own symbol for "the road splits here". Model 1402 is shared by every
  // classic signpost def; 15522 is just the shell we read it out of. Yaw 0 on
  // purpose: swept 0/20/40/60/90, and only flat-on keeps the board wide enough to
  // read at the 1.4em the travel modal draws it.
  signpost: { obj: 15522, yaw: 0 },

  /**
   * **The Bandos symbol**, cut out of his own altar (LOC 26366): the god's sigil stands
   * on a pole above the altar's skulls, and this is the only place in the cache the
   * emblem exists as *geometry* — everywhere else (kiteshield, platebody, godsword) it
   * is a texture painted onto armour, which this flat rasteriser cannot render.
   *
   * So: face-on (yaw 180, pitch 0), then `crop` keeps the sigil and drops the altar
   * under it. It marks a body General Graardor's slam has shaken free of crowd control,
   * and lives in `ui/` because nothing in the game is this scenery object — it is an
   * interface mark that happens to be built from a piece of scenery.
   */
  bandos_symbol: { obj: 26366, yaw: 180, pitch: 0, crop: [78, 4, 182, 101], dir: 'ui' },

  /**
   * **Party balloons**, the ones the Party Room drops: LOC 115 is the plain balloon and
   * 116 to 120 are the same model recoloured, so the six cover every colour the room
   * throws. Each def lists three models for three placement shapes; a balloon standing
   * on a tile is shape 10, model 2228, so that is the one rendered. The mesh lies on
   * its side with the knot along +x, and that is how it rests on the floor: the def's
   * animation (498) is the drop from the ceiling, and its last frame lands the balloon
   * in exactly the pose the cache stores. So no `roll`: standing it on its knot drew a
   * balloon hanging in the air. Party Pete leaves a handful of these behind, each a
   * random colour.
   */
  party_balloon_0: { obj: 115, models: [2228] },
  party_balloon_1: { obj: 116, models: [2228] },
  party_balloon_2: { obj: 117, models: [2228] },
  party_balloon_3: { obj: 118, models: [2228] },
  party_balloon_4: { obj: 119, models: [2228] },
  party_balloon_5: { obj: 120, models: [2228] },

  // ── Board scenery ─────────────────────────────────────────────────────────
  //
  // The props standing on the battlefield: one set per region, so a blocked tile
  // in Mor Ul Rek is an obsidian statue and the same tile in Misthalin is a tree.
  // `core/render/terrain.ts` bakes these into the static background and anchors
  // each one at the bottom edge of its tile, the way the client stands a LOC on
  // the ground rather than centring it in the square.
  //
  // Picked by eye off two contact sheets of ~45 candidate LOCs. The rejects were
  // rejected for the same reasons every time: a model the flat rasteriser draws
  // see-through (13843 Swamp tree), one that lands as a featureless blob (2919
  // Boulder), or one that is a placeholder in the cache to begin with (1399
  // Jungle plant). Every id here rendered as something a player can name.
  //
  // Slugs carry their region because the same object can stand in for different
  // roles: `wild_boulder` and `lumb_rock` are both grey rock, and which one a
  // tile gets is the region's business, not the renderer's.
  lumb_tree: { obj: 1276, dir: 'scenery' },
  lumb_rock: { obj: 2257, dir: 'scenery' },
  lumb_bush: { obj: 1118, dir: 'scenery' },
  lumb_pebbles: { obj: 10792, dir: 'scenery' },

  khar_cactus: { obj: 6277, dir: 'scenery' },
  khar_cactus_dry: { obj: 2671, dir: 'scenery' },
  khar_rock: { obj: 2231, dir: 'scenery' },
  khar_rubble: { obj: 12, dir: 'scenery' },

  mory_dead_tree: { obj: 1282, dir: 'scenery' },
  mory_grave: { obj: 404, dir: 'scenery' },
  mory_mushroom: { obj: 1163, dir: 'scenery' },
  mory_bones: { obj: 3665, dir: 'scenery' },

  wild_boulder: { obj: 3753, dir: 'scenery' },
  wild_boulder_big: { obj: 3754, dir: 'scenery' },
  wild_stones: { obj: 26633, dir: 'scenery' },

  // 60091 Pine tree, not 3037 Arctic pine: the arctic pine's bake carries no snow at
  // all, and a bare green conifer in a snowfield reads as the wrong biome. This one
  // is frosted, and its tall thin silhouette keeps it apart from the two evergreens
  // below — the cache has only two snowy evergreen models, and 1318/40932 bake byte
  // for byte identical to 46510.
  troll_pine: { obj: 60091, dir: 'scenery' },
  troll_ice_boulder: { obj: 5039, dir: 'scenery' },
  troll_icicle: { obj: 554, dir: 'scenery' },
  troll_snow: { obj: 15615, dir: 'scenery' },

  kara_palm: { obj: 2577, dir: 'scenery' },
  kara_jungle_tree: { obj: 2887, dir: 'scenery' },
  kara_fern: { obj: 1298, dir: 'scenery' },

  // Mor Ul Rek has no tree and no rock the cache calls obsidian, so its two
  // blockers are the city's own furniture: the TzHaar statue (11968) and a
  // stalagmite (3825). The sulphur mounds are the floor of the volcano.
  // ── More of each region, added so no board repeats four props all run ──────
  //
  // Same picking rule as the set above: rendered off a contact sheet first, and a
  // model that reads as a blob, a flat overlay quad or a placeholder never makes
  // it in. Which list a prop lands in (block / rough / prop, see data/biomes.ts)
  // follows its size: a tree or an altar fills a tile, a mushroom scatters.
  lumb_oak: { obj: 4540, dir: 'scenery' },
  lumb_willow: { obj: 4541, dir: 'scenery' },
  lumb_flowers: { obj: 1192, dir: 'scenery' },
  lumb_haystack: { obj: 300, dir: 'scenery' },
  lumb_stump: { obj: 1342, dir: 'scenery' },
  lumb_reeds: { obj: 5139, dir: 'scenery' },

  khar_palm: { obj: 8085, dir: 'scenery' },
  khar_sandstone: { obj: 11386, dir: 'scenery' },
  khar_cactus_tall: { obj: 1396, dir: 'scenery' },
  khar_dead_tree: { obj: 1283, dir: 'scenery' },
  khar_ruins: { obj: 11072, dir: 'scenery' },

  mory_tombstone: { obj: 402, dir: 'scenery' },
  mory_coffin: { obj: 398, dir: 'scenery' },
  mory_toadstools: { obj: 1166, dir: 'scenery' },
  mory_fungus: { obj: 1170, dir: 'scenery' },
  mory_twisted_tree: { obj: 30852, dir: 'scenery' },

  // Mort Myre and the swamp under the Slayer Tower, not a generic boneyard: the
  // vine-hung swamp trees and the bare white one are what actually grows there,
  // the bubbles are the swamp's own idle scenery, and the rotting log and stump
  // are what is left of everything else. The mausoleum is the one landmark.
  mory_swamp_tree: { obj: 13847, dir: 'scenery' },
  mory_dead_birch: { obj: 13844, dir: 'scenery' },
  mory_swamp_bubbles: { obj: 684, dir: 'scenery' },
  mory_rotting_log: { obj: 3508, dir: 'scenery' },
  mory_rotten_stump: { obj: 29737, dir: 'scenery' },
  mory_mausoleum: { obj: 10055, dir: 'scenery' },

  wild_chaos_altar: { obj: 411, dir: 'scenery' },
  wild_pillar: { obj: 34795, dir: 'scenery' },
  // 658 "Pile of skulls" used to stand here and came out of the flat rasteriser as
  // three white blobs with a cartoon face punched into each — a snowman, not a
  // relic. The Wilderness has real dead in it, so these take its place: two
  // sprawled skeletons that fell in different poses, and a skull heap with actual
  // bone in its shading.
  // A body on the ground is the one prop the default camera cannot read: at the
  // scenery pitch it is all foreshortened limb and the skull lands behind the
  // ribs. Both skeletons get turned side-on and tipped until the pose is legible.
  wild_skeleton: { obj: 12245, yaw: 90, pitch: 30, dir: 'scenery' },
  wild_skeleton_curled: { obj: 12247, pitch: 30, dir: 'scenery' },
  wild_skull_heap: { obj: 42803, dir: 'scenery' },
  wild_skull_pile: { obj: 12453, dir: 'scenery' },
  wild_ruins: { obj: 3755, dir: 'scenery' },
  wild_spire: { obj: 2704, dir: 'scenery' },

  troll_ice_chunks: { obj: 6472, dir: 'scenery' },
  troll_snow_mound: { obj: 15616, dir: 'scenery' },
  troll_snowy_bush: { obj: 46511, dir: 'scenery' },
  troll_dead_tree: { obj: 1291, dir: 'scenery' },
  // Trollweiss' two snow-laden firs — the same evergreen model in a taller and
  // a squatter cut, so a stand of them doesn't read as one tree stamped twice.
  troll_snow_tree: { obj: 46509, dir: 'scenery' },
  troll_snow_tree_tall: { obj: 46510, dir: 'scenery' },

  kara_banana: { obj: 2073, dir: 'scenery' },
  kara_palm_young: { obj: 2578, dir: 'scenery' },
  kara_tropical_palm: { obj: 57815, dir: 'scenery' },
  kara_flowers: { obj: 1196, dir: 'scenery' },
  kara_fungus: { obj: 21741, dir: 'scenery' },

  // Mor Ul Rek's floor. Both stalagmites were baked here and dropped: a cave
  // spike is what every other cavern in the game is made of, and TzHaar city
  // is built, not eroded. What stands there now is city furniture — a lava
  // trough and a vein-lit obsidian outcrop. The obsidian fence panel and post
  // went the same way as the stalagmites: a fence line read as a compound wall,
  // which the cavern is not. The champion's statue went too, on the same call:
  // one statue is a landmark and Mor Ul Rek's landmark is the fight pit.
  //
  // The brazier is the one survivor of a 24-object sweep of the cache for forges,
  // obsidian benches, lava-pool edges and hewn steps: six defs this parser cannot
  // read at all, and of the eighteen that did render, everything else came out the
  // wrong colour for a black-and-lava cavern — white and magenta crystals, pale
  // ore veins, teal steps, a gilded torch.
  //
  // The sulphur we had baked went with them: 28496/28497 "Volcanic sulphur" are
  // Volcanic Mine props — pale domes that read as sand dunes on a black floor.
  // The cavern's own vent is 11851 — the wiki's Sulphur vent is a Mor Ul Rek and
  // Fight Cave object, shipped with Fight Pits in 2005, and lists both 11851 and
  // 23725 under the one name. The cache agrees: both defs carry the same models
  // (9294/9295), inside the 9288-9298 TzHaar range that also holds the lava forge
  // (9293), the egg (9296) and the viewing orb (9298), and 11851 sits in the 118xx
  // cave block beside the cave entrances and the hot vent doors. Kourend's vent is
  // a different object entirely (34335, Mount Karuulm, 2019) and is not used here.
  // A lava forge is the one landmark and the Inferno's own roof pillar is the
  // filler that keeps the blocked tiles from falling through to a procedural rock.
  tz_brazier: { obj: 11017, dir: 'scenery' },
  tz_lava_trough: { obj: 18519, dir: 'scenery' },
  tz_obsidian_rock: { obj: 47241, dir: 'scenery' },

  // 9295 alone, not the def's pair: 9294 is the smoke above the vent, and the flat
  // rasteriser has no volume for it — it bakes as three near-white lumps floating
  // over the mound, which on black rock reads as a hole in the sprite rather than
  // as smoke. What is left is the basalt cone with the molten crater, and the
  // crater only opens up above pitch ~20, so the camera looks down on it.
  tz_sulphur_vent: { obj: 11851, models: [9295], pitch: 26, dir: 'scenery' },
  // The seam used to be 55995 "Lava", out of the same seasonal event set as the
  // splat it replaced, and it baked as a knot of orange chain links. Mor Ul Rek
  // already owns the shape: 11818-11829 are the cave's own floor slabs, black rock
  // with the lava showing through. Most of them only crack — measured over the
  // block, 11829 is the one where the lava actually pools (12.1% of its painted
  // pixels are molten, against 2-4% for the rest), and a hairline crack is what a
  // prop this size loses first. It needs no model override, and now that the walk
  // reads past the ambient sound its recolour comes with it. The camera stays
  // shallow so the pool faces us: this lies in the floor, the vent stands up off it.
  tz_lava_seam: { obj: 11829, pitch: 55, yaw: 30, dir: 'scenery' },
  // 30284 is the Inferno's own roof support: a column of boulders with lava
  // showing between them, and at 45,41,41 darker than the 6950 boulder it
  // replaces. That boulder was one flat dark blob — the filler is the most
  // repeated prop on the board, so it is the one that has to be worth looking at.
  // Nothing else in the cache came close: swept lava/obsidian/molten by name, then
  // basalt, shale, craters, vents, hewn steps, ash and every rockslide and rubble
  // pile, and they are pale granite, olive scree, gold ore or teal stone.
  tz_rock_pillar: { obj: 30284, yaw: 30, dir: 'scenery' },
};

// -------------------------------------------------------- object def parsing
/** Opcode walker for the current (rev-233) object config layout. */
export function parseObjectDef(content) {
  const b = new Uint8Array(content.buffer ?? content);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u8 = () => b[p++];
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const skipStr = () => { while (b[p] !== 0) p++; p++; };
  const out = { name: '', models: [], recolorToFind: [], recolorToReplace: [] };

  for (let guard = 0; guard < 512; guard++) {
    const op = u8();
    if (op === 0) break;
    else if (op === 2) { const s = p; skipStr(); out.name = Buffer.from(b.slice(s, p - 1)).toString('latin1'); }
    else if (op === 6) { const n = u8(); for (let i = 0; i < n; i++) { out.models.push(u32()); u8(); /* type */ } }
    else if (op === 7) { const n = u8(); for (let i = 0; i < n; i++) out.models.push(u32()); }
    else if (op === 14 || op === 15 || op === 19 || op === 28 || op === 29 || op === 39 || op === 69 || op === 75 || op === 81) p += 1;
    else if (op === 17 || op === 18 || op === 21 || op === 22 || op === 23 || op === 27 || op === 62 || op === 64 || op === 73 || op === 74 || op === 89) { /* flag */ }
    else if (op === 24 || op === 61 || op === 65 || op === 66 || op === 67 || op === 68 || op === 70 || op === 71 || op === 72 || op === 82) p += 2;
    // The ambient sound is four bytes, not two: id (u16), then the distance and the
    // retain window (u8 each). Reading it as two left the cursor on the distance
    // byte, the walk reported "unknown object opcode 3" and stopped there — which
    // silently dropped everything after it, the recolour list (op 40) included. The
    // sulphur vent is the case that found this: its def paints the cone black by
    // recolouring 33676 to 0, and without that line it baked out in the model's own
    // teal.
    else if (op === 78) p += 4;
    else if (op >= 30 && op < 35) skipStr();
    else if (op === 40 || op === 41) { const n = u8(); for (let i = 0; i < n; i++) { const f = u16(), r = u16(); if (op === 40) { out.recolorToFind.push(f); out.recolorToReplace.push(r); } } }
    else if (op === 77 || op === 92) { u16(); u16(); if (op === 92) u16(); const n = u8(); p += 2 * (n + 1); }
    else if (op === 79) { u16(); u16(); u8(); const n = u8(); p += 2 * n; }
    else if (op === 249) { const n = u8(); for (let i = 0; i < n; i++) { const isS = u8() === 1; p += 3; if (isS) skipStr(); else p += 4; } }
    else { console.warn(`  ! unknown object opcode ${op} at ${p - 1} — stopping parse`); break; }
  }
  return out;
}

// --------------------------------------------------------------- model render
export async function buildObjectModel(cache, def, modelOverride) {
  const models = [];
  for (const mid of modelOverride ?? def.models) {
    const m = await cache.getDef(IndexType.MODELS, mid).catch(() => null);
    if (m) models.push(m);
  }
  if (!models.length) return null;
  const merged = models.length === 1 ? models[0] : new ModelGroup(models).getMergedModel();
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
 * The merged mesh of one scenery object (LOC) id — the hand-rolled parse plus the
 * loader patch above, in one call, so anything outside this script can borrow a
 * scenery model without re-deriving either. Used by the enemy exporter when a clip
 * is animated on an object's model rather than on the NPC's own (see
 * scripts/lib/anim-source.mjs).
 */
export async function objectModelById(cache, objId, modelOverride) {
  const file = await cache.getFile(IndexType.CONFIGS, ConfigType.OBJECT, objId);
  if (!file?.content) return null;
  return buildObjectModel(cache, parseObjectDef(file.content), modelOverride);
}

/**
 * One cache texture, tiled edge-to-edge over the standard square — a floor with no
 * object standing on it. The drawing code stretches the whole PNG across one board
 * tile, so this is full-bleed by construction; `tile` decides how many times the
 * texture repeats inside that tile.
 */
function renderTextureRaw(tex) {
  const canvas = createCanvas(tex.w, tex.h);
  canvas.getContext('2d').drawImage(tex.canvas, 0, 0);
  return canvas.toBuffer('image/png');
}

function renderTextureTile(tex, tile) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < SIZE; y += tile) {
    for (let x = 0; x < SIZE; x += tile) ctx.drawImage(tex.canvas, x, y, tile, tile);
  }
  return canvas.toBuffer('image/png');
}

export function renderObject(model, { yaw = 30, pitch = 12, roll = 0, zoom = 1, cull = true, crop, margin = MARGIN, groundTex, groundTile = 128 } = {}, textures) {
  const n = model.vertexCount;
  const verts = new Array(n);
  // `roll` turns the model about the camera's depth axis before anything else, for
  // a model the cache stores lying down that the board wants standing up.
  const rollR = (roll * Math.PI) / 180, sr = Math.sin(rollR), cr = Math.cos(rollR);
  for (let i = 0; i < n; i++) {
    const x = model.vertexPositionsX[i], y = model.vertexPositionsY[i];
    verts[i] = [x * cr - y * sr, x * sr + y * cr, model.vertexPositionsZ[i]];
  }
  const yawR = (yaw * Math.PI) / 180, pitchR = (pitch * Math.PI) / 180;
  const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);
  const fit = computeFit([verts], sy, cy, sp, cp, SIZE, margin);
  fit.scale *= zoom;
  const img = renderModelFrame(model, verts, fit, sy, cy, sp, cp, SIZE, textures, undefined, cull, SS);
  const canvas = createCanvas(SIZE, SIZE);
  canvas.getContext('2d').putImageData(img, 0, 0);
  if (groundTex !== undefined) paintGroundTexture(canvas, textures.get(groundTex), groundTile);
  if (!crop) return canvas.toBuffer('image/png');
  // A target that wants one *piece* of an object (the sigil off the top of an altar)
  // names the box in the 256-space above, and what comes out is that box trimmed back
  // to its own painted pixels — so the PNG's edges are the piece's edges and the
  // drawing code can centre it without carrying the parent object's empty margin.
  return cropToContent(canvas, crop);
}

/**
 * Multiply a cache texture over what was just rendered, tiled at `tile` pixels and
 * clipped back to the model's own silhouette.
 *
 * For flat floor quads only. Their faces carry no texture and no UVs, so the
 * rasteriser has nothing to map — but the client never shows them bare either; the
 * grain a player sees is the ground itself. Tiling one of OSRS's own ground textures
 * over the model's colour is the closest this flat rasteriser gets to that, and it
 * keeps every pixel cache-sourced. The texture is laid down at its own brightness —
 * it is already the colour of dug earth — and the model's flat colour is multiplied
 * back over it at a quarter strength, as a tint rather than as the base. Multiplying
 * the two at full strength lands nearly black, and at tile size that read as a hole
 * in the ground rather than as soil.
 */
function paintGroundTexture(canvas, tex, tile) {
  if (!tex) return;
  const ctx = canvas.getContext('2d');
  const flat = createCanvas(canvas.width, canvas.height);
  flat.getContext('2d').drawImage(canvas, 0, 0);
  ctx.save();
  for (let y = 0; y < canvas.height; y += tile) {
    for (let x = 0; x < canvas.width; x += tile) ctx.drawImage(tex.canvas, x, y, tile, tile);
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.25;
  ctx.drawImage(flat, 0, 0);
  ctx.globalAlpha = 1;
  // The two passes above paint the whole square; this trims them back to the shape
  // the model actually covered.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(flat, 0, 0);
  ctx.restore();
}

/** The sub-rect `[x0, y0, x1, y1]` of `canvas`, shrunk to the alpha it actually holds. */
function cropToContent(canvas, [x0, y0, x1, y1]) {
  const src = canvas.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0);
  let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (src.data[(y * src.width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return canvas.toBuffer('image/png'); // nothing in the box — keep the whole render
  const out = createCanvas(maxX - minX + 1, maxY - minY + 1);
  out.getContext('2d').drawImage(
    canvas, x0 + minX, y0 + minY, out.width, out.height, 0, 0, out.width, out.height,
  );
  return out.toBuffer('image/png');
}

/**
 * Name search over the object index — the counterpart of `--find` in
 * render-osrs-items.mjs and render-osrs-npcs.mjs. Picking a LOC by sweeping ids by
 * hand is how an afternoon disappears. `@abextm/cache2` already decodes every LOC
 * def off the same local cache, so this asks it for the lot and prints every id
 * whose name contains the needle, with the models it would render.
 *
 *   node scripts/render-osrs-objects.mjs --find "dead tree"
 */
async function findObjects(needle) {
  const q = needle.toLowerCase();
  if (!q) { console.error('--find needs a name'); return; }
  const all = await Obj.all(await defsCache());
  const hits = all.filter((d) => d.name && d.name !== 'null' && d.name.toLowerCase().includes(q));
  for (const d of hits) console.log(`  ${d.id}	"${d.name}"	models=[${[...(d.models ?? [])].map((m) => m.id ?? m)}]`);
  console.log(`${hits.length} match(es) of ${all.length} object defs`);
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
  if (findIdx !== -1) { await findObjects(argv[findIdx + 1] ?? ''); process.exit(0); }
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
  const yawIdx = argv.indexOf('--yaw');
  const pitchIdx = argv.indexOf('--pitch');
  const camOverride = {};
  if (yawIdx !== -1) camOverride.yaw = Number(argv[yawIdx + 1]);
  if (pitchIdx !== -1) camOverride.pitch = Number(argv[pitchIdx + 1]);

  // `--only` takes one slug or a comma-separated list, so a themed set (the whole
  // scenery pass) re-bakes in a single cache open instead of one per prop.
  const wanted = only ? new Set(only.split(',')) : null;
  const entries = Object.entries(TARGETS).filter(([slug]) => !wanted || wanted.has(slug));
  const write = (slug, cfg, buf) => {
    const dir = cfg.dir ?? 'objects';
    const outPath = join(REPO, 'public', 'assets', dir, `${slug}.png`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
    return `public/assets/${dir}/${slug}.png`;
  };
  for (const [slug, cfg] of entries) {
    // Texture-only target (a ground overlay): no object def, no model, no camera.
    if (cfg.tex !== undefined) {
      const tex = (await loadTextures(cache, [cfg.tex])).get(cfg.tex);
      if (!tex) { console.warn(`! texture ${cfg.tex} (${slug}) not found`); continue; }
      const out = write(slug, cfg, cfg.raw ? renderTextureRaw(tex) : renderTextureTile(tex, cfg.tile ?? 128));
      console.log(`✓ ${slug}: texture ${cfg.tex} ${tex.w}x${tex.h} → ${out}`);
      continue;
    }
    const file = await cache.getFile(IndexType.CONFIGS, ConfigType.OBJECT, cfg.obj);
    if (!file?.content) { console.warn(`! object ${cfg.obj} (${slug}) not found`); continue; }
    const def = parseObjectDef(file.content);
    const model = await buildObjectModel(cache, def, cfg.models);
    if (!model) { console.warn(`! ${slug}: no model geometry (models=[${def.models}])`); continue; }
    const texIds = modelTextureIds(model);
    if (cfg.groundTex !== undefined) texIds.push(cfg.groundTex);
    const textures = await loadTextures(cache, texIds);
    // A prop is stood on the bottom edge of its tile, so what has to meet the
    // ground is its *painted* base, not the image box: the fit leaves a model
    // whose bounding box is wider than it is tall with up to 41% of the square
    // empty below it, and the board then drew that prop hovering over its own
    // contact shadow. Trimming the bake to its content is the fix, and it is the
    // bake's job — the board cannot know where the paint stops.
    const cfg2 = cfg.dir === 'scenery' && !cfg.crop ? { ...cfg, crop: [0, 0, SIZE, SIZE] } : cfg;
    const out = write(slug, cfg, renderObject(model, { ...cfg2, ...camOverride }, textures));
    console.log(`✓ ${slug}: object ${cfg.obj} "${def.name}" models=[${def.models}] → ${out}`);
  }
  process.exit(0);
}

// Guarded: this module also exports its object-def parser and model builder, and an
// importer (the enemy glTF exporter) must not re-render every scenery PNG.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

/**
 * **Biome palettes** — the look of the battlefield, themed after OSRS regions. Each
 * run rolls a procedural path (see `systems/map-generation`) *and* a biome from
 * this table, so the ground, road, scenery and grid all re-skin to a different
 * corner of Gielinor while the layout stays freshly generated.
 *
 * These are pure data (colours only); the renderer reads the active biome and
 * draws the same shapes with these palettes, so nothing here touches the engine or
 * the DOM. To add a region, append a {@link BiomeDef} — the generator picks it up
 * automatically.
 */

/** Every region the battlefield can be skinned as. It doubles as the address a
 *  monster is *native to* (see `EnemyDef.region` and systems/enemy-regions), so a
 *  new region here is a new home a monster can be assigned — keep the two in step. */
export type BiomeId = 'lumbridge' | 'alkharid' | 'morytania' | 'wilderness' | 'trollweiss' | 'karamja' | 'tzhaar';

/**
 * **Every prop the board can stand on a tile.** Each one is a LOC model baked out
 * of the cache by `scripts/render-osrs-objects.mjs` into `public/assets/scenery/`,
 * and `lib/game/assets.ts` resolves the id to that file. The slug carries the
 * region it was picked for, because the same object serves different roles
 * elsewhere: `wild_boulder` and `lumb_rock` are both grey rock, and which tile
 * gets which is the region's business.
 */
export type SceneryId =
  | 'lumb_tree' | 'lumb_rock' | 'lumb_bush' | 'lumb_pebbles'
  | 'khar_cactus' | 'khar_cactus_dry' | 'khar_rock' | 'khar_rubble'
  | 'mory_dead_tree' | 'mory_grave' | 'mory_mushroom' | 'mory_bones'
  | 'wild_boulder' | 'wild_boulder_big' | 'wild_stones'
  | 'troll_pine' | 'troll_ice_boulder' | 'troll_icicle' | 'troll_snow'
  | 'kara_palm' | 'kara_jungle_tree' | 'kara_fern'
  | 'tz_statue' | 'tz_stalagmite' | 'tz_sulphur' | 'tz_sulphur_mound';

export interface BiomeDef {
  id: BiomeId;
  /** Player-facing region name (shown in the HUD / debug). */
  name: string;
  /** Ground: vertical gradient stops (top → bottom). */
  bgTop: string;
  bgBottom: string;
  /** Two scatter tones (already rgba) speckled over the ground for texture. */
  tuft: [string, string];
  /** Road layers, outer rim → packed centre (widths are fixed in the renderer). */
  road: {
    shadow: string;
    border: string;
    mid: string;
    walked: string;
    centre: string;
    /** Dashed track line down the middle (rgba). */
    dash: string;
  };
  /**
   * The props this region stands on the board, one list per role a tile plays:
   * `block` fills an impassable tile, `rough` scatters over ground you cannot
   * build on, and `prop` is the cosmetic dressing on open ground. Which entry a
   * tile draws is hashed from its own coordinates, so a board looks the same
   * every time the same seed deals it.
   *
   * The palette below still matters: it is what the board falls back to on the
   * frames before the sprites have loaded, and what a region draws if a bake is
   * ever missing.
   */
  scenery: { block: SceneryId[]; rough: SceneryId[]; prop: SceneryId[] };
  /** Off-road scenery palette. */
  decor: {
    bush: string;
    rock: string;
    rockHi: string;
    flowers: string[];
  };
  /** The pools the map deals. `deep` is the body of the water, `shallow` its rim,
   *  `foam` the line where it meets the ground, `ripple` the moving highlight the
   *  fishing spot draws with. */
  water: { deep: string; shallow: string; foam: string; ripple: string };
  /** Faint tile-grid line colour (rgba). */
  grid: string;
  /**
   * The chance that any one pool this region deals holds **lava** instead of water.
   *
   * Rolled per pool, not per region: the Wilderness has the Lava Maze and open water
   * on the same map, so at 0.5 a two-pool Wilderness board can come out with one of
   * each. Mor Ul Rek is lava all the way down (1), and the other five regions never
   * see it (0). What floats on top of the roll is the fishing ladder — a lava pool
   * holds lava eels, a water pool holds the shrimps-to-manta ray ladder
   * (data/fishing.ts).
   */
  lavaChance: number;
}

/**
 * Lava's palette, shared by every region that can deal it rather than repeated per
 * biome: molten rock looks the same in the Wilderness as it does in Mor Ul Rek, and
 * the texture under it (59) already carries the crust. Same shape as
 * {@link BiomeDef.water} so the renderer can take either without branching.
 */
export const LAVA_PALETTE = {
  deep: '#7a1f05',
  shallow: '#c24a0d',
  foam: '#ffb03a',
  ripple: '#ffd77a',
} as const;

export const BIOMES: Record<BiomeId, BiomeDef> = {
  // Misthalin plains — the classic Lumbridge green (the original look).
  lumbridge: {
    id: 'lumbridge',
    name: 'Misthalin Plains',
    bgTop: '#34561f',
    bgBottom: '#27411a',
    tuft: ['rgba(120,170,70,0.18)', 'rgba(60,95,39,0.5)'],
    road: { shadow: '#1c2f12', border: '#3d2b1f', mid: '#6d4c33', walked: '#8a6646', centre: '#9c7a55', dash: 'rgba(60,40,24,0.5)' },
    scenery: { block: ['lumb_tree', 'lumb_rock'], rough: ['lumb_bush', 'kara_fern'], prop: ['lumb_bush', 'lumb_pebbles', 'lumb_rock'] },
    decor: { bush: '#2c5018', rock: '#6b6b6b', rockHi: '#888888', flowers: ['#e7d34b', '#e06b6b', '#d7d7e6', '#c98ad6'] },
    water: { deep: '#22506b', shallow: '#336f8e', foam: '#8fc6cf', ripple: '#bfe6ef' },
    grid: 'rgba(255,255,255,0.03)',
    lavaChance: 0,
  },

  // Kharidian Desert — Al Kharid sand, sun-bleached and dry.
  alkharid: {
    id: 'alkharid',
    name: 'Kharidian Desert',
    bgTop: '#cdb072',
    bgBottom: '#b58f52',
    tuft: ['rgba(232,208,150,0.28)', 'rgba(150,120,70,0.4)'],
    road: { shadow: '#7a5a2e', border: '#6a4a24', mid: '#9c7838', walked: '#c2a45c', centre: '#d8bd77', dash: 'rgba(90,66,30,0.5)' },
    scenery: { block: ['khar_cactus', 'khar_rock'], rough: ['khar_cactus_dry', 'khar_rubble'], prop: ['khar_cactus_dry', 'khar_rubble', 'lumb_pebbles'] },
    decor: { bush: '#8a8a3a', rock: '#b7a078', rockHi: '#d8c49a', flowers: ['#d98f3a', '#e0c060', '#c56b4a'] },
    water: { deep: '#1f6f74', shallow: '#3d9b96', foam: '#b6dcc9', ripple: '#dff2e4' },
    grid: 'rgba(0,0,0,0.04)',
    lavaChance: 0,
  },

  // Morytania — murky swamp, sickly greens under a purple pall.
  morytania: {
    id: 'morytania',
    name: 'Morytania Swamp',
    bgTop: '#2e3b2c',
    bgBottom: '#202a26',
    tuft: ['rgba(120,140,90,0.15)', 'rgba(40,55,45,0.6)'],
    road: { shadow: '#171f18', border: '#241c2a', mid: '#3a3140', walked: '#4b4453', centre: '#5a5566', dash: 'rgba(20,16,26,0.5)' },
    scenery: { block: ['mory_dead_tree', 'mory_grave'], rough: ['mory_mushroom', 'mory_bones'], prop: ['mory_mushroom', 'mory_bones', 'lumb_pebbles'] },
    decor: { bush: '#26361f', rock: '#4a4550', rockHi: '#6a6472', flowers: ['#9d86b8', '#b7c0a0', '#6f8f6a'] },
    water: { deep: '#1e3226', shallow: '#2f4a33', foam: '#6d8460', ripple: '#93a882' },
    grid: 'rgba(180,160,200,0.04)',
    lavaChance: 0,
  },

  // The Wilderness — cracked dead earth under a blood-red sky.
  wilderness: {
    id: 'wilderness',
    name: 'The Wilderness',
    bgTop: '#45372a',
    bgBottom: '#332619',
    tuft: ['rgba(150,120,80,0.2)', 'rgba(70,50,35,0.5)'],
    road: { shadow: '#2a1e14', border: '#3a2a1c', mid: '#5a4330', walked: '#6e5238', centre: '#7d5f42', dash: 'rgba(40,26,16,0.5)' },
    scenery: { block: ['wild_boulder_big', 'mory_dead_tree'], rough: ['mory_bones', 'wild_stones'], prop: ['wild_boulder', 'wild_stones', 'mory_bones'] },
    decor: { bush: '#4a3320', rock: '#5a4a3a', rockHi: '#7a6a55', flowers: ['#8a1f1f', '#b0a090', '#6a3020'] },
    water: { deep: '#28323a', shallow: '#3c4a52', foam: '#7c8a90', ripple: '#9fadb2' },
    grid: 'rgba(120,40,30,0.05)',
    lavaChance: 0.5,
  },

  // Trollweiss / God Wars north — frozen snowfields.
  trollweiss: {
    id: 'trollweiss',
    name: 'Trollweiss Snow',
    bgTop: '#dfe9f2',
    bgBottom: '#c2d2e2',
    tuft: ['rgba(255,255,255,0.4)', 'rgba(170,190,210,0.4)'],
    road: { shadow: '#8fa2b4', border: '#7a8ea0', mid: '#a9bccd', walked: '#cfdde9', centre: '#e6eef5', dash: 'rgba(120,140,160,0.5)' },
    scenery: { block: ['troll_pine', 'troll_ice_boulder'], rough: ['troll_snow', 'troll_icicle'], prop: ['troll_snow', 'troll_icicle', 'troll_ice_boulder'] },
    decor: { bush: '#6f8a72', rock: '#9aa8b5', rockHi: '#c4cdd6', flowers: ['#bcd8f0', '#e8f2fb', '#a9c8e6'] },
    water: { deep: '#3f6d92', shallow: '#6fa0c4', foam: '#d6ecf8', ripple: '#f2fafd' },
    grid: 'rgba(80,110,140,0.05)',
    lavaChance: 0,
  },

  // Karamja — dense tropical jungle.
  karamja: {
    id: 'karamja',
    name: 'Karamja Jungle',
    bgTop: '#1f3d18',
    bgBottom: '#162e12',
    tuft: ['rgba(90,170,60,0.2)', 'rgba(30,70,25,0.6)'],
    road: { shadow: '#14240f', border: '#35291a', mid: '#574029', walked: '#6f5334', centre: '#7d5f3c', dash: 'rgba(30,44,20,0.5)' },
    scenery: { block: ['kara_jungle_tree', 'kara_palm'], rough: ['kara_fern', 'lumb_bush'], prop: ['kara_fern', 'lumb_bush', 'lumb_pebbles'] },
    decor: { bush: '#1c4517', rock: '#5b5546', rockHi: '#7d745e', flowers: ['#e04f7a', '#f0b93a', '#c65ad6'] },
    water: { deep: '#11534f', shallow: '#1f7a6d', foam: '#79c3ac', ripple: '#a8e0cb' },
    grid: 'rgba(255,255,255,0.03)',
    lavaChance: 0,
  },

  // TzHaar city — black basalt cavern lit by lava.
  tzhaar: {
    id: 'tzhaar',
    name: 'TzHaar Caverns',
    bgTop: '#241f22',
    bgBottom: '#17110f',
    tuft: ['rgba(255,120,40,0.15)', 'rgba(60,40,35,0.6)'],
    road: { shadow: '#120b09', border: '#2a120a', mid: '#5a1e0c', walked: '#8a2e10', centre: '#b8461a', dash: 'rgba(255,140,40,0.4)' },
    scenery: { block: ['tz_statue', 'tz_stalagmite'], rough: ['tz_sulphur', 'tz_sulphur_mound'], prop: ['tz_sulphur', 'tz_sulphur_mound', 'wild_stones'] },
    decor: { bush: '#3a2018', rock: '#2a2422', rockHi: '#4a4038', flowers: ['#ff7a1f', '#ffb03a', '#e0401a'] },
    water: { deep: '#1a1210', shallow: '#3a1f16', foam: '#8a4426', ripple: '#ff9b4a' },
    grid: 'rgba(255,90,30,0.05)',
    lavaChance: 1,
  },
};

/** Every biome in a stable order (the cycle order used by the debug skinner). */
export const BIOME_LIST = Object.values(BIOMES);

/** Deterministically pick a biome for a run seed (stable per seed). */
export function pickBiome(seed: number): BiomeDef {
  return BIOME_LIST[(seed >>> 0) % BIOME_LIST.length];
}

/** The biome after `current` in {@link BIOME_LIST}, wrapping around — used by the
 *  debug "cycle biome" control to preview each region's skin on the same layout. */
export function nextBiome(current: BiomeDef): BiomeDef {
  const i = BIOME_LIST.findIndex(b => b.id === current.id);
  return BIOME_LIST[(i + 1) % BIOME_LIST.length];
}

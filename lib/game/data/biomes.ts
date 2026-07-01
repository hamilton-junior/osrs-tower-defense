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

export interface BiomeDef {
  id: string;
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
  /** Off-road scenery palette. */
  decor: {
    bush: string;
    rock: string;
    rockHi: string;
    flowers: string[];
  };
  /** Faint tile-grid line colour (rgba). */
  grid: string;
}

export const BIOMES: Record<string, BiomeDef> = {
  // Misthalin plains — the classic Lumbridge green (the original look).
  lumbridge: {
    id: 'lumbridge',
    name: 'Misthalin Plains',
    bgTop: '#34561f',
    bgBottom: '#27411a',
    tuft: ['rgba(120,170,70,0.18)', 'rgba(60,95,39,0.5)'],
    road: { shadow: '#1c2f12', border: '#3d2b1f', mid: '#6d4c33', walked: '#8a6646', centre: '#9c7a55', dash: 'rgba(60,40,24,0.5)' },
    decor: { bush: '#2c5018', rock: '#6b6b6b', rockHi: '#888888', flowers: ['#e7d34b', '#e06b6b', '#d7d7e6', '#c98ad6'] },
    grid: 'rgba(255,255,255,0.03)',
  },

  // Kharidian Desert — Al Kharid sand, sun-bleached and dry.
  alkharid: {
    id: 'alkharid',
    name: 'Kharidian Desert',
    bgTop: '#cdb072',
    bgBottom: '#b58f52',
    tuft: ['rgba(232,208,150,0.28)', 'rgba(150,120,70,0.4)'],
    road: { shadow: '#7a5a2e', border: '#6a4a24', mid: '#9c7838', walked: '#c2a45c', centre: '#d8bd77', dash: 'rgba(90,66,30,0.5)' },
    decor: { bush: '#8a8a3a', rock: '#b7a078', rockHi: '#d8c49a', flowers: ['#d98f3a', '#e0c060', '#c56b4a'] },
    grid: 'rgba(0,0,0,0.04)',
  },

  // Morytania — murky swamp, sickly greens under a purple pall.
  morytania: {
    id: 'morytania',
    name: 'Morytania Swamp',
    bgTop: '#2e3b2c',
    bgBottom: '#202a26',
    tuft: ['rgba(120,140,90,0.15)', 'rgba(40,55,45,0.6)'],
    road: { shadow: '#171f18', border: '#241c2a', mid: '#3a3140', walked: '#4b4453', centre: '#5a5566', dash: 'rgba(20,16,26,0.5)' },
    decor: { bush: '#26361f', rock: '#4a4550', rockHi: '#6a6472', flowers: ['#9d86b8', '#b7c0a0', '#6f8f6a'] },
    grid: 'rgba(180,160,200,0.04)',
  },

  // The Wilderness — cracked dead earth under a blood-red sky.
  wilderness: {
    id: 'wilderness',
    name: 'The Wilderness',
    bgTop: '#45372a',
    bgBottom: '#332619',
    tuft: ['rgba(150,120,80,0.2)', 'rgba(70,50,35,0.5)'],
    road: { shadow: '#2a1e14', border: '#3a2a1c', mid: '#5a4330', walked: '#6e5238', centre: '#7d5f42', dash: 'rgba(40,26,16,0.5)' },
    decor: { bush: '#4a3320', rock: '#5a4a3a', rockHi: '#7a6a55', flowers: ['#8a1f1f', '#b0a090', '#6a3020'] },
    grid: 'rgba(120,40,30,0.05)',
  },

  // Trollweiss / God Wars north — frozen snowfields.
  trollweiss: {
    id: 'trollweiss',
    name: 'Trollweiss Snow',
    bgTop: '#dfe9f2',
    bgBottom: '#c2d2e2',
    tuft: ['rgba(255,255,255,0.4)', 'rgba(170,190,210,0.4)'],
    road: { shadow: '#8fa2b4', border: '#7a8ea0', mid: '#a9bccd', walked: '#cfdde9', centre: '#e6eef5', dash: 'rgba(120,140,160,0.5)' },
    decor: { bush: '#6f8a72', rock: '#9aa8b5', rockHi: '#c4cdd6', flowers: ['#bcd8f0', '#e8f2fb', '#a9c8e6'] },
    grid: 'rgba(80,110,140,0.05)',
  },

  // Karamja — dense tropical jungle.
  karamja: {
    id: 'karamja',
    name: 'Karamja Jungle',
    bgTop: '#1f3d18',
    bgBottom: '#162e12',
    tuft: ['rgba(90,170,60,0.2)', 'rgba(30,70,25,0.6)'],
    road: { shadow: '#14240f', border: '#35291a', mid: '#574029', walked: '#6f5334', centre: '#7d5f3c', dash: 'rgba(30,44,20,0.5)' },
    decor: { bush: '#1c4517', rock: '#5b5546', rockHi: '#7d745e', flowers: ['#e04f7a', '#f0b93a', '#c65ad6'] },
    grid: 'rgba(255,255,255,0.03)',
  },

  // TzHaar city — black basalt cavern lit by lava.
  tzhaar: {
    id: 'tzhaar',
    name: 'TzHaar Caverns',
    bgTop: '#241f22',
    bgBottom: '#17110f',
    tuft: ['rgba(255,120,40,0.15)', 'rgba(60,40,35,0.6)'],
    road: { shadow: '#120b09', border: '#2a120a', mid: '#5a1e0c', walked: '#8a2e10', centre: '#b8461a', dash: 'rgba(255,140,40,0.4)' },
    decor: { bush: '#3a2018', rock: '#2a2422', rockHi: '#4a4038', flowers: ['#ff7a1f', '#ffb03a', '#e0401a'] },
    grid: 'rgba(255,90,30,0.05)',
  },
};

export type BiomeId = keyof typeof BIOMES;

const BIOME_LIST = Object.values(BIOMES);

/** Deterministically pick a biome for a run seed (stable per seed). */
export function pickBiome(seed: number): BiomeDef {
  return BIOME_LIST[(seed >>> 0) % BIOME_LIST.length];
}

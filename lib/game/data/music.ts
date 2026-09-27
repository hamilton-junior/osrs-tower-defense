/**
 * **Music** — which OSRS track plays where.
 *
 * Every track is the game's own: its MIDI comes out of cache index 6 and it is
 * played by a port of the client's synth over the client's own instruments (see
 * `lib/game/music/`). `scripts/extract-osrs-music.mjs` bakes every track listed
 * here, and nothing else, so a new row needs a re-bake before it can play.
 *
 * `cacheName` is the track's archive name in index 6 — the lowercased title, which
 * the cache stores only as a hash. A few titles hash to nothing (the cache names
 * them differently, or not at all), which is why the row carries its own.
 *
 * Plain data with no runtime imports: the bake script loads this file directly.
 */
import type { BiomeId } from './biomes';

export interface MusicTrack {
  /** Stable id; also the baked file's name (`public/assets/music/<id>.mid`). */
  id: string;
  /** The title as the OSRS music player shows it. */
  title: string;
  /** Archive name in cache index 6 (see the header). */
  cacheName: string;
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
  { id: 'scape_main', title: 'Scape Main', cacheName: 'scape main' },
  { id: 'harmony', title: 'Harmony', cacheName: 'harmony' },
  { id: 'al_kharid', title: 'Al Kharid', cacheName: 'al kharid' },
  { id: 'morytania', title: 'Morytania', cacheName: 'morytania' },
  { id: 'wilderness', title: 'Wilderness', cacheName: 'wilderness' },
  { id: 'hells_bells', title: 'Hells Bells', cacheName: 'hells bells' },
  { id: 'jungle_island', title: 'Jungle Island', cacheName: 'jungle island' },
  { id: 'inferno', title: 'Inferno', cacheName: 'inferno' },
];

/** The login screen's own theme plays on the start screen, as it does in OSRS. */
export const LOBBY_TRACK = 'scape_main';

/**
 * One track per region, each one OSRS plays in (or right beside) the place the
 * region is skinned after: Harmony is Lumbridge's, Hells Bells unlocks sledding down
 * Trollweiss Mountain, Inferno plays inside TzHaar's own fight pit.
 */
export const BIOME_TRACKS: Record<BiomeId, string> = {
  lumbridge: 'harmony',
  alkharid: 'al_kharid',
  morytania: 'morytania',
  wilderness: 'wilderness',
  trollweiss: 'hells_bells',
  karamja: 'jungle_island',
  tzhaar: 'inferno',
};

/** What plays: the login theme until a run starts, then the region's own track. */
export function musicFor(inRun: boolean, biome: BiomeId): string {
  return inRun ? BIOME_TRACKS[biome] : LOBBY_TRACK;
}

export function musicTrack(id: string): MusicTrack | undefined {
  return MUSIC_TRACKS.find((t) => t.id === id);
}

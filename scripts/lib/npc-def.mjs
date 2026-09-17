/**
 * Read NPC definitions out of the cache, for the bake scripts.
 *
 * This used to be a hand-written walk over the raw config bytes (index 2, group
 * 9). The reason was opcode 61: model ids outgrew 16 bits, OSRS moved them from
 * the old opcode 1 (u8 count + u16 ids) to opcode 61 (u8 count + **u32** ids),
 * and osrscachereader 1.1.3 predates that — its NpcLoader yields an empty
 * `models` for every NPC in the current LIVE cache. Walking the stream by hand
 * meant every unknown opcode had to consume exactly its own payload or the
 * cursor desynced and the model ids came out as garbage.
 *
 * `@abextm/cache2` decodes the whole NPC def, opcode 61 included, so the walk is
 * gone. It reads the same local cache off disk (`main_file_cache.dat2`) — no
 * network, no external asset — and is only used at bake time, never at runtime.
 *
 * It decodes **defs**, not art: models, frames, textures and sounds are ids
 * there. Geometry and animation still come from osrscachereader, which is why
 * the bake scripts open both.
 */
import { loadCache } from '@abextm/cache2/node';
import { NPC } from '@abextm/cache2';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CACHE = join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');

let opening = null;

/** Opened once per process, on first use, against OSRS_CACHE_DIR or the RuneLite
 *  default. Exported so a script reading a different def type out of the same cache
 *  (scenery, in render-osrs-objects.mjs) shares this one handle. */
export function defsCache() {
  opening ??= loadCache(process.env.OSRS_CACHE_DIR || DEFAULT_CACHE);
  return opening;
}

/**
 * The fields a render needs, in the shape the bake scripts already consume:
 * `{ id, name, models, standAnim, walkAnim, recolorToFind, recolorToReplace }`.
 * Returns null when the id holds no NPC.
 */
export async function npcDef(id) {
  const def = await NPC.load(await defsCache(), id);
  if (!def) return null;
  return {
    id,
    name: def.name,
    models: [...(def.models ?? [])],
    standAnim: def.standingAnimation ?? -1,
    walkAnim: def.walkingAnimation ?? -1,
    recolorToFind: [...(def.recolorFrom ?? [])],
    recolorToReplace: [...(def.recolorTo ?? [])],
  };
}

/** Every NPC whose name contains `needle` (case-insensitive), for id discovery. */
export async function findNpcs(needle) {
  const q = needle.toLowerCase();
  const all = await NPC.all(await defsCache());
  return all
    .filter((d) => d.name && d.name !== 'null' && d.name.toLowerCase().includes(q))
    .map((d) => ({ id: d.id, name: d.name, models: [...(d.models ?? [])] }));
}

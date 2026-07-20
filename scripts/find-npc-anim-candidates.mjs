/**
 * Which animation sequences can possibly belong to a given NPC's rig.
 *
 * For each sequence in a range, resolve the FRAMEMAP (skeleton) id its frames use.
 * Sequences that animate the same rig **share a framemap**, so an id whose framemap
 * differs from the NPC's stand/walk anim cannot be that NPC's — it belongs to some other
 * model whose ids happen to sit nearby in the block.
 *
 *   node scripts/find-npc-anim-candidates.mjs <from> <to>
 *
 * This exists because `scripts/data/openosrs-observed-anims.json` — the usual oracle for
 * "which sequences does this NPC actually play" — stops at NPC id 9297. Anything newer
 * (Brutus, 15626) has no record there, and eyeballing neighbouring ids is a trap. The
 * framemap check replaces the missing oracle as the "is this id even his?" filter: run it
 * across the block around the NPC's `standAnim`/`walkAnim`, keep the ids that share their
 * framemap, and render only those. See the `npc-anim-auditor` agent.
 */
import { RSCache, IndexType, ConfigType } from 'osrscachereader';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE_DIR = process.env.OSRS_CACHE_DIR || join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
const from = Number(process.argv[2]);
const to = Number(process.argv[3]);

const cache = new RSCache(CACHE_DIR);
await cache.onload;

// framemap id = first uint16 of the raw frame file (see FramesLoader.load)
const framemapOf = async (frameId) => {
  const archive = frameId >>> 16;
  const file = frameId & 0xffff;
  try {
    const f = await cache.getFile(IndexType.FRAMES.id, archive, file, { noLoader: true });
    const b = new Uint8Array(f.content.buffer ?? f.content);
    return (b[0] << 8) | b[1];
  } catch {
    return null;
  }
};

let maya = 0;
for (let id = from; id <= to; id++) {
  const def = await cache.getDef(IndexType.CONFIGS, ConfigType.SEQUENCE, id).catch(() => null);
  if (!def) continue;
  // Post-2023 NPCs are rigged in Maya: the sequence carries an `animMayaID` and
  // no frames at all, so it has no framemap to fingerprint and this whole script
  // has nothing to say about it. Counting them matters — staying silent would
  // render an entirely maya-rigged block (Scurrius, 10686-10708) as an empty
  // result, which reads as "no candidates here" rather than "wrong tool".
  if (!def.frameIDs?.length) {
    if (def.animMayaID != null && def.animMayaID !== -1) maya++;
    continue;
  }
  const maps = new Set();
  for (const f of def.frameIDs.slice(0, 4)) {
    const m = await framemapOf(f);
    if (m !== null) maps.add(m);
  }
  const ticks = def.frameLengths.reduce((a, b) => a + b, 0);
  console.log(
    `${id}\tframes=${String(def.frameIDs.length).padStart(3)}\tticks=${String(ticks).padStart(4)}` +
    `\tarch=${def.frameIDs[0] >>> 16}\tSKEL=${[...maps].join(',')}`
  );
}
if (maya) {
  console.error(
    `\n${maya} of the ids in ${from}-${to} are maya-rigged and were skipped — they carry an ` +
    `animMayaID and no frames, so there is no framemap to match them by.\n` +
    `For those, the block boundary is the separator instead: maya ids run in an unbroken ` +
    `run, so the nearest classic id on each side bounds the NPC's own set. Render the ` +
    `candidates inside that run and pick by eye.`,
  );
}
process.exit(0);

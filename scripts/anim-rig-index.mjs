/**
 * Build the **rig index**: who lives on which skeleton, for the whole cache.
 *
 *   node scripts/anim-rig-index.mjs          # -> scripts/data/anim-rig-index.json
 *
 * In OSRS an animation is not owned by an NPC — it is owned by a *framemap*, the
 * skeleton its frames pose. Every sequence that animates the same rig shares that
 * framemap, so the set of a monster's possible animations is exactly "the sequences
 * on my rig", and an id outside it **cannot** be his no matter how close it sits in
 * the id block. That is a structural answer, which is why it beats eyeballing: it
 * proved the Nechryael's block (framemap 802 holds six sequences and only the two
 * nechryaels live there) and it unmasked a "mummy hurt" that was really the idle of
 * *Mummy ashes*, a different NPC sharing the mummy's skeleton.
 *
 * That reasoning was done by hand, once, and thrown away. This script does it for
 * all ~14 500 sequences and ~16 300 NPCs in about a minute and writes the result
 * down, so `anim-triage.mjs` can answer it instantly for any monster.
 *
 * The index is **derived from the local cache and gitignored** — it is keyed to the
 * cache revision it was built from, so it is rebuilt rather than shared. Rebuild it
 * after a game update; the triage tool says so when the revisions disagree.
 */
import { RSCache, IndexType, ConfigType } from 'osrscachereader';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR } from './render-osrs-npc-anims.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const INDEX_PATH = join(__dirname, 'data', 'anim-rig-index.json');

if (process.argv[1]?.endsWith('anim-rig-index.mjs')) await main();

async function main() {
  if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
    console.error(`No cache at ${CACHE_DIR}\nSet OSRS_CACHE_DIR.`);
    process.exit(1);
  }
  console.log(`Loading cache: ${CACHE_DIR}`);
  const cache = new RSCache(CACHE_DIR);
  await cache.onload;

  const configs = await cache.getIndex(IndexType.CONFIGS);
  const seqCount = configs.archives[ConfigType.SEQUENCE.id].files.length;
  const npcCount = configs.archives[ConfigType.NPC.id].files.length;

  // framemap id = the first uint16 of the raw frame file (see FramesLoader.load).
  // Read it straight, with `noLoader` — decoding the frame would cost far more than
  // the two bytes we came for.
  const framemapOf = async (frameId) => {
    try {
      const f = await cache.getFile(IndexType.FRAMES.id, frameId >>> 16, frameId & 0xffff, { noLoader: true });
      const b = new Uint8Array(f.content.buffer ?? f.content);
      return (b[0] << 8) | b[1];
    } catch { return null; }
  };

  const seq = {};
  let maya = 0, classic = 0;
  process.stdout.write(`Scanning ${seqCount} sequences `);
  for (let id = 0; id < seqCount; id++) {
    if (id % 2000 === 0) process.stdout.write('.');
    const def = await cache.getDef(IndexType.CONFIGS, ConfigType.SEQUENCE, id).catch(() => null);
    if (!def) continue;
    if (!def.frameIDs?.length) {
      // Post-2023 content is rigged in Maya: an `animMayaID`, no frames, no framemap.
      // Recorded rather than dropped — the triage tool falls back to the contiguous
      // maya run around the NPC's stand/walk, which is the only scoping left there.
      if (def.animMayaID != null && def.animMayaID !== -1) { seq[id] = [null, 0, '', def.animMayaID]; maya++; }
      continue;
    }
    let skel = null;
    for (const f of def.frameIDs.slice(0, 3)) { skel = await framemapOf(f); if (skel !== null) break; }
    seq[id] = [skel, def.frameIDs.length, (def.frameLengths ?? []).join(','), null];
    classic++;
  }
  console.log(` ${classic} classic, ${maya} maya`);

  const npc = {};
  process.stdout.write(`Scanning ${npcCount} NPCs `);
  for (let id = 0; id < npcCount; id++) {
    if (id % 2000 === 0) process.stdout.write('.');
    const file = await cache.getFile(IndexType.CONFIGS, ConfigType.NPC, id).catch(() => null);
    const d = file && (file.def || file);
    if (!d) continue;
    const stand = d.standingAnimation ?? -1;
    const walk = d.walkingAnimation ?? -1;
    // An NPC with neither anim can never be a tenant of any rig, so it would only
    // bloat the file.
    if (stand < 0 && walk < 0) continue;
    npc[id] = [d.name ?? '', stand, walk];
  }
  console.log(` ${Object.keys(npc).length} animated`);

  const out = {
    revision: configs.revision ?? null,
    builtAt: new Date().toISOString(),
    // seq: id -> [framemapId|null, frameCount, "frameLengths,joined", animMayaID|null]
    seq,
    // npc: id -> [name, standingAnimation, walkingAnimation]
    npc,
  };
  writeFileSync(INDEX_PATH, JSON.stringify(out));
  const rigs = new Set(Object.values(seq).map((s) => s[0]).filter((s) => s !== null));
  console.log(`-> ${INDEX_PATH}  (${rigs.size} distinct rigs, cache revision ${out.revision})`);
  process.exit(0);
}

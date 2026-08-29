/**
 * Cross-reference `enemy-anims.config.json` against the **OpenOSRS observed-anims
 * dump** (`scripts/data/openosrs-observed-anims.json`, vendored from
 * open-osrs/service-animations): a crowdsourced record of which sequence ids each
 * NPC was actually seen playing in game, `{ "<npcId>": [seqId, …] }`.
 *
 * Why: an NPC's sequence-id block also holds its attacks and the anims of every
 * other NPC sharing the rig, and no metric reliably tells an attack from a block.
 * The observed set is the candidate list — a configured id that is NOT in it is
 * almost always wrong (a foreign rig, or an anim the NPC never plays). It is not
 * authoritative-negative though: the dump is incomplete, so absence = suspicion,
 * not proof (Jad's death 2660 is unobserved and correct).
 *
 * This is reference DATA, not an asset — every baked pixel still comes from the
 * local OSRS cache.
 *
 *   node scripts/observed-anims.mjs                 # audit the whole roster
 *   node scripts/observed-anims.mjs jad hydra       # just these slugs
 *   node scripts/observed-anims.mjs --npc 3127      # raw observed ids for an NPC id
 *
 * Offline (no cache, no network needed).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAnimConfig } from './lib/anim-source.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const observed = JSON.parse(readFileSync(join(__dirname, 'data', 'openosrs-observed-anims.json'), 'utf8'));
const config = readAnimConfig(join(__dirname, 'enemy-anims.config.json'));

const args = process.argv.slice(2);
const npcIdx = args.indexOf('--npc');
if (npcIdx !== -1) {
  const id = args[npcIdx + 1];
  const ids = observed[id];
  console.log(ids?.length ? `NPC ${id} observed: ${[...ids].sort((a, b) => a - b).join(', ')}` : `NPC ${id}: not in the dump`);
  process.exit(0);
}

const slugs = args.length ? args : Object.keys(config);
let suspects = 0;

for (const slug of slugs) {
  const cfg = config[slug];
  if (!cfg) { console.log(`${slug}: not in enemy-anims.config.json`); continue; }
  const seen = new Set(observed[String(cfg.npc)] ?? []);
  const flags = Object.entries(cfg.anims).map(([clip, id]) => {
    // walk comes from the NPC def (op 14), so the dump rarely lists it — don't flag it.
    const ok = seen.has(id) || clip === 'walk';
    if (!ok) suspects++;
    return `${clip} ${id}${ok ? '' : ' ⚠'}`;
  });
  const extra = [...seen].filter((id) => !Object.values(cfg.anims).includes(id)).sort((a, b) => a - b);
  console.log(
    `${slug.padEnd(24)} npc ${String(cfg.npc).padStart(5)}  ${flags.join('  ')}` +
    (seen.size ? `\n${' '.repeat(24)} other observed: ${extra.join(', ') || '(none)'}` : `\n${' '.repeat(24)} NPC not in dump — probe + eyeball only`)
  );
}

console.log(`\n${suspects} configured clip(s) not in their NPC's observed set (⚠ = candidate for re-pick, not proof).`);

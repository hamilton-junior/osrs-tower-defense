/**
 * One command that answers "which of these ids is his death / his block?".
 *
 *   npm run anims:triage mummy            # a slug from enemy-anims.config.json
 *   npm run anims:triage -- --npc 7411    # any NPC id
 *   npm run anims:triage mummy -- --top 20 --slot block
 *
 * Picking an animation used to be a loop of guessing an id range, rendering dozens
 * of probe images and eyeballing them — and it went wrong repeatedly, because a
 * monster's id block also holds his attacks and the anims of every other NPC that
 * shares his rig. This runs the whole loop at once, in the order that actually
 * settles the question:
 *
 *  1. **Scope structurally.** An animation belongs to a *framemap* (a skeleton), not
 *     to an NPC, so the candidate set is exactly "the sequences on his rig" — read
 *     out of the index `anim-rig-index.mjs` builds, with no id range to guess.
 *     Anything outside it cannot be his. Maya-rigged NPCs (post-2023) have no
 *     framemap; there the contiguous run of maya ids around his stand/walk is the
 *     best scoping available, and the report says so rather than pretending.
 *  2. **Name the neighbours.** The other NPCs on the rig are listed, and any
 *     candidate that is some *other* tenant's stand or walk is labelled with whose.
 *     That is the trap that produced a wrong mummy hurt: 5563 is the idle of
 *     "Mummy ashes", a different NPC living on the mummy's skeleton.
 *  3. **Rank by shape.** collapse / reach / settle per clip (see lib/anim-metrics),
 *     scored into death / block / attack so the eye checks the top two instead of
 *     twenty. Deaths come out near-deterministic; attack-versus-block does not, and
 *     the report never claims otherwise.
 *  4. **Ask the twin.** When a rig is a re-authored clone of another, the twins'
 *     frame-length arrays are byte-identical, so a slot already solved on one names
 *     the same slot on the other. This is what proved the Nechryarch's block: its
 *     rig is the giant skeleton, and its 6368-6372 clone the hill giant's 4649-4653
 *     tick for tick.
 *  5. **Cross-check the oracle.** `data/openosrs-observed-anims.json` records which
 *     ids each NPC was actually seen playing. Absence is suspicion, not proof.
 *
 * Output: that report, plus ONE contact sheet grouped by verdict, written to
 * `scripts/tmp-triage-<slug>.png`. The in-game look is still the only thing that
 * closes an audit — this exists to make the shortlist short and honest.
 */
import { RSCache } from 'osrscachereader';
import { createCanvas } from 'canvas';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNpcModel, loadClip, renderFrame, computeFit, SIZE, CACHE_DIR } from './render-osrs-npc-anims.mjs';
import { metrics, slotScores } from './lib/anim-metrics.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = join(__dirname, 'data', 'anim-rig-index.json');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i !== -1 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);

const COLS = 10;            // sampled frames per row in the sheet
const CELL = 104;
const LABELW = 190;
const METRIC_FRAMES = 24;   // frames loaded per clip for the metrics

// ------------------------------------------------------------------ the target
const config = JSON.parse(readFileSync(join(__dirname, 'enemy-anims.config.json'), 'utf8'));
const observed = JSON.parse(readFileSync(join(__dirname, 'data', 'openosrs-observed-anims.json'), 'utf8'));
const slug = argv.find((a) => !a.startsWith('--') && config[a]);
const npcId = Number(arg('--npc', slug ? config[slug].npc : NaN));
if (!Number.isFinite(npcId)) {
  console.error('Usage: npm run anims:triage <slug>   |   npm run anims:triage -- --npc <id>');
  console.error(`Known slugs: ${Object.keys(config).join(' ')}`);
  process.exit(1);
}
const label = slug ?? `npc${npcId}`;
const top = Number(arg('--top', '14'));
const slotOrder = arg('--slot', null);

if (!existsSync(INDEX_PATH)) {
  console.error(`No rig index at ${INDEX_PATH}`);
  console.error('Build it once with: npm run anims:index   (about a minute)');
  process.exit(1);
}
const ix = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
const skelOf = (id) => ix.seq[id]?.[0] ?? null;
const framesOf = (id) => ix.seq[id]?.[1] ?? 0;
const lengthsOf = (id) => ix.seq[id]?.[2] ?? '';
const mayaOf = (id) => ix.seq[id]?.[3] ?? null;

const me = ix.npc[npcId];
if (!me) { console.error(`NPC ${npcId} is not in the index (it has no stand or walk animation).`); process.exit(1); }
const [npcName, stand, walk] = me;

// ------------------------------------------------------- scope the candidate set
const rig = skelOf(stand) ?? skelOf(walk);
let candidates = [];
let scoping = '';
if (rig !== null) {
  candidates = Object.keys(ix.seq).map(Number).filter((id) => skelOf(id) === rig).sort((a, b) => a - b);
  scoping = `framemap ${rig} — ${candidates.length} sequences live on this rig, and nothing else can be his`;
} else if (mayaOf(stand) !== null || mayaOf(walk) !== null) {
  // No framemap to match on. Maya ids run in an unbroken block, so the nearest
  // classic id on each side of his stand/walk bounds his set — weaker than tenancy,
  // and reported as such rather than dressed up as the same answer.
  const anchor = mayaOf(stand) !== null ? stand : walk;
  let lo = anchor, hi = anchor;
  while (mayaOf(lo - 1) !== null) lo--;
  while (mayaOf(hi + 1) !== null) hi++;
  for (let id = lo; id <= hi; id++) if (ix.seq[id]) candidates.push(id);
  scoping = `MAYA-rigged, so there is no framemap to match on. Best scoping available is the `
    + `contiguous maya run ${lo}-${hi} (${candidates.length} ids) — it may hold more than one NPC's set.`;
} else {
  console.error(`NPC ${npcId} (${npcName}) has neither a framemap nor a maya rig on its stand/walk.`);
  process.exit(1);
}

// --------------------------------------------------------------- the neighbours
// On a framemap the neighbours are exact: everyone posing this skeleton. A maya NPC has
// no skeleton to share, so "everyone whose rig is also null" would be half the cache and
// mean nothing — there the honest neighbourhood is whoever idles inside the same id run.
const candidateSet = new Set(candidates);
const tenants = Object.entries(ix.npc)
  .filter(([, v]) => (rig !== null
    ? skelOf(v[1]) === rig || skelOf(v[2]) === rig
    : candidateSet.has(v[1]) || candidateSet.has(v[2])))
  .map(([id, v]) => ({ id: Number(id), name: v[0], stand: v[1], walk: v[2] }));
/** Sequence id -> "the stand/walk of <other NPC>" — the label that unmasks a foreign idle. */
const claimedBy = new Map();
for (const t of tenants) {
  if (t.id === npcId) continue;
  for (const [kind, id] of [['stand', t.stand], ['walk', t.walk]]) {
    if (id < 0 || id === stand || id === walk || claimedBy.has(id)) continue;
    claimedBy.set(id, `${kind} of ${t.name || '(unnamed)'} ${t.id}`);
  }
}

// ------------------------------------------------------------------ timing twins
// Two clips authored from the same source keep byte-identical frame-length arrays,
// so a slot already settled elsewhere names the same slot here. That is what proved
// the Nechryarch's block: its 6368-6372 clone the hill giant's 4649-4653 tick for
// tick — on the *same* rig, which is why same-rig matches count too.
//
// The guards are what keep this from being noise. A timing shared by half the cache
// says nothing, so a signature seen more than RARE_ENOUGH times is ignored; and the
// rig-level twin must be comparable in size, or the player skeleton (3933 clips)
// wins every comparison by sheer volume.
const RARE_ENOUGH = 8;
const rigSize = new Map();
const byLengths = new Map();
for (const [id, s] of Object.entries(ix.seq)) {
  if (s[0] !== null) rigSize.set(s[0], (rigSize.get(s[0]) ?? 0) + 1);
  if (!s[2] || s[1] < 4) continue;
  const k = `${s[1]}:${s[2]}`;
  if (!byLengths.has(k)) byLengths.set(k, []);
  byLengths.get(k).push(Number(id));
}
/** Sequence id -> "<slug> <clip>", for every clip this game has already settled. */
const settled = new Map();
for (const [sl, cfg] of Object.entries(config)) {
  for (const [clip, id] of Object.entries(cfg.anims)) settled.set(id, `${sl} ${clip}`);
}
const twinVotes = new Map();
const twinSays = new Map();
for (const id of candidates) {
  if (framesOf(id) < 4) continue;
  const bucket = byLengths.get(`${framesOf(id)}:${lengthsOf(id)}`) ?? [];
  if (bucket.length > RARE_ENOUGH) continue;
  for (const other of bucket) {
    if (other === id) continue;
    const r = skelOf(other);
    if (r !== null && r !== rig) twinVotes.set(r, (twinVotes.get(r) ?? 0) + 1);
    const known = settled.get(other);
    if (known && !twinSays.has(id)) twinSays.set(id, `same timing as ${other} = ${known}`);
  }
}
const ourSize = rigSize.get(rig) ?? candidates.length;
const twinRig = [...twinVotes.entries()]
  .filter(([r, n]) => n >= 3 && (rigSize.get(r) ?? 0) <= ourSize * 3 && (rigSize.get(r) ?? 0) >= ourSize / 3)
  .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

// ---------------------------------------------------------------- shape metrics
if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) {
  console.error(`No cache at ${CACHE_DIR}. Set OSRS_CACHE_DIR.`);
  process.exit(1);
}
const cache = new RSCache(CACHE_DIR);
await cache.onload;
const model = await buildNpcModel(cache, npcId);
if (!model) { console.error(`NPC ${npcId} has no model.`); process.exit(1); }

const seen = new Set(observed[String(npcId)] ?? []);
// The dump files some NPCs' anims under a sibling id, and for a few (npc 7411) it is
// simply polluted. When not one clip on the rig is in his observed set, the set is
// about some other NPC — flagging all twenty rows 'unobserved' would be noise
// dressed as evidence, so the report says that once and drops the column.
const oracleUsable = candidates.some((id) => seen.has(id));
const mine = slug ? Object.entries(config[slug].anims) : [];
const rows = [];
for (const id of candidates) {
  const clip = await loadClip(cache, model, id, METRIC_FRAMES).catch(() => null);
  if (!clip?.frames?.length) continue;
  const m = metrics(clip.frames);
  const s = slotScores(m, clip.frames.length);
  const best = Object.keys(s).reduce((a, b) => (s[b] > s[a] ? b : a));
  rows.push({
    id, clip, m, s,
    verdict: id === stand ? 'own stand' : id === walk ? 'own walk' : claimedBy.has(id) ? 'foreign' : best,
    score: s[best],
    note: [
      mine.filter(([, v]) => v === id).map(([c]) => `NOW ${c}`).join(' '),
      claimedBy.get(id) ? `is the ${claimedBy.get(id)}` : '',
      twinSays.get(id) ?? '',
      oracleUsable && !seen.has(id) ? 'unobserved' : '',
    ].filter(Boolean).join('  '),
  });
}
if (!rows.length) { console.error('No clip on this rig would load for this model.'); process.exit(1); }

const RANK = { death: 0, block: 1, attack: 2, 'own stand': 3, 'own walk': 3, foreign: 4 };
/** His own stand and walk are answers already, and a neighbour's clip is not his at
 *  all — none of the three belong in a shortlist of what a slot could be. */
const isCandidate = (r) => r.verdict !== 'foreign' && !r.verdict.startsWith('own');
rows.sort(slotOrder
  ? (a, b) => b.s[slotOrder] - a.s[slotOrder]
  : (a, b) => (RANK[a.verdict] - RANK[b.verdict]) || (b.score - a.score));

// ---------------------------------------------------------------------- report
const say = (t = '') => console.log(t);
say();
say(`${label}  —  npc ${npcId} "${npcName}"  (stand ${stand}, walk ${walk})`);
say(scoping);
if (ix.revision != null) say(`rig index: cache revision ${ix.revision}, built ${ix.builtAt.slice(0, 10)}`);
say();
const named = tenants.filter((t) => t.name);
const shownTenants = named.length ? named : tenants;
say(rig !== null
  ? `tenants of this rig (${tenants.length}) — a clip of theirs is never his:`
  : `neighbours inside this id run (${tenants.length}) — a clip of theirs is never his:`);
for (const t of shownTenants.slice(0, 12)) {
  say(`  npc ${String(t.id).padStart(5)}  ${(t.name || '(unnamed)').padEnd(28)} stand ${t.stand}, walk ${t.walk}`
    + `${t.id === npcId ? '   <- this one' : ''}`);
}
if (shownTenants.length > 12) say(`  … and ${shownTenants.length - 12} more`);
say();
say(twinRig !== null
  ? `twin rig: framemap ${twinRig} — ${twinVotes.get(twinRig)} clips share this rig's exact frame timings, so a slot solved there names the same slot here`
  : 'twin rig: none of comparable size shares this rig’s clip timings');
say(seen.size === 0
  ? `observed oracle: npc ${npcId} is not in the dump — probe and eyeball only`
  : oracleUsable
    ? `observed oracle: ${candidates.filter((id) => seen.has(id)).length} of ${candidates.length} candidates were seen played in game`
    : `observed oracle: the dump lists ${seen.size} ids for npc ${npcId} and NONE is on this rig — it belongs to another NPC, so it is ignored here`);
say();
say('  id     verdict   death block attack   coll reach settle   f   notes');
for (const r of rows) {
  say(
    `  ${String(r.id).padStart(6)} ${r.verdict.padEnd(9)}`
    + ` ${r.s.death.toFixed(2)}  ${r.s.block.toFixed(2)}  ${r.s.attack.toFixed(2)}`
    + `   ${r.m.collapse.toFixed(2)}  ${r.m.reach.toFixed(2)}  ${r.m.settle.toFixed(2)}`
    + `  ${String(r.clip.frames.length).padStart(2)}   ${r.note}`,
  );
}
say();
for (const s of ['death', 'block', 'attack']) {
  const best = rows.filter(isCandidate).sort((a, b) => b.s[s] - a.s[s]).slice(0, 3);
  say(`best ${s.padEnd(6)}: ${best.map((r) => `${r.id} (${r.s[s].toFixed(2)})`).join('   ')}`);
}
say();
say('Attack and block score alike on purpose — no metric here can split them.');
say('Use the tenants, the twin and the sheet; the in-game look is the only oracle.');

// ---------------------------------------------------------------- contact sheet
const shown = rows.slice(0, top);
const yaw = Number(arg('--yaw', '50')), pitch = Number(arg('--pitch', '6'));
const flipY = flag('--flipY');
const yawR = (yaw * Math.PI) / 180, pitchR = (pitch * Math.PI) / 180;
const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);
const fit = computeFit(shown.flatMap((r) => r.clip.frames), sy, cy, sp, cp, false, flipY);

const W = LABELW + COLS * CELL;
const H = shown.length * CELL;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#9aa0ad';
ctx.fillRect(0, 0, W, H);
shown.forEach((r, i) => {
  const y = i * CELL;
  ctx.fillStyle = i % 2 ? '#aab0bd' : '#9097a4';
  ctx.fillRect(0, y, W, CELL);
  const frames = r.clip.frames;
  for (let col = 0; col < Math.min(COLS, frames.length); col++) {
    const fi = frames.length <= COLS ? col : Math.round((col * (frames.length - 1)) / (COLS - 1));
    const img = renderFrame(model, frames[fi], fit, sy, cy, sp, cp, false, flipY);
    const tmp = createCanvas(SIZE, SIZE);
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, LABELW + col * CELL, y, CELL, CELL);
  }
  ctx.fillStyle = '#1a1a22'; ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`${r.id}  ${r.verdict}`, 8, y + 22);
  ctx.fillStyle = '#33333d'; ctx.font = '11px sans-serif';
  ctx.fillText(`${frames.length}f  d${r.s.death.toFixed(2)} b${r.s.block.toFixed(2)} a${r.s.attack.toFixed(2)}`, 8, y + 40);
  ctx.fillText(`col ${r.m.collapse.toFixed(2)}  rch ${r.m.reach.toFixed(2)}`, 8, y + 56);
  ctx.fillText(`set ${r.m.settle.toFixed(2)}`, 8, y + 72);
  if (r.note) ctx.fillText(r.note.slice(0, 30), 8, y + 90);
});
const outPath = join(__dirname, `tmp-triage-${label}.png`);
writeFileSync(outPath, canvas.toBuffer('image/png'));
say();
say(`-> ${outPath}  ${W}x${H}  (${shown.length} of ${rows.length} rows; --top to widen)`);
process.exit(0);

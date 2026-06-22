/**
 * Probe a contiguous block of sequence IDs for one NPC to classify each as
 * walk / attack / block(hurt) / death — so we can pick the right DEFEND clip
 * (not an attack lunge) and the right collapse. Renders one labelled row per id
 * (evenly-sampled frames) from the cache + prints a metric table:
 *
 *   collapse = height(last) / max height   (DEATH → ~0, body drops to ground)
 *   reach    = max horiz extent / frame-0  (ATTACK → high, a limb shoots out)
 *   settle   = |last - first| centroid     (BLOCK → ~0, returns to rest)
 *   frames   (BLOCK/hurt is usually SHORT and upright)
 *
 *   node scripts/probe-anim-block.mjs --npc 240 --from 60 --to 73
 *   node scripts/probe-anim-block.mjs --npc 2479 --from 6250 --to 6258 --flipY
 *
 * Build-time/offline (needs the OSRS cache). Output: scripts/tmp-probe-<npc>.png
 */
import { RSCache } from 'osrscachereader';
import { createCanvas } from 'canvas';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNpcModel, loadClip, renderFrame, computeFit, SIZE, CACHE_DIR } from './render-osrs-npc-anims.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i !== -1 ? process.argv[i + 1] : d; };
const npc = Number(arg('--npc'));
const from = Number(arg('--from'));
const to = Number(arg('--to'));
const flipY = process.argv.includes('--flipY');
const yaw = Number(arg('--yaw', '50'));
const pitch = Number(arg('--pitch', '6'));
const COLS = 10;
const CELL = 104;
const LABELW = 150;

function metrics(frames) {
  const h = [], ext = [], cen = [];
  for (const verts of frames) {
    let minY = Infinity, maxY = -Infinity, cx = 0, cy = 0, cz = 0;
    for (const v of verts) { minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); cx += v[0]; cy += v[1]; cz += v[2]; }
    cx /= verts.length; cy /= verts.length; cz /= verts.length;
    let e = 0;
    for (const v of verts) e = Math.max(e, Math.hypot(v[0] - cx, v[2] - cz));
    h.push(maxY - minY); ext.push(e); cen.push([cx, cy, cz]);
  }
  const maxH = Math.max(...h) || 1;
  const collapse = h[h.length - 1] / maxH;
  const reach = Math.max(...ext) / (ext[0] || 1);
  const a = cen[0], b = cen[cen.length - 1];
  const settle = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (maxH || 1);
  return { collapse, reach, settle };
}

const cache = new RSCache(CACHE_DIR);
await cache.onload;
const model = await buildNpcModel(cache, npc);
if (!model) { console.error(`NPC ${npc} has no model`); process.exit(1); }

const yawR = (yaw * Math.PI) / 180, pitchR = (pitch * Math.PI) / 180;
const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);

const ids = [];
for (let id = from; id <= to; id++) {
  const clip = await loadClip(cache, model, id, COLS).catch(() => null);
  if (!clip?.frames?.length) continue;
  ids.push({ id, ...clip, m: metrics(clip.frames) });
}
if (!ids.length) { console.error('no clips loaded'); process.exit(1); }

const everyFrame = ids.flatMap((c) => c.frames);
const fit = computeFit(everyFrame, sy, cy, sp, cp, false, flipY);

const W = LABELW + COLS * CELL;
const H = ids.length * CELL;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#9aa0ad'; ctx.fillRect(0, 0, W, H);

console.log(`\nNPC ${npc}  (collapse→0=DEATH, reach high=ATTACK, settle→0=BLOCK)`);
ids.forEach((c, r) => {
  const y = r * CELL;
  ctx.fillStyle = r % 2 ? '#aab0bd' : '#9097a4'; ctx.fillRect(0, y, W, CELL);
  for (let col = 0; col < Math.min(COLS, c.frames.length); col++) {
    const fi = c.frames.length <= COLS ? col : Math.round((col * (c.frames.length - 1)) / (COLS - 1));
    const img = renderFrame(model, c.frames[fi], fit, sy, cy, sp, cp, false, flipY);
    // blit the SIZE x SIZE imagedata scaled into CELL
    const tmp = createCanvas(SIZE, SIZE); tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, LABELW + col * CELL, y, CELL, CELL);
  }
  ctx.fillStyle = '#1a1a22'; ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`${c.id}`, 8, y + 24);
  ctx.fillStyle = '#33333d'; ctx.font = '11px sans-serif';
  ctx.fillText(`${c.frames.length}f`, 8, y + 42);
  ctx.fillText(`col ${c.m.collapse.toFixed(2)}`, 8, y + 58);
  ctx.fillText(`rch ${c.m.reach.toFixed(2)}`, 8, y + 74);
  ctx.fillText(`set ${c.m.settle.toFixed(2)}`, 8, y + 90);
  console.log(`  ${c.id}: ${String(c.frames.length).padStart(2)}f  collapse=${c.m.collapse.toFixed(2)}  reach=${c.m.reach.toFixed(2)}  settle=${c.m.settle.toFixed(2)}`);
});

const outPath = join(__dirname, `tmp-probe-${npc}.png`);
writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log(`-> ${outPath}  ${W}x${H}`);
process.exit(0);

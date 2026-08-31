/**
 * Spotanim discovery contact sheet.
 *
 * The cache's spotanim configs carry no names, so `--list` can only say "id N has a
 * model and an animation" — picking *which* id is General Graardor's ranged projectile,
 * or an explosion, means looking at the pixels. This bakes one representative frame of
 * each id in a range into a grid so a whole span can be eyeballed at once.
 *
 *   node scripts/dev/spotanim-contact.mjs 1190-1240        # a range
 *   node scripts/dev/spotanim-contact.mjs 91,100,360,393   # a list
 *   node scripts/dev/spotanim-contact.mjs 1190-1240 --frame 0.6 --yaw 65
 *
 * Output: scripts/tmp-spot-contact.png (gitignored) + the id → cell map on stdout.
 * Dev-only; nothing in the app imports it.
 */
import { RSCache, IndexType, ConfigType } from 'osrscachereader';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { computeFit, renderModelFrame, loadTextures, modelTextureIds, loadAnimationWithAlpha } from '../lib/rs-raster.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const CACHE_DIR = process.env.OSRS_CACHE_DIR || join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE');
let CELL = 96, COLS = 10;

const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i === -1 ? dflt : Number(process.argv[i + 1]); };
const spec = process.argv[2] ?? '';
const ids = spec.includes('-')
  ? (() => { const [a, b] = spec.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })()
  : spec.split(',').filter(Boolean).map(Number);
if (!ids.length) { console.error('usage: spotanim-contact.mjs <a-b | id,id,...>'); process.exit(1); }

CELL = arg('--cell', CELL); COLS = arg('--cols', COLS);
const ALL = process.argv.includes('--all');
const AT = arg('--frame', 0.5);   // where in the clip to sample (0..1)
const YAW = arg('--yaw', 65), PITCH = arg('--pitch', 12);

/** Same byte-walk as render-osrs-spotanims.mjs (the 1.1.3 loader misses opcode 3). */
function parseSpotAnimDef(content) {
  const b = new Uint8Array(content.buffer ?? content);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const u8 = () => b[p++], u16 = () => { const v = dv.getUint16(p); p += 2; return v; }, u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const out = { modelId: undefined, animationId: -1, recolorToFind: [], recolorToReplace: [] };
  for (let guard = 0; guard < 256; guard++) {
    const op = u8();
    if (op === 0) break;
    else if (op === 1) out.modelId = u16();
    else if (op === 3) out.modelId = u32();
    else if (op === 2) out.animationId = u16();
    else if (op === 4 || op === 5 || op === 6) u16();
    else if (op === 7 || op === 8) u8();
    else if (op === 9) { while (b[p] !== 0) p++; p++; }
    else if (op === 40) { const n = u8(); for (let i = 0; i < n; i++) { out.recolorToFind.push(u16()); out.recolorToReplace.push(u16()); } }
    else if (op === 41) { const n = u8(); for (let i = 0; i < n; i++) { u16(); u16(); } }
    else break;
  }
  return out;
}

if (!existsSync(join(CACHE_DIR, 'main_file_cache.dat2'))) { console.error(`No cache at ${CACHE_DIR}`); process.exit(1); }
const cache = new RSCache(CACHE_DIR);
await cache.onload;

const cells = [];
for (const id of ids) {
  try {
    const file = await cache.getFile(IndexType.CONFIGS, ConfigType.SPOTANIM, id);
    if (!file?.content) continue;
    const sa = parseSpotAnimDef(file.content);
    if (sa.modelId == null || sa.animationId === -1) continue;
    const model = await cache.getDef(IndexType.MODELS, sa.modelId);
    if (!model) continue;
    if (sa.recolorToFind.length) {
      const map = new Map();
      sa.recolorToFind.forEach((f, i) => map.set(f & 0xffff, sa.recolorToReplace[i] & 0xffff));
      for (let i = 0; i < model.faceColors.length; i++) {
        const r = map.get(model.faceColors[i] & 0xffff);
        if (r !== undefined) model.faceColors[i] = r;
      }
    }
    const textures = await loadTextures(cache, modelTextureIds(model));
    const anim = await loadAnimationWithAlpha(cache, model, sa.animationId);
    if (!anim.vertexData?.length) continue;
    const frames = anim.vertexData.map((fr) => fr.map(([x, y, z]) => [x, -y, z]));
    const yawR = (YAW * Math.PI) / 180, pitchR = (PITCH * Math.PI) / 180;
    const sy = Math.sin(yawR), cy = Math.cos(yawR), sp = Math.sin(pitchR), cp = Math.cos(pitchR);
    const fit = computeFit(frames, sy, cy, sp, cp, CELL, 0.12);
    const picks = ALL
      ? frames.map((_, i) => i)
      : [Math.min(frames.length - 1, Math.round(AT * (frames.length - 1)))];
    for (const fi of picks) {
      const img = renderModelFrame(model, frames[fi], fit, sy, cy, sp, cp, CELL, textures, anim.alphaData?.[fi] ?? undefined, true, 2);
      cells.push({ id: ALL ? `${id}#${fi}` : id, img, frames: frames.length, model: sa.modelId });
    }
  } catch { /* an id with no usable model is just skipped */ }
}
if (!cells.length) { console.error('nothing rendered'); process.exit(1); }

const rows = Math.ceil(cells.length / COLS);
const sheet = new PNG({ width: CELL * COLS, height: CELL * rows });
for (let i = 0; i < sheet.data.length; i += 4) { sheet.data[i] = sheet.data[i + 1] = sheet.data[i + 2] = 34; sheet.data[i + 3] = 255; }
cells.forEach((c, i) => {
  const ox = (i % COLS) * CELL, oy = Math.floor(i / COLS) * CELL;
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const s = (y * CELL + x) * 4, d = ((oy + y) * CELL * COLS + ox + x) * 4;
    const a = c.img.data[s + 3] / 255;
    for (let k = 0; k < 3; k++) sheet.data[d + k] = Math.round(c.img.data[s + k] * a + sheet.data[d + k] * (1 - a));
  }
});
const out = join(REPO, 'scripts', 'tmp-spot-contact.png');
writeFileSync(out, PNG.sync.write(sheet));
cells.forEach((c, i) => console.log(`cell ${String(i).padStart(3)} (r${Math.floor(i / COLS)},c${i % COLS})  id=${c.id}  model=${c.model}  frames=${c.frames}`));
console.log(`\n${cells.length} cells, ${COLS} per row → ${out}`);
process.exit(0);

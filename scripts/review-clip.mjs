/**
 * Build a triage grid for ONE clip across every enemy: one labelled row per
 * enemy, N evenly-sampled frames of that clip from the already-baked sheets,
 * flattened onto a dark background. Lets us eyeball all hurts (or all deaths) at
 * once to spot the wrong ones (e.g. an attack lunge masquerading as a block).
 *
 *   node scripts/review-clip.mjs hurt    # -> scripts/tmp-review-hurt.png
 *   node scripts/review-clip.mjs death
 */
import { createCanvas, loadImage } from 'canvas';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const clip = process.argv[2] || 'hurt';
const filter = process.argv.slice(3); // optional slug subset for a readable grid
const COLS = 8;        // sampled frames per enemy
const CELL = 128;      // px per frame in the grid
const LABELW = 150;
const config = JSON.parse(readFileSync(join(__dirname, 'enemy-anims.config.json'), 'utf8'));

const rows = [];
for (const slug of Object.keys(config)) {
  if (filter.length && !filter.includes(slug)) continue;
  const png = join(REPO, 'public', 'assets', 'enemies', slug, `${clip}.png`);
  const man = join(REPO, 'public', 'assets', 'enemies', slug, `${slug}.json`);
  if (!existsSync(png) || !existsSync(man)) continue;
  const m = JSON.parse(readFileSync(man, 'utf8'));
  if (!m.clips[clip]) continue;
  rows.push({ slug, png, frames: m.clips[clip].frames, anim: m.clips[clip].anim });
}

const W = LABELW + COLS * CELL;
const H = rows.length * CELL;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#22222c';
ctx.fillRect(0, 0, W, H);

for (let r = 0; r < rows.length; r++) {
  const { slug, png, frames, anim } = rows[r];
  const img = await loadImage(png);
  const fw = img.width / frames;
  const y = r * CELL;
  ctx.fillStyle = r % 2 ? '#262630' : '#1e1e26';
  ctx.fillRect(0, y, W, CELL);
  ctx.fillStyle = '#caa86a';
  ctx.font = '14px sans-serif';
  ctx.fillText(slug, 6, y + CELL / 2 - 4);
  ctx.fillStyle = '#7a7a8a';
  ctx.font = '11px sans-serif';
  ctx.fillText(`anim ${anim} · ${frames}f`, 6, y + CELL / 2 + 12);
  for (let c = 0; c < COLS; c++) {
    const fi = frames <= COLS ? Math.min(frames - 1, c) : Math.round((c * (frames - 1)) / (COLS - 1));
    const sx = fi * fw;
    ctx.drawImage(img, sx, 0, fw, img.height, LABELW + c * CELL, y, CELL, CELL);
    if (frames <= COLS && c >= frames) break;
  }
}

const suffix = filter.length ? `-${filter[0]}` : '';
const outPath = join(__dirname, `tmp-review-${clip}${suffix}.png`);
writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log(outPath, `${W}x${H} (${rows.length} enemies)`);

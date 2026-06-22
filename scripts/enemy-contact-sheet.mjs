/**
 * Composite a baked enemy's clips (walk/hurt/death) into one contact sheet over a
 * dark background so the frames are easy to eyeball after a re-bake. Each clip is
 * a row; alpha is flattened onto grey. Quick QA for the glTF bake pipeline
 * (scripts/bake-enemy-sprites-from-gltf.mjs).
 *
 *   node scripts/enemy-contact-sheet.mjs hill_giant   # -> scripts/tmp-contact-hill_giant.png
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const slug = process.argv[2] || 'hill_giant';
const S = 128;
const dir = join(REPO, 'public', 'assets', 'enemies', slug);
const clips = ['walk', 'hurt', 'death'];
const rows = [];
for (const c of clips) {
  try {
    const png = PNG.sync.read(readFileSync(join(dir, `${c}.png`)));
    rows.push({ c, png, frames: png.width / S });
  } catch {}
}
const maxFrames = Math.max(...rows.map((r) => r.frames));
const out = new PNG({ width: S * maxFrames, height: S * rows.length });
// gray bg
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 40; out.data[i + 1] = 40; out.data[i + 2] = 48; out.data[i + 3] = 255; }
rows.forEach((r, ri) => {
  for (let f = 0; f < r.frames; f++) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const src = (y * r.png.width + f * S + x) * 4;
      const a = r.png.data[src + 3] / 255;
      if (a === 0) continue;
      const dst = ((ri * S + y) * out.width + f * S + x) * 4;
      out.data[dst] = Math.round(r.png.data[src] * a + out.data[dst] * (1 - a));
      out.data[dst + 1] = Math.round(r.png.data[src + 1] * a + out.data[dst + 1] * (1 - a));
      out.data[dst + 2] = Math.round(r.png.data[src + 2] * a + out.data[dst + 2] * (1 - a));
    }
  }
});
const outPath = join(__dirname, `tmp-contact-${slug}.png`);
writeFileSync(outPath, PNG.sync.write(out));
console.log(outPath, `${out.width}x${out.height}`);

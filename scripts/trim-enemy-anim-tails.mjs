/**
 * Cut the dead tail off every baked one-shot clip that has one, in place.
 *
 * The baker does this for anything it bakes from now on (both call trimTail in
 * scripts/lib/clip-tail.mjs); this is the same cut applied to the sheets already
 * on disk, so the whole roster gets it without re-rendering 50-odd enemies — and
 * without the pixel churn a re-render would put in the diff.
 *
 * Idempotent, so it is safe to re-run after any bake.
 *
 *   node scripts/trim-enemy-anim-tails.mjs          # every enemy
 *   node scripts/trim-enemy-anim-tails.mjs goblin   # just these slugs
 *   node scripts/trim-enemy-anim-tails.mjs --dry-run
 *
 * Follow it with `npm run anims:data` to regenerate the runtime table.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { trimTail } from './lib/clip-tail.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENEMIES = join(__dirname, '..', 'public', 'assets', 'enemies');

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const only = args.filter((a) => !a.startsWith('--'));

/** Slice a horizontal sprite sheet into one RGBA buffer per frame. */
function splitSheet(png, frames, w, h) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const buf = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const src = (y * png.width + f * w) * 4;
      buf.set(png.data.subarray(src, src + w * 4), y * w * 4);
    }
    out.push(buf);
  }
  return out;
}

let touched = 0;
for (const slug of readdirSync(ENEMIES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  if (only.length && !only.includes(slug)) continue;
  const manifestPath = join(ENEMIES, slug, `${slug}.json`);
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { frameW: w, frameH: h } = manifest;
  let changed = false;

  for (const [name, clip] of Object.entries(manifest.clips)) {
    if (clip.loop) continue;
    const sheetPath = join(ENEMIES, slug, `${name}.png`);
    if (!existsSync(sheetPath)) continue;
    const png = PNG.sync.read(readFileSync(sheetPath));
    const frames = splitSheet(png, clip.frames, w, h);
    const trimmed = trimTail(frames, clip.frameMs.slice(), false);
    const heldChanged = trimmed.frameMs[trimmed.frames.length - 1] !== clip.frameMs[trimmed.frames.length - 1];
    if (!trimmed.dropped && !heldChanged) continue;

    const before = clip.frameMs.reduce((a, b) => a + b, 0);
    const after = trimmed.frameMs.reduce((a, b) => a + b, 0);
    console.log(`  ${slug}/${name}: ${clip.frames} → ${trimmed.frames.length} frames, ${before} → ${after} ms`);
    changed = true;
    if (dry) continue;

    const sheet = new PNG({ width: w * trimmed.frames.length, height: h });
    trimmed.frames.forEach((buf, f) => {
      for (let y = 0; y < h; y++) sheet.data.set(buf.subarray(y * w * 4, (y + 1) * w * 4), (y * sheet.width + f * w) * 4);
    });
    writeFileSync(sheetPath, PNG.sync.write(sheet));
    clip.frames = trimmed.frames.length;
    clip.frameMs = trimmed.frameMs;
  }

  if (changed) { touched++; if (!dry) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); }
}
console.log(dry ? `(dry run) ${touched} enemies would change` : `${touched} enemies trimmed`);

/**
 * Static metric sweep of EVERY enemy's CURRENT hurt/death anim (from
 * enemy-anims.config.json) so we can flag the wrong ones without eyeballing 32
 * sprite sheets. For each enemy it loads the NPC model once and, per configured
 * clip, computes the same metrics as probe-anim-block:
 *
 *   collapse = height(last) / max height   (DEATH should be LOW — body drops)
 *   reach    = max horiz extent / frame-0  (ATTACK is HIGH — a limb shoots out)
 *   settle   = |last - first| centroid     (BLOCK returns to rest — LOW)
 *
 * Flags:
 *   HURT looks like ATTACK : reach > 1.12
 *   HURT looks like DEATH  : collapse < 0.78
 *   DEATH doesn't collapse : collapse > 0.80
 *
 *   node scripts/validate-anims.mjs            # all enemies
 *   node scripts/validate-anims.mjs goblin imp # subset
 *
 * Build-time/offline (needs the OSRS cache). Prints a table; no image output.
 */
import { RSCache } from 'osrscachereader';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNpcModel, loadClip, CACHE_DIR } from './render-osrs-npc-anims.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'enemy-anims.config.json'), 'utf8'));
const filter = process.argv.slice(2);

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

const suspects = [];
for (const [slug, cfg] of Object.entries(config)) {
  if (filter.length && !filter.includes(slug)) continue;
  const model = await buildNpcModel(cache, cfg.npc).catch(() => null);
  if (!model) { console.log(`! ${slug}: no model`); continue; }
  for (const [name, animId] of Object.entries(cfg.anims)) {
    if (name === 'walk') continue;
    const clip = await loadClip(cache, model, animId, 24).catch(() => null);
    if (!clip?.frames?.length) { console.log(`! ${slug}.${name}: anim ${animId} no frames`); continue; }
    const m = metrics(clip.frames);
    const flags = [];
    if (name === 'hurt') {
      if (m.reach > 1.12) flags.push('ATTACK?');
      if (m.collapse < 0.78) flags.push('DEATH?');
    }
    if (name === 'death' && m.collapse > 0.80) flags.push('NO-COLLAPSE?');
    const tag = flags.length ? `  <<< ${flags.join(' ')}` : '';
    if (flags.length) suspects.push(`${slug}.${name} (anim ${animId}): ${flags.join(' ')}`);
    console.log(
      `${slug.padEnd(22)} ${name.padEnd(5)} anim ${String(animId).padStart(5)}  ${String(clip.frames.length).padStart(2)}f` +
      `  collapse=${m.collapse.toFixed(2)} reach=${m.reach.toFixed(2)} settle=${m.settle.toFixed(2)}${tag}`,
    );
  }
}

console.log(`\n=== ${suspects.length} suspect(s) ===`);
suspects.forEach((s) => console.log('  ' + s));
process.exit(0);

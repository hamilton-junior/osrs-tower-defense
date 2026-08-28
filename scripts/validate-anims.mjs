/**
 * Static metric sweep of EVERY enemy's CURRENT hurt/death anim (from
 * enemy-anims.config.json) so we can flag the wrong ones without eyeballing 32
 * sprite sheets. For each enemy it loads the NPC model once and, per configured
 * clip, computes the shared metrics from lib/anim-metrics.mjs:
 *
 *   collapse = height(last) / max height   (DEATH should be LOW — body drops)
 *   reach    = max horiz extent / frame-0  (ATTACK is HIGH — a limb shoots out)
 *   settle   = |last - first| centroid     (BLOCK returns to rest — LOW)
 *
 * Flags:
 *   HURT looks like ATTACK : reach > ATTACK_REACH
 *   HURT looks like DEATH  : collapse < DEATH_COLLAPSE
 *   DEATH doesn't collapse : collapse > LIVE_COLLAPSE
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
import { metrics, ATTACK_REACH, DEATH_COLLAPSE, LIVE_COLLAPSE } from './lib/anim-metrics.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'enemy-anims.config.json'), 'utf8'));
const filter = process.argv.slice(2);

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
      if (m.reach > ATTACK_REACH) flags.push('ATTACK?');
      if (m.collapse < DEATH_COLLAPSE) flags.push('DEATH?');
    }
    if (name === 'death' && m.collapse > LIVE_COLLAPSE) flags.push('NO-COLLAPSE?');
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

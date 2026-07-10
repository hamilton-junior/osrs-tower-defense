/**
 * Dev-only: screenshot the exported game UI so chrome changes can be eyeballed
 * without a manual run. Drives the headless browser through dev/harness.mjs,
 * then opens the Collection Log (seeded via a debug cheat) so a populated list
 * panel is in frame.
 *
 *   npm run build && node scripts/screenshot-ui.mjs
 *   -> scripts/tmp-ui.png (+ tmp-ui-panel.png, tmp-ui-detail.png crops)
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withGame } from './dev/harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

await withGame(async ({ page, toggleDebug, clickTitle, sleep }) => {
  // Seed the log with kills so its entries aren't all locked silhouettes. The
  // debug console has no button — it opens on Ctrl+' — so drive it by chord.
  await toggleDebug();
  await page.evaluate(() => {
    const bt = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || ''));
    bt(/^\s*Cheats\s*$/i)?.click();
  });
  await sleep(250);
  await page.evaluate(() => {
    const bt = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || ''));
    bt(/^\s*tools\s*$/i)?.click();
  });
  await sleep(250);
  const seeded = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((el) => /Seed Collection Log/i.test(el.textContent || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  await toggleDebug(); // close it so it doesn't overlap the shot
  await clickTitle('Collection Log');
  await sleep(500);

  await page.screenshot({ path: join(__dirname, 'tmp-ui.png') });

  // Tight crops: the viewer downscales the full shot, so bevel/entry detail is
  // only legible zoomed in on the panel itself.
  const cropOf = (text) => page.evaluate((q) => {
    const el = [...document.querySelectorAll('.rs-panel')].find((p) => new RegExp(q, 'i').test(p.textContent || ''));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const pad = 12;
    return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 };
  }, text);

  const logRect = await cropOf('Collection Log');
  if (logRect) await page.screenshot({ path: join(__dirname, 'tmp-ui-panel.png'), clip: logRect });

  await page.evaluate(() => { document.querySelector('button.rs-log-entry')?.click(); });
  await sleep(400);
  const detailRect = await cropOf('Collection Log');
  if (detailRect) await page.screenshot({ path: join(__dirname, 'tmp-ui-detail.png'), clip: detailRect });

  console.log(
    'tmp-ui.png',
    seeded ? '(log seeded)' : '(seed cheat not found)',
    logRect ? '+ tmp-ui-panel.png' : '(log panel not found)',
    detailRect ? '+ tmp-ui-detail.png' : '',
  );
});

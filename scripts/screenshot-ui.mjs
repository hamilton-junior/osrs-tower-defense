/**
 * Dev-only: screenshot the exported game UI so chrome changes can be eyeballed
 * without a manual run. Serves the static `out/` export and drives headless Edge
 * (puppeteer-core), opening a couple of toggled panels so the shop chrome shows.
 *
 *   npm run build && node scripts/screenshot-ui.mjs
 *   -> scripts/tmp-ui.png
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'out');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon',
};

function findBrowser() {
  const c = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  for (const p of c) if (existsSync(p)) return p;
  throw new Error('No Chromium browser found. Set PUPPETEER_EXECUTABLE_PATH.');
}

async function main() {
  if (!existsSync(OUT)) { console.error('No out/ — run `npm run build` first.'); process.exit(1); }
  const server = createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    let abs = join(OUT, url);
    if (existsSync(abs) && statSync(abs).isDirectory()) abs = join(abs, 'index.html');
    if (!existsSync(abs)) abs = join(OUT, 'index.html'); // SPA fallback
    res.setHeader('content-type', MIME[extname(abs)] || 'application/octet-stream');
    res.end(readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 30000 });
  // Give the engine a beat to boot + first emit, then open the Essence Shop so a
  // list panel is visible in the shot.
  await new Promise((r) => setTimeout(r, 1500));
  // Open the Slayer Rewards shop (its "Slayer Rewards" button lives in the task
  // panel) + fire a test unlock popup via the debug panel's cheat.
  await page.evaluate(() => {
    const bt = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || ''));
    const byTitle = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.title));
    bt(/^\s*Slayer Rewards\s*$/i)?.click();
    byTitle(/Debug/i)?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const bt = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent || ''));
    bt(/^\s*Cheats\s*$/i)?.click();
    bt(/Test unlock popup/i)?.click();
  });
  await new Promise((r) => setTimeout(r, 700)); // let the popup animate in + hold

  // Full shot for layout, plus tight crops of the unlock popup + a panel so the
  // bevel/border detail is legible (the viewer downscales the full shot).
  await page.screenshot({ path: join(__dirname, 'tmp-ui.png') });
  const cropOf = (selOrText) => page.evaluate((q) => {
    const el = q.startsWith('.')
      ? document.querySelector(q)
      : [...document.querySelectorAll('.rs-panel')].find((p) => new RegExp(q, 'i').test(p.textContent || ''));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const pad = 12;
    return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 };
  }, selOrText);
  const popRect = await cropOf('.rs-unlock-popup');
  if (popRect) await page.screenshot({ path: join(__dirname, 'tmp-ui-popup.png'), clip: popRect });
  const panelRect = await cropOf('Slayer Points');
  if (panelRect) await page.screenshot({ path: join(__dirname, 'tmp-ui-panel.png'), clip: panelRect });
  console.log('tmp-ui.png', popRect ? '+ tmp-ui-popup.png' : '(popup not found)', panelRect ? '+ tmp-ui-panel.png' : '');
  await browser.close();
  server.close();
  process.exit(0);
}

main();

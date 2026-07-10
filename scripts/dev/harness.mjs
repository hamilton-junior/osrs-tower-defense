/**
 * Headless driver for the exported game — the shared plumbing every UI probe and
 * screenshot script needs, so none of them re-derive it.
 *
 * The game is a static export with no backend, so a probe must: serve `out/`,
 * launch a local Chromium (puppeteer-core, no bundled browser), get past the
 * start screen and the learn-as-you-go tips, and — because the board is
 * letterboxed (`object-fit: contain`) — convert logic coordinates to client
 * coordinates before clicking the map.
 *
 * Run `npm run build` first: this serves `out/`, not the dev server.
 *
 *   import { withGame } from './dev/harness.mjs';
 *   await withGame(async ({ page, clickBoard }) => {
 *     await clickBoard(600, 400);
 *     console.log(await page.evaluate(() => document.querySelector('footer').clientHeight));
 *   });
 *
 * `withGame` always tears the browser and server down, including on throw.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT = resolve('out');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.wav': 'audio/wav', '.woff2': 'font/woff2', '.gltf': 'model/gltf+json',
};

/** A Chromium the machine already has; puppeteer-core ships no browser. */
function findBrowser() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find(existsSync);
  if (!found) throw new Error('No Chromium found. Set PUPPETEER_EXECUTABLE_PATH.');
  return found;
}

/** Serve the static export on an ephemeral port, with an SPA fallback. */
function serveOut() {
  if (!existsSync(OUT)) throw new Error('No out/ — run `npm run build` first.');
  const server = createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/') url = '/index.html';
    let abs = join(OUT, url);
    if (existsSync(abs) && statSync(abs).isDirectory()) abs = join(abs, 'index.html');
    if (!existsSync(abs)) abs = join(OUT, 'index.html');
    res.setHeader('content-type', MIME[extname(abs)] || 'application/octet-stream');
    res.end(readFileSync(abs));
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click the first button whose `title` starts with `prefix`. Returns whether it hit. */
const clickTitle = (page, prefix) => page.evaluate((p) => {
  const b = [...document.querySelectorAll('button, a')].find((el) => (el.title || '').startsWith(p));
  if (b) { b.click(); return true; }
  return false;
}, prefix);

/** Click the first button whose trimmed text contains `text`. Returns whether it hit. */
const clickText = (page, text) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('button')].find((el) => el.textContent.trim().includes(t));
  if (b) { b.click(); return true; }
  return false;
}, text);

/**
 * Get past the two things that stand between a fresh page and the board: the
 * mode-select start screen, then the first learn-as-you-go tip.
 *
 * The start button is matched by `title` ("Lock in this mode and start the run"),
 * not text — its label is the chosen mode's name. "Skip tips" retires the tips
 * for good; seeding `osrs_td_learn_seen` does not (the spotlight ring still
 * draws), so click the real button.
 */
async function enterRun(page) {
  await sleep(1500); // engine boot + first UIState emit
  if (!(await clickTitle(page, 'Lock in this mode'))) throw new Error('start screen never appeared');
  await sleep(900);
  await clickText(page, 'Skip tips');
  await sleep(500);
}

/**
 * The board's painted rectangle in client pixels. The canvas fills its container
 * but the *picture* does not fill the canvas: its resolution is fixed at birth
 * and `object-fit: contain` letterboxes it. Mirrors `paintedBox()` in GameRoot.
 */
const boardBox = (page) => page.evaluate(() => {
  const el = document.querySelector('canvas');
  const r = el.getBoundingClientRect();
  const scale = Math.min(r.width / el.width, r.height / el.height);
  const width = el.width * scale;
  const height = el.height * scale;
  return {
    left: r.left + (r.width - width) / 2,
    top: r.top + (r.height - height) / 2,
    width, height,
    logicWidth: el.width, logicHeight: el.height,
  };
});

/**
 * Open the game's hidden debug console. It has no button on purpose — Ctrl+'
 * is the chord games conventionally use. Toggles, so call twice to close.
 */
async function toggleDebug(page) {
  await page.keyboard.down('Control');
  await page.keyboard.press("'");
  await page.keyboard.up('Control');
  await sleep(400);
}

/**
 * Boot the game and hand a driven page to `fn`. Tears everything down after.
 *
 * @param {(ctx: {
 *   page: import('puppeteer-core').Page,
 *   browser: import('puppeteer-core').Browser,
 *   clickBoard: (logicX: number, logicY: number) => Promise<void>,
 *   boardBox: () => Promise<object>,
 *   toggleDebug: () => Promise<void>,
 *   clickTitle: (prefix: string) => Promise<boolean>,
 *   clickText: (text: string) => Promise<boolean>,
 *   sleep: (ms: number) => Promise<void>,
 * }) => Promise<void>} fn
 * @param {{ width?: number, height?: number, dpr?: number, skipRun?: boolean }} [opts]
 *   `skipRun` leaves the mode-select start screen up (for probing it).
 */
export async function withGame(fn, opts = {}) {
  const { width = 1600, height = 900, dpr = 1, skipRun = false } = opts;
  const { server, port } = await serveOut();
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
    await page.setViewport({ width, height, deviceScaleFactor: dpr });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    if (!skipRun) await enterRun(page);

    const clickBoard = async (logicX, logicY) => {
      const b = await boardBox(page);
      await page.mouse.click(
        b.left + (logicX / b.logicWidth) * b.width,
        b.top + (logicY / b.logicHeight) * b.height,
      );
    };
    await fn({
      page, browser, clickBoard, sleep,
      boardBox: () => boardBox(page),
      toggleDebug: () => toggleDebug(page),
      clickTitle: (p) => clickTitle(page, p),
      clickText: (t) => clickText(page, t),
    });
  } finally {
    await browser.close();
    server.close();
  }
}

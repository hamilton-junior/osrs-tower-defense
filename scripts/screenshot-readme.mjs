/**
 * Bake the screenshots the README links to.
 *
 *   npm run build && node scripts/screenshot-readme.mjs [start|board|collection-log]
 *   -> docs/screenshots/{start,board,collection-log}.png
 *
 * Naming shots bakes only those. The board's road layout is rolled per run, so
 * re-baking the whole set trades the hero shot's map for a fresh one.
 *
 * Drives the exported game through dev/harness.mjs, so it serves `out/` and needs
 * a build first. Every click is a real click on the real interface. The debug
 * console does the setup a player would reach over many waves — gold, wave
 * number, tower tiers, the biome skin, a seeded Collection Log — because a
 * screenshot of wave 1 with five level-1 archers says nothing about the game.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import UPNG from 'upng-js';
import { withGame } from './dev/harness.mjs';

const OUT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const SIZE = { width: 1600, height: 900 };

/**
 * Take the shot, then re-encode it down to a 256-colour palette.
 *
 * Chromium writes truecolour PNGs, and the three of them ran to 3.8 MB in a repo
 * people have to clone. Quantising costs nothing a reader can see at README
 * scale — the game's own art is a few dozen flat colours — and hands back two
 * thirds of the bytes. Re-deflating alone hands back none, so the palette is
 * the whole saving.
 */
async function shoot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path });
  const before = statSync(path).size;
  const png = PNG.sync.read(readFileSync(path));
  const small = Buffer.from(UPNG.encode([new Uint8Array(png.data).buffer], png.width, png.height, 256));
  writeFileSync(path, small);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`${name}.png  ${kb(before)} -> ${kb(small.length)}`);
}

/** Which shots to bake. No argument bakes all three. */
const only = process.argv.slice(2);
const want = (name) => only.length === 0 || only.includes(name);

/** The region the hero shot is skinned to: the game's green starting palette. */
const HERO_BIOME = 'Misthalin Plains';

/** A boss wave, so the hero shot carries a boss and its health bar. Every tenth
 *  wave sends one; which one is the run's own boss order, so this varies. */
const HERO_WAVE = 60;

/** The selected-tower panel, by the only classes in the app that name it. */
const TOWER_PANEL = '.rs-panel.top-4.left-4';

/**
 * Put a value into one of the debug console's number fields and commit it.
 *
 * Typing into the field appends to what it already holds, and a number input
 * does not select on triple-click, so write through React's own value setter and
 * then press the row's Set button (the grid cell two along from the field).
 */
async function setDebugNumber(page, label, value) {
  const sel = `input[aria-label="${label}"]`;
  await page.waitForSelector(sel, { timeout: 5000 });
  await page.evaluate((s, v) => {
    const el = document.querySelector(s);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.nextElementSibling?.nextElementSibling?.click();
  }, sel, value);
}

/** Close the debug console by its own ✕, not by the chord: a focused field eats keys. */
const closeDebug = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((el) => el.title === 'Close');
  if (b) { b.click(); return true; }
  return false;
});

/** Click the first button whose `title` starts with `prefix`. */
const clickByTitle = (page, prefix) => page.evaluate((p) => {
  const b = [...document.querySelectorAll('button')].find((el) => (el.title || '').startsWith(p));
  if (b) { b.click(); return true; }
  return false;
}, prefix);

/** The debug console's tab strip is icon-only; the label lives on `aria-label`. */
const openDebugTab = (page, label) => page.evaluate((l) => {
  const b = document.querySelector(`button[aria-label="${l}"]`);
  if (b) { b.click(); return true; }
  return false;
}, label);

/** The biome name the Map card shows beside its title. */
const readBiome = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((el) => (el.title || '').startsWith('Re-skin this layout'));
  const card = b?.closest('.rs-panel-inset');
  return card?.querySelector('span.ml-auto')?.textContent?.trim() ?? null;
});

/**
 * Park a movable panel before it mounts.
 *
 * Every panel reads its drag offset out of `ui_pos_<id>` once, on mount, and
 * clamps it to the viewport — so a huge value means "as far as that side goes".
 * Parking the console and the tower card in opposite corners frees most of the
 * board for the clicks below; nothing reaches the canvas through a panel.
 */
const parkPanel = (page, id, x, y) => page.evaluate((k, ox, oy) => {
  localStorage.setItem(`ui_pos_${k}`, JSON.stringify({ x: ox, y: oy }));
}, id, x, y);

/** Client rects of every visible panel, to keep board clicks out from under them. */
const panelRects = (page) => page.evaluate(() => [...document.querySelectorAll('.rs-panel')]
  .map((el) => el.getBoundingClientRect())
  .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })));

// ── 1. The mode-select start screen, before a run exists ─────────────────────

if (want('start')) await withGame(async ({ page, sleep }) => {
  await sleep(1800); // engine boot + first UIState emit
  await shoot(page, 'start');
}, { ...SIZE, skipRun: true });

// ── 2. The hero shot: a built-up board under a late wave ─────────────────────

if (want('board')) await withGame(async ({ page, clickBoard, boardBox, toggleDebug, sleep }) => {
  // Gold to build with, and a wave number whose roster is worth looking at.
  await toggleDebug();
  await setDebugNumber(page, 'Gold', 2_000_000);
  await setDebugNumber(page, 'Wave', HERO_WAVE);

  // Re-skin to the green starting region. Cycling only swaps the palette, so the
  // road and the towers below are untouched by it.
  await openDebugTab(page, 'Tools');
  await sleep(250);
  for (let i = 0; i < 8 && (await readBiome(page)) !== HERO_BIOME; i++) {
    await clickByTitle(page, 'Re-skin this layout');
    await sleep(200);
  }
  await closeDebug(page);
  await sleep(300);

  const box = await boardBox();
  // Tile centres come off the measured box: `clickBoard` speaks canvas
  // backing-store pixels, which are not the engine's 1440x640 logic space.
  const tx = (i) => ((i + 0.5) / 45) * box.logicWidth;
  const ty = (j) => ((j + 0.5) / 20) * box.logicHeight;
  // …and the same tile in client pixels, to test it against a panel's rect.
  const client = (i, j) => ({
    x: box.left + ((i + 0.5) / 45) * box.width,
    y: box.top + ((j + 0.5) / 20) * box.height,
  });
  const under = (rects, i, j) => {
    const p = client(i, j);
    return rects.some((r) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom);
  };

  // Sweep the board and let the engine refuse the tiles it owns (road, water,
  // rock). A refused placement costs nothing, so the sweep is free. The dock
  // slots cycle so the shot carries every tower type and both wizard books.
  const SLOTS = ['1', '3', '5', '1', '4', '6', '1', '3', '2', '5', '1', '4', '6', '3', '2'];
  const BOOKS = ['Elemental', 'Ancients'];
  const CELLS = [];
  for (let j = 2; j <= 17; j += 4) for (let i = 3; i <= 42; i += 4) CELLS.push([i, j]);

  for (const [n, [i, j]] of CELLS.entries()) {
    const slot = SLOTS[n % SLOTS.length];
    await page.keyboard.press(slot);
    await clickBoard(tx(i), ty(j));
    // A placed wizard waits on a spellbook before it exists at all.
    if (slot === '2') await clickByTitle(page, BOOKS[n % BOOKS.length]);
  }
  // Right-click drops the armed tower. Escape would too, but with nothing armed
  // Escape pauses instead, which would stamp a banner across the shot.
  await page.mouse.click(box.left + box.width / 2, box.top + box.height / 2, { button: 'right' });
  await sleep(250);

  /** Is a tower selected? The console's tower card only exists when one is. */
  const towerSelected = async () => (await page.$('input[aria-label="Tier"]')) !== null;

  /**
   * Walk `cells`, giving each tower a combat level and a tier through the
   * console. A tier cannot simply be bought: it is gated on the combat level the
   * tower earns by fighting, so a freshly built board is stuck at tier 1 however
   * much gold it holds. Returns the cells whose click a panel was sitting on.
   */
  async function tierPass(cells) {
    await openDebugTab(page, 'Tools');
    await sleep(250);
    // Select something first: the tower card's own panel has to be on screen
    // before its rect can be measured out of the way of the clicks below.
    for (const [i, j] of cells) {
      await clickBoard(tx(i), ty(j));
      if (await towerSelected()) break;
    }
    const rects = await panelRects(page);
    const blocked = [];
    for (const [n, [i, j]] of cells.entries()) {
      if (under(rects, i, j)) { blocked.push([i, j]); continue; }
      await clickBoard(tx(i), ty(j));
      if (!(await towerSelected())) continue; // road, water, or an empty tile
      await setDebugNumber(page, 'Combat level', 15 + (n * 7) % 60);
      await setDebugNumber(page, 'Tier', [4, 3, 4, 2, 3, 4, 3, 2][n % 8]);
    }
    return blocked;
  }

  // Two passes with the panels parked in opposite corners: what one pass covers,
  // the other leaves clear. Both panels re-read their parking on mount, so the
  // tower card has to be closed (nothing selected) while it moves.
  await parkPanel(page, 'debug', -9999, 9999);   // console: bottom left
  await parkPanel(page, 'tower', 9999, 9999);    // tower card: bottom right
  await toggleDebug();
  const blocked = await tierPass(CELLS);
  await closeDebug(page);

  await clickBoard(tx(44), ty(19)); // clear the selection so the card remounts
  await parkPanel(page, 'debug', 0, 0);          // console: back to the top centre
  await parkPanel(page, 'tower', 0, 0);          // tower card: back to the top left
  await toggleDebug();
  const stillBlocked = await tierPass(blocked);
  await closeDebug(page);
  await sleep(300);
  if (stillBlocked.length) console.log(`  ${stillBlocked.length} tile(s) stayed under a panel`);

  // Leave a believable purse behind rather than the two million used to build.
  await toggleDebug();
  await setDebugNumber(page, 'Gold', 3_250);
  await closeDebug(page);
  await sleep(300);

  // Nothing may be selected in the shot: the tower card covers a quarter of the
  // board. Tiles two apart from every built one are empty, so a click there
  // clears the selection — as long as it does not land on a panel itself.
  for (let j = 4; j <= 16 && (await page.$(TOWER_PANEL)); j += 4) {
    for (let i = 5; i <= 41; i += 4) {
      if (under(await panelRects(page), i, j)) continue;
      await clickBoard(tx(i), ty(j));
      if (!(await page.$(TOWER_PANEL))) break;
    }
  }
  if (await page.$(TOWER_PANEL)) console.log('  tower card would not close');

  await page.keyboard.press(' '); // start the wave
  await page.keyboard.press('x'); // 2x, so the roster is spread down the road
  await sleep(11000);
  await shoot(page, 'board');
}, SIZE);

// ── 3. The Collection Log, seeded so its entries are real kill counts ────────

if (want('collection-log')) await withGame(async ({ page, toggleDebug, clickTitle, sleep }) => {
  await toggleDebug();
  await openDebugTab(page, 'Tools');
  await sleep(300);
  const seeded = await clickByTitle(page, 'Fill the Collection Log');
  await closeDebug(page); // so it does not overlap the shot
  await sleep(300);

  await clickTitle('Collection Log');
  await sleep(800);
  await shoot(page, 'collection-log');
  if (!seeded) console.log('  seed cheat not found');
}, SIZE);

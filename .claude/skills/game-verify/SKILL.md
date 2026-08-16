---
name: game-verify
description: Verify a change to the OSRS tower-defense game before claiming it works — the typecheck/test/build gate, plus how to drive the exported game in a headless browser to observe UI and gameplay behaviour. Use before committing, when asked whether a change works, when a claim needs evidence, when taking a screenshot of the UI, or when a UI/engine change has no unit test that could catch a regression.
---

# Verifying a change to this game

Do not claim a change works without running the gate. Report the actual numbers you saw, not "all green".

## The gate

Run in this order; each catches what the previous cannot.

| Command | Catches | Notes |
|---|---|---|
| `npx tsc --noEmit` | type errors | **TS errors fail `next build`.** This is the real safety net for JSX/type changes. |
| `npx vitest run` | logic regressions | Only covers pure `lib/game/systems/`. Nothing in `core/engine.ts` or `GameRoot.tsx` is tested. |
| `npm run build` | static-export breakage | `output: 'export'`. ESLint is **ignored** during build, so `npm run lint` never gates anything. |

`npx tsc --noEmit` and `npx vitest run` are pre-approved in `.claude/settings.json` — no permission prompt.

Because the engine and the React bridge have **no unit tests**, a green gate says nothing about whether a UI or gameplay change actually works. For those, drive the game.

## Driving the game headlessly

`scripts/dev/harness.mjs` exports `withGame`, which serves `out/`, launches a local Chromium (puppeteer-core; no bundled browser), clears the start screen and the tips, and tears everything down on the way out.

**Run `npm run build` first** — the harness serves `out/`, not the dev server.

```js
// scripts/dev/tmp-probe.mjs  (throwaway — delete before committing)
import { withGame } from './harness.mjs';

await withGame(async ({ page, clickBoard, boardBox, toggleDebug, clickTitle, clickText, sleep }) => {
  const box = await boardBox();               // letterbox-aware painted rect
  await clickBoard(box.logicWidth / 2, 400);  // logic coords -> client coords
  await toggleDebug();                        // Ctrl+' — the console has no button
  console.log(await page.evaluate(() => document.querySelector('footer').clientHeight));
});
```

`withGame(fn, { width, height, dpr, skipRun })`. Pass `skipRun: true` to probe the mode-select start screen itself.

Write probes to `scripts/dev/tmp-*.mjs`, print terse facts (numbers, booleans, geometry), and **delete them before committing**. `scripts/tmp-*.png` is gitignored; `scripts/dev/tmp-*.mjs` is not — remove it.

For a UI screenshot, `node scripts/screenshot-ui.mjs` (after `npm run build`) already drives the harness and writes `scripts/tmp-ui.png` plus tight crops. Read the PNG to eyeball chrome.

## Traps that have cost real time

- **The start button is matched by `title`, not text.** Its label is the chosen mode's name; its title starts with `Lock in this mode`. `clickText('Lock in this mode')` silently does nothing and the whole probe then reports missing elements. `enterRun` already handles this.
- **Seeding `localStorage['osrs_td_learn_seen']` does not suppress the learn tip** — the spotlight ring still draws around whatever it anchors to, which looks like a real UI bug in a screenshot. Click the real **"Skip tips"** button (`enterRun` does).
- **The board is letterboxed** (`object-fit: contain`, resolution fixed at birth). Clicking a fraction of the canvas rect lands in the wrong place. Always use `clickBoard(logicX, logicY)`.
- **`clickBoard`'s coordinates are canvas *backing-store* pixels, not the engine's 1440×640 logic space.** `boardBox()` reports `logicWidth: el.width`, and the backing store is sized to the board's displayed pixels × `deviceScale` — so on a 1920-wide board the usable range is 0…1920, not 0…1440. A probe that sweeps hard-coded logic tile centres silently clicks *outside* the board on the right and bottom edges, and every case there reports "never opened" rather than failing loudly. Derive tile positions from the measured box (`(i + 0.5) / 45 * box.logicWidth`), never from `LOGIC_WIDTH`.
- **`Escape` pauses the game**, stamping a "COMBAT PAUSED" banner across any screenshot. Close modals via their Close button.
- **Placing a wizard opens a spellbook picker**; the tower is only built once a spellbook is chosen (`confirmWizardSpellbook`). Its buttons carry `title="Elemental" | "Ancients" | "Utility"`. The barrage/element grid lives in the *selected tower* panel afterwards.
- **Absence of a value is not a bug.** The DPS meter only renders an effect row when its tally is `> 0.05`; a Blood-bonus row will not appear against low-HP enemies because the bonus is `floor(maxHp × 0.0075 × level)`. Spawn a boss via the debug console before concluding a stat is broken.
- **Counting rows by their `top` offset is meaningless** in a flex row with `items-center` — children legitimately have different tops. Measure the container's height and check for overlap with the canvas instead.

## Know when to stop

Driving the UI is expensive. If the code path is short and a type-level guarantee already covers it (a new optional field threaded through one function), the gate plus reading the diff is enough. Reach for the browser when behaviour is geometric, stateful, or emergent — layout, pointer mapping, panel drag, wave flow.

Prefer delegating a full verification pass to the `game-verifier` subagent: it runs the gate and the probe in its own context and returns only the verdict and the failures, keeping build logs and DOM dumps out of the main conversation.

## Not your job

The user playtests and balances the game themselves. Never end a report with a suggested playtest checklist.

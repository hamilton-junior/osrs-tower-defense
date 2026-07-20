---
name: game-ui
description: Work on the OSRS tower-defense game's interface or its engine↔React boundary — components/game/GameRoot.tsx, lib/game/core/engine.ts, lib/game/core/renderer.ts, app/globals.css. Use when adding or changing a panel, button, bar, HUD element, tooltip, keyboard shortcut, or anything the engine must emit to the UI; when touching canvas sizing or pointer coordinates; or when a change alters what the game teaches the player.
---

# Working on the game's UI

The active game is the **new core**: `lib/game/core/engine.ts`, `lib/game/core/renderer.ts`, `components/game/GameRoot.tsx`. `lib/game/engine.ts`, `lib/game/renderer.ts`, `components/GameCanvas.tsx` and `components/game-ui/` are **legacy, no longer rendered** — never add features there.

## The boundary

State lives in one imperative class. React never touches game entities.

- `GameEngine` runs its own rAF loop and mutates plain arrays (`enemies`, `towers`, `projectiles`).
- To push data up it calls `this.onState(patch)`, typed `Partial<UIState>` (defined in `core/engine.ts`). **Emitting a new key means adding it to `UIState` first**, or the build fails. The patch crosses `structuredClone`d — no class instances, no functions.
- `GameRoot.tsx` merges the patch: `setUi((prev) => ({ ...prev, ...patch }))`.
- UI → engine is **method calls on `engineRef.current`** (`startWave`, `placeTower`, `setAutoplay`, `setAncientType`…), which mutate state and usually `emit()` afterwards.

A feature normally touches three places: a method on `GameEngine`, a key in `UIState` + the `emit()` payload, and JSX in `GameRoot.tsx`.

Rendering changes go in `core/renderer.ts` (it holds a back-reference to the engine and keeps no state of its own), never in the engine.

## Hard rules

**The board is a fixed resolution — the same board for every player. The UI adapts to it, never the reverse.** `GameEngine.width/height` are constants (`LOGIC_WIDTH=1728 × LOGIC_HEIGHT=768`, 54×24 tiles, 2.25:1), set once in the constructor and `readonly`. The map, road, tower ranges and enemy speeds are all in these units, so the *game* must never depend on screen size, window size or `devicePixelRatio` — there is no `fitOnce`, no `resize()` on the engine, and nothing rebuilds the path from the screen (an earlier version did, and it warped the board and cropped the portal off the left edge; never reintroduce it). Piece sizes are fixed logic pixels (a ~30px enemy, a 1-tile road), so the tile count is deliberately modest — that ratio is what keeps pieces readable once the board is scaled down to a screen; adding rows/columns shrinks every piece. What *does* react to size is the **presentation only**: a single `useLayoutEffect` + `ResizeObserver` in `GameRoot.tsx` (the "fit effect") sets `boardSize` to the largest `LOGIC_WIDTH:LOGIC_HEIGHT`-aspect rectangle that fits the game area, and the board `<div>` is sized to that in px. So the board is drawn undistorted at the biggest size that fits, identical in shape on every machine; the canvas backing store stays a fixed 1728×768, and `object-fit: contain` only guards a rounding sliver. Any leftover room is *beside* the board (the game-area wrapper is `--rs-wood` chrome, not a black bar). Sizing a wrapper `<div>` to the fixed canvas is allowed and expected; re-deriving the *game* from the screen is not.

Three consequences that are easy to get wrong:

1. **Every screen↔logic conversion must go through `paintedBox()`** in `GameRoot.tsx` — it returns the painted rect plus the `dx`/`dy` origin (≈0, since the board box matches the board's aspect). `toLogic`, the marquee and the enemy hover panel already do. Raw canvas-rect fractions land in the wrong place.
2. **The bottom bar's height is a constant** (`style={{ height: '4.3em' }}`), and the whole page column must be free to shrink so the bar is never clipped: the `<main>` in `app/page.tsx` carries `min-h-0` and the game area is `flex-1 min-h-0` — without `min-h-0` a flex item refuses to shrink below its content, the board + bar overflow the screen, and the page's `overflow-hidden` eats the bar off the bottom. Keep new bar controls at a fixed footprint — Start Wave stays mounted-but-disabled during a wave for exactly this reason.
3. **Browser zoom is blocked** (viewport meta in `app/layout.tsx`; ctrl/⌘+wheel, ctrl/⌘ +/-/0 and Safari `gesture*` handlers in `GameRoot`). The only zoom is the UI − / + control, which sets `--ui-scale`. Size text with `fs(base)` → `calc(${base} * var(--ui-scale, 1))`, and lay panels out in `em` so they track it.

**Assets come from OSRS itself** — the local game cache, never a hot-linked wiki URL or any external host. Never distort a sprite (a global `object-fit: contain` guards this). In the UI, always show a thing's own current, live icon (a tower's actual tier sprite, a wizard's actual spell icon), never a generic stand-in.

**The tutorial mirrors the UI.** `LEARN_STEPS` (contextual tips, one at a time, anchored to a `data-tut` target) and `TLDR` (the How-to-Play cheat sheet) both live in `GameRoot.tsx` and must describe the same real interface at different depth. Change one, change the other. Existing anchors: `map`, `hud`, `sidebar`, `controls`, `dock`, `startwave`, `prayers`, `waveevent`, `slayer`, `essence`, `help`. There is no `ge` anchor (the Grand Exchange menu was removed) and no debug stone (the console opens on `Ctrl+'`).

## OSRS chrome

Hand-rolled CSS in `app/globals.css` — CSS variables (`--osrs-brown`, `--osrs-orange`, `--rs-keyline`, `--rs-raised`, `--rs-sunken`) and utility classes. Tailwind v4 is available for layout; use the `rs-*` classes for anything that should look like the game.

`.rs-panel` (wood + chiselled bevel) · `.rs-panel-title` · `.rs-btn` / `.rs-btn-primary` · `.rs-slot` (inventory-style square) · `.rs-tab` / `.rs-tab-on` / `.rs-tab-badge` (the bar's interface stones) · `.rs-check` · `.rs-num` (small number field) · `.rs-volume` · `.rs-progress` / `.rs-progress-fill` · `.rs-bar-sep` (near-invisible group divider) · `.rs-infobox` (RuneLite-style timer).

Follow OSRS interface conventions; where OSRS has no answer, follow RuneLite. In-game strings stay in **English** regardless of the conversation's language.

## MovablePanel

`components/game/MovablePanel.tsx` makes an absolutely-positioned panel draggable, with a 📌 pin, right-click-to-reset, and a per-panel offset persisted under `ui_pos_<id>`.

**Standing rule: every floating panel that overlays the board is a `MovablePanel`** — the only non-movable interface is the fixed bottom bar and its four stones' panels (build / dps / slayer / rune essence, which have their own open/close-by-clicking-the-stone behaviour). Anything else that floats over the map (tower panel, multiselect batch panel, wave strip, prayer bar, collection log, the shift-drag build-confirm panel) must be wrapped so a player can move it off whatever it's covering. When you add a new floating panel, wrap it — don't leave it pinned.

- MovablePanel's own right-click resets the panel's position (it `stopPropagation`s). If the panel previously relied on right-click bubbling to the board (e.g. the build-confirm panel's "right-click cancels"), that no longer fires *over the panel* — update the panel's hint so the cancel gesture points at the map, where right-click still reaches the board's `onContextMenu`.
- Wrap it in an outer element that carries the anchor position (`absolute bottom-4 left-1/2 -translate-x-1/2`), so the panel's own `transform` only carries the drag offset.
- Give the panel `relative` in its `className`, or the pin escapes to the nearest positioned ancestor.
- Drags never start from `button, input, select, a, [data-no-drag]`. Add `data-no-drag` to anything else that must stay clickable.
- A draggable panel necessarily captures pointer events — it cannot also be click-through.

## A disabled tower always looks the same

Anything that knocks a tower offline sets `Tower.disabledTimer` and gets the one standard look: the tower drawn at **40% opacity** with the **OSRS prohibited sign** (`assets/ui/blocked.png`, cache sprite 940) throbbing over it. It lives in exactly one place — `drawTowers` in `core/renderer.ts` — with a hand-drawn `--osrs-red` circle-slash fallback if the sprite fails to load. **Never give a new disable source its own indicator.**

Two earlier disable mechanics (Vorkath's freeze, the Hydra's chain lightning) fired correctly but drew nothing, so they read as bugs and were both cut: a disable needs a visible *cause* and a visible *state*, or it doesn't belong in the game. The other half of the standard is **never refresh an already-disabled tower** — skip it — so overlapping sources (a volatile pack, a boss charging twice) can't chain one tower off the board.

## Smaller traps

- **Keyboard handlers must ignore events from inputs.** Check `target.tagName === 'INPUT' | 'TEXTAREA'` and `isContentEditable` first, or typing in a number field sends a wave (Space) and changes speed (1/2/5). Use `e.code` (`'Quote'`) for chords — `e.key` is keyboard-layout dependent.
- **`overflow-y-auto` clips `position: absolute` descendants.** Anchor tooltips to a non-scrolling `relative` ancestor.
- Game speed and pause apply to `dt` only (`rawDt * gameSpeed`, zero when paused); real-world timers use `rawDt`. `TICK = 0.6` (`data/tower-stats.ts`) is the OSRS game tick and drives every cooldown.
- Meta-progression persists (`osrs_td_essence`, `osrs_td_upgrades`, `osrs_td_killcounts`, `osrs_td_cardcounts`, `osrs_td_bosses_seen`). The **run in progress** persists too, under `osrs_td_run`: `GameRoot` autosaves `engine.snapshotRun()` every 2s and on `pagehide`, and the start screen offers it back as **Continue**. It is a *between-waves checkpoint* — `snapshotRun()` returns null mid-wave and on game over, so enemies/projectiles are never serialized and quitting mid-fight resumes at that wave's start. The format is versioned and validated in `systems/run-save.ts` (`RUN_SAVE_VERSION`, `sanitizeRunSave`); bump the version when a field's meaning changes.

## Verify it

The engine and `GameRoot.tsx` have **no unit tests**. A green typecheck proves nothing about layout, pointer mapping or wave flow — drive the game. See the `game-verify` skill.

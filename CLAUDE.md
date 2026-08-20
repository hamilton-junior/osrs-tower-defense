# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Next.js dev server.
- `npm run build` — **static export** to `out/` (`output: 'export'`, deployable to GitHub Pages). Set `NEXT_PUBLIC_BASE_PATH=/<repo>` for a project Pages subpath.
- `npm run lint` — ESLint, flat config in `eslint.config.mjs` (typescript-eslint + react-hooks, wired directly; `eslint-config-next` cannot load under ESLint 10). Lint errors are **ignored during `next build`** (`next.config.ts` → `eslint.ignoreDuringBuilds: true`), so treat it as advice — but **TypeScript errors fail the build** (`typescript.ignoreBuildErrors: false`). Treat type errors as build-breaking.
- `npm run start` — serve the production build.
- `npm run test` — run the Vitest unit suite once (`vitest run`); `npm run test:watch` for watch mode. Tests live next to their module as `*.test.ts` under `lib/` and cover the pure game-logic in `lib/game/systems/`. Add tests there when you extract or change logic — they are the regression net for the otherwise-untested engine.

Note: dependency installs need `--legacy-peer-deps`. The conflict is `next@15.0.0`, which peer-requires React 18.2 or a 19 release candidate, against the React 19.2 the app runs on; upgrading Next would settle it. `package-lock.json` is gitignored, so CI resolves fresh on every deploy.

The `@google/genai` dependency and eleven other unused packages (lucide-react, clsx, tailwind-merge, firebase-tools…) were leftover AI Studio scaffolding and are gone; `three` stays, but as a devDependency — only the sprite-baking script uses it.

## Architecture

A single-page, client-rendered OSRS-themed tower defense game on the Next.js App Router (`app/`). The whole game runs in the browser: no backend, no server-side game logic. `app/page.tsx` dynamically imports one component, `GameRoot`, with `ssr: false`.

The game was rebuilt clean from a tested foundation; the old god-class engine and its `game-ui/` component tree were deleted once nothing rendered them (`git log -- lib/game/engine.ts` if you ever need the old subsystem logic as reference). The OSRS subsystems still missing from the new core (Farming, Herblore, gathering nodes, quests, pets) will be reintroduced MVP-first, as **new** content rather than ports.

### The engine / React split (most important concept)

Game state and logic live in **one imperative class**. React never touches game entities.

- **[`lib/game/core/engine.ts`](lib/game/core/engine.ts)** — `GameEngine`: state, its own `requestAnimationFrame` loop, and every method the interface calls. It mutates plain arrays (`enemies`, `towers`, `projectiles`, `hitsplats`, …). Its vocabulary — `UIState`, the per-run effect records, the board constants — lives beside it in [`core/engine-state.ts`](lib/game/core/engine-state.ts) and is re-exported, so `@/lib/game/core/engine` stays the one address to import from. The simulation itself is under [`core/sim/`](lib/game/core/sim/): `combat` (targeting → firing → hit → on-hit → kill), `waves` (roster, spawning, movement, DoT, wave end) and `bosses` (one state machine per boss). Those are free functions taking the engine as `eng`; nothing outside `engine.ts` calls them, so the UI's vocabulary is unchanged.
- **[`lib/game/core/renderer.ts`](lib/game/core/renderer.ts)** — `GameRenderer` owns every Canvas 2D draw call. It holds a back-reference to the engine (`e`) and keeps **no game state of its own**. The class itself is only the frame's running order plus a few caches; each layer lives in its own module under [`core/render/`](lib/game/core/render/) (`terrain`, `build-overlay`, `towers`, `enemies`, `effects`, `hud`, `shared`) as a free function taking the renderer as its first argument (`gr`). Rendering changes go there, never in the engine.
- **[`components/game/GameRoot.tsx`](components/game/GameRoot.tsx)** — the React bridge and the whole OSRS interface.

The boundary works like this:

- To push data up, the engine calls `this.onState(patch)`, typed `Partial<UIState>` (`UIState` is defined in `core/engine-state.ts` and re-exported from `core/engine.ts`). **A new emitted key must be added to `UIState` first**, or the build fails on the excess-property check. The patch crosses `structuredClone`d — no class instances, no functions.
- Emits are coalesced: `emit()` marks state dirty and `flush()` diffs `snapshot()` through `changedState` ([`systems/ui-diff.ts`](lib/game/systems/ui-diff.ts)), so only real changes reach React. `GameRoot` merges with `setUi((prev) => ({ ...prev, ...patch }))`.
- UI → engine is **method calls on `engineRef.current`** (`startWave`, `placeTower`, `upgradeTower`, `setAutoplay`, `equipGear`, …), which mutate state and usually `emit()` afterwards. A few fields are read live off `engineRef.current` (e.g. `towers`) rather than through `UIState`.

A feature normally touches three places: a method on `GameEngine`, a key in `UIState` + the emit, and JSX in `GameRoot.tsx`.

### Subsystems

Two kinds live outside the engine, both under [`lib/game/systems/`](lib/game/systems/):

- **Pure, unit-tested modules** the engine calls into — the safest place to add logic and the only part under test. Examples: `geometry`, `leveling`, `enemy-scaling`, `targeting`, `tower-combat` (`calculateTowerStats`, the per-frame damage/range/cooldown pipeline), `tower-gear`, `tower-xp`, `tower-identity`, `wave-generation` (`buildWaveConfigs`), `wave-events`, `wave-preview`, `affixes`, `boss-mechanics`, `combat-achievements`, `roguelite-draft`, `run-modifiers`, `relics`, `difficulty`, `map-generation`, `terrain-generation`, `economy`, `rewards`, `leak-cost`, `unlock-queue`, `ui-diff`, `run-save`.
- **Stateful `*-System` classes** that own their state and hold an engine back-reference (`this.e`) for shared state and UI updates: `slayer-system`, `prayer-system`, `ge-system`, `meta-system`. This is the template for extracting anything stateful out of the engine.

When you pull logic out of the engine, prefer a pure function with a matching `*.test.ts`.

### Coordinate system & timing

- The board is a **fixed** logical space, `LOGIC_WIDTH=1440 × LOGIC_HEIGHT=640` (45×20 tiles, 2.25:1) — the same board for every player. The game never derives from screen size; only the presentation does. See the `game-ui` skill for the full rule and its three easy-to-break consequences (`paintedBox()` for every screen↔logic conversion, the fixed bottom-bar height, blocked browser zoom).
- Game speed and pause apply to `dt` only (`rawDt * gameSpeed`, zero when paused); real-world timers use `rawDt`. `TICK = 0.6` is the OSRS game tick and drives every cooldown.

### Data-driven content

Static content lives under [`lib/game/data/`](lib/game/data/): `enemies.ts`, `towers.ts` (tier progressions per tower type), `waves.ts` (`LANDMARK_WAVES`), `gear.ts` (Classic ammo/jewellery ladders), `prayers.ts`, `slayer.ts`, `ge.ts` (`GE_OFFERS`), `combat-achievements.ts`, `biomes.ts`, plus the baked animation tables (`enemy-anims*`, `spotanims*`). Prefer a new table here over inlining content in the engine. To add an enemy/tower/item, extend the relevant data file **and** the matching union type in [`lib/game/types.ts`](lib/game/types.ts) (`EnemyType`, `TowerType`, …), plus its icon in [`lib/game/assets.ts`](lib/game/assets.ts). See the `game-content` skill for the full checklist and the asset-baking pipeline.

[`lib/game/types.ts`](lib/game/types.ts) is the shared contract for engine entities (`Enemy`, `Tower`, `Projectile`, `Item`, `GlobalUpgrades`, …).

### Persistence

`localStorage`, all keys listed in `SAVE_KEYS` in `GameRoot.tsx`: meta-progression (`osrs_td_essence`, `osrs_td_upgrades`, `osrs_td_killcounts`, `osrs_td_cardcounts`, `osrs_td_bosses_seen`, `osrs_td_victories`, `osrs_td_difficulty`, `osrs_td_achievements`) **and the run in progress** (`osrs_td_run`). `GameRoot` autosaves `engine.snapshotRun()` every 2s and on `pagehide`; the start screen offers it back as **Continue**. It is a between-waves checkpoint — `snapshotRun()` returns null mid-wave and on game over. The format is versioned and validated in [`systems/run-save.ts`](lib/game/systems/run-save.ts) (`RUN_SAVE_VERSION`, `sanitizeRunSave`); bump the version when a field's meaning changes.

### Assets

Every sprite and sound comes from **OSRS itself**, baked out of the local game cache by the scripts in `scripts/` into `public/assets/` — never hot-linked from the wiki or any other external host. `lib/game/assets.ts` maps names to those local files; `assets.test.ts` fails the build if a data table names an icon with no bake behind it.

### Styling

OSRS look-and-feel is hand-rolled CSS in [`app/globals.css`](app/globals.css): CSS variables (`--osrs-brown`, `--osrs-orange`, `--rs-keyline`, …) and the `rs-*` utility classes (`.rs-panel`, `.rs-btn`, `.rs-slot`, `.rs-tab`, …). Tailwind v4 (via `@tailwindcss/postcss`) is available for layout. The OSRS pixel fonts are self-hosted in `app/fonts/` (RuneStar recreations, CC0), registered as `@font-face` with relative `url()`s so the build bundles them basePath-safely. No Google fonts.

## Skills

Project skills in `.claude/skills/` carry the detailed rules and are the first thing to read for their area: **game-ui** (the interface and the engine↔React boundary), **game-content** (new enemies/towers/items and the asset pipeline), **game-verify** (the tsc + vitest + build gate and driving the exported game headlessly), **changelog-convention** (the commit subject *is* the in-game changelog entry).

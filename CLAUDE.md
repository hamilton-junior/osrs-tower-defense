# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Next.js dev server.
- `npm run build` — production build (`output: 'standalone'`).
- `npm run lint` — ESLint (`eslint-config-next`). Note: lint errors are **ignored during `next build`** (`next.config.ts` → `eslint.ignoreDuringBuilds: true`), but **TypeScript errors fail the build** (`typescript.ignoreBuildErrors: false`). Treat type errors as build-breaking.
- `npm run start` — serve the production build.
- `npm run test` — run the Vitest unit suite once (`vitest run`); `npm run test:watch` for watch mode. Tests live next to their module as `*.test.ts` under `lib/` and cover the pure game-logic in `lib/game/systems/`. Add tests there when you extract or change logic — they are the regression net for the otherwise-untested engine.

Note: dependency installs need `--legacy-peer-deps` (pre-existing eslint version conflict with `eslint-config-next`).

The `README.md` and the `@google/genai` dependency / `GEMINI_API_KEY` are leftover AI Studio scaffolding — no Gemini code exists in the app. Ignore them unless you are deliberately adding AI features.

## Architecture

This is a single-page, client-rendered OSRS-themed tower defense game built on Next.js App Router (`app/`). The entire game runs in the browser; there is no backend and no server-side game logic.

### The engine / React split (most important concept)

Game state and logic live in **one imperative class**, [`GameEngine`](lib/game/engine.ts) (~3400 lines and shrinking — see "Decomposition" below). React never touches game entities directly. The boundary works like this:

- [`components/GameCanvas.tsx`](components/GameCanvas.tsx) is the bridge. It instantiates `GameEngine`, passing a `<canvas>` element and an `onStateChange` callback. It owns all React state (`gameState`), pointer/keyboard handlers, and renders every UI component in [`components/game-ui/`](components/game-ui/).
- `GameEngine` runs its own `requestAnimationFrame` loop ([`loop()`](lib/game/engine.ts) → `update(dt, now, rawDt)` → `draw()`). It mutates plain in-memory arrays (`enemies`, `towers`, `projectiles`, `loots`, etc.).
- To push data to the UI, the engine calls `this.onStateChange(patch)`, typed as [`EngineStatePatch`](lib/game/types.ts) — a flat partial of every key the engine may emit. **Add the key to `EngineStatePatch` when you emit a new one**, or TypeScript's excess-property check fails the build. `GameCanvas` merges the patch into `gameState` via `setGameState(prev => ({...prev, ...safe}))`. State crosses the boundary `structuredClone`'d, so anything passed must be cloneable (no class instances, no functions). The UI's `GameState` is a looser view of the same data; the two shapes are reconciled with a single cast at the callback in `GameCanvas`.
- UI → engine communication is **method calls on `engineRef.current`** (e.g. `placeTower`, `upgradeTower`, `togglePrayer`, `castSpell`, `startWave`). These mutate engine state and usually emit a follow-up `onStateChange`.
- The engine also exposes some fields read directly off `engineRef.current` (e.g. `slayerPoints`, `unlockedTowers`, `consecutiveTasks`) rather than through `onStateChange`.

When adding a feature you almost always touch three layers: a method on `GameEngine`, an `onStateChange` payload (and `EngineStatePatch` / the `GameState` interface in `GameCanvas.tsx`), and the relevant `game-ui/` component.

### Decomposition: systems, renderer, and the god-class

The engine is being incrementally broken up. Three layers already live outside it:

- **[`lib/game/renderer.ts`](lib/game/renderer.ts)** — `GameRenderer` owns every Canvas 2D draw call for a frame. It holds a back-reference to the engine (`this.e`) and reads game state through it but keeps **no state of its own**; `engine.draw()` just delegates to `renderer.draw()`. Put rendering changes here, not in the engine.
- **Stateful subsystem classes** (composition) — cohesive subsystems that *own* their state and hold an engine back-reference (`this.e`) for shared state/UI updates. [`FarmingSystem`](lib/game/systems/farming-system.ts) is the first: it owns `patches` and the plant→grow→harvest lifecycle; the engine keeps a `farming: FarmingSystem` plus a `get farmingPatches()` and thin delegators (`plantSeed`/`harvestPatch`/…) so existing UI calls and `getState()` are unchanged. This is the template for extracting the remaining stateful subsystems (Slayer, Magic, boss mechanics).
- **[`lib/game/systems/`](lib/game/systems/)** — small, **pure, unit-tested** modules the engine calls into: `geometry` (`distance`/`distanceSq`/`pointToSegmentDistance`/`isValidPlacement`), `leveling` (XP curves + `applyXpGain`), `enemy-scaling` (per-wave stat scaling), `economy` (GE price drift), `targeting` (`selectTarget` priority logic), `wave-generation` (`buildWaveConfigs` — the procedural wave budget allocator), `slayer` (`rollSlayerTask`), `tower-combat` (`calculateTowerStats` — the per-frame damage/range/cooldown multiplier pipeline), `prayer` (`prayerDrainRate`), `farming` (`diseaseChance`/`baseFarmYield`), `loot` (`rollItemDrops` — enemy drop rolls). These have no `this`/DOM dependencies, so they are the safest place to add logic and the only part currently under test. When you pull logic out of the god-class, prefer a pure function here with a matching `*.test.ts`.

The engine still holds most remaining subsystems (combat, slayer, prayer, herblore, magic, economy bookkeeping, boss mechanics, waves). Continue the pattern: extract **pure** logic to `systems/` as unit-tested functions; extract **stateful** subsystems to a `*-System` class on the `FarmingSystem` template; keep the engine as the orchestrator/state-holder.

### Coordinate system & timing

- The engine works in a fixed logical space `LOGIC_WIDTH=1920 × LOGIC_HEIGHT=1080` and scales to the real canvas in `resize()` / `draw()`. Convert pointer coordinates accordingly — do not assume canvas pixels equal logic units.
- Game speed and pause are applied to `dt` only (`rawDt * gameSpeed`, zero when paused); real-world timers use `rawDt`. `TICK = 0.6` ([`tower-stats.ts`](lib/game/data/tower-stats.ts)) is the OSRS game tick (0.6s) and drives cooldowns/attack rates throughout.

### Data-driven content

Static game content is separated from logic under [`lib/game/data/`](lib/game/data/): `enemies.ts`, `towers.ts`, `tower-stats.ts` (tier progressions for archer/wizard/ancient/utility), `waves.ts` (`LANDMARK_WAVES`), `items.ts` (`ITEMS`, `ITEM_PROGRESSIONS`), `recipes.ts`, `prayers.ts`, `quests.ts`, `achievements.ts`, `shop.ts` (`GE_CONSUMABLES`), `nodes.ts`, `drops.ts` (monster loot tables), `herblore.ts` (`HERBLORE_RECIPES`), `spells.ts` (`MAGIC_SPELLS`), `construction.ts` (`POH_UPGRADES`). The engine imports these and `structuredClone`s mutable ones (quests/achievements) on construction. Prefer adding new content tables here over inlining them in `engine.ts`. To add a new enemy/tower/item, extend the relevant data file **and** the corresponding union type in [`lib/game/types.ts`](lib/game/types.ts) (e.g. `EnemyType`, `TowerType`), plus the asset URL in [`lib/game/assets.ts`](lib/game/assets.ts).

[`lib/game/types.ts`](lib/game/types.ts) is the shared contract for engine entities (`Enemy`, `Tower`, `Projectile`, `Item`, `PlayerSkills`, `GlobalUpgrades`, etc.). `GameCanvas.tsx` redeclares its own looser UI-facing interfaces (`GameState`, `TowerData`) for the cloned data it receives.

### Persistence

Only meta-progression persists, via `localStorage` keys written in `GameCanvas.tsx`: `osrs_td_essence`, `osrs_td_upgrades`, `osrs_td_player_skills`, `osrs_td_wave`. Rune essence + `GlobalUpgrades` are passed into the `GameEngine` constructor to seed a run. Per-run state (towers, enemies, money, lives) is **not** saved.

### Assets

Sprites are hot-linked from `oldschool.runescape.wiki` (and `picsum.photos`); both hosts are whitelisted in `next.config.ts` `images.remotePatterns`. The engine preloads images/sounds (`preloadImages`, `preloadSounds`) and guards against broken loads with `isImageValid`.

### Styling

OSRS look-and-feel is hand-rolled CSS in [`app/globals.css`](app/globals.css): CSS variables (`--osrs-brown`, `--osrs-orange`, …) and utility classes (`.osrs-button`, `.osrs-window`, `.font-osrs`) used across all UI. Tailwind v4 (via `@tailwindcss/postcss`) is also available. The RuneScape pixel font is loaded as `@font-face` with the `VT323` Google font as fallback (`--font-osrs`, wired in `app/layout.tsx`).

### Game systems implemented in the engine

Beyond core tower defense, `GameEngine` contains interlocking OSRS-flavored subsystems, mostly as methods named after the system: Slayer (tasks, masters, points, blocking/skipping), Prayer (points/drain/protection prayers), special attacks, potions, Farming (patches/seeds/compost/disease), Herblore (`makePotion`), gathering nodes (mining/woodcutting), Magic spellbooks (elemental / ancients / utility tiers), quests, achievements, the Grand Exchange economy (`updateEconomy`, price multipliers), pets, and boss mechanics (`handleBossMechanics`, e.g. Jad/Zulrah/Vorkath). When modifying any of these, search `engine.ts` for the method named after the system.

## Refactor roadmap

An incremental restructuring of the engine is in progress. Done so far: a Vitest safety net + pure `systems/` modules (incl. `wave-generation`), the `GameRenderer` split, a typed `onStateChange` boundary, and the inline content tables (drops, potion/spell recipes, POH upgrades) moved out to `lib/game/data/`. Planned next, in rough priority order:

1. **Continue extracting subsystems** out of `GameEngine` into `lib/game/systems/` (Slayer, Prayer, Farming, Herblore, Magic, boss mechanics), each as a testable unit the engine orchestrates. `damageEnemy` (loot rolls, slayer/quest hooks) and `update` (entity stepping, spawning) are the largest remaining methods.
2. **Unify state types** — `GameState` in `GameCanvas.tsx` now uses the engine's real entity types (dead `EnemyData`/`nextLevelXp` removed). The remaining gap: `GameState` is a strict subset of `EngineStatePatch`, so a single boundary cast survives in the `onStateChange` handler. Fully fold `GameState` into `types.ts` (or have the engine emit only UI-facing keys) to drop it.
3. **OSRS model rendering (stretch)** — replace the hot-linked wiki PNGs with actual in-game models rendered by NPC ID. This is a large, self-contained effort (sourcing model/animation data, a model→canvas renderer); isolate it behind `GameRenderer` so game logic is untouched.

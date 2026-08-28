---
name: game-content
description: Add or change content in the OSRS tower-defense game — an enemy, boss, tower, spell, prayer, item, drop table, relic or draft card — and the OSRS asset pipeline that bakes its sprites and sounds from the local game cache. Use when adding new game content, when a union type in lib/game/types.ts needs a new member, when a sprite or sound is missing, or when a wiki-hot-linked asset should be replaced with a real one.
---

# Adding content

Static content is data, not code. It lives in `lib/game/data/` (`enemies.ts`, `towers.ts`, `waves.ts`, `gear.ts`, `prayers.ts`, `slayer.ts`, `ge.ts`, `combat-achievements.ts`, `biomes.ts`, plus the baked `enemy-anims*`/`spotanims*` tables). Extend a table there rather than inlining anything in the engine.

Every new content id must also join its **union type in `lib/game/types.ts`** (`EnemyType`, `TowerType`, `Element`, `AncientType`, `MageMode`, `PrayerType`, …). TypeScript errors fail the build, so a missing union member surfaces immediately — but the union is what makes the exhaustive `Record<>` tables complain, so add it *first* and let the errors list every place that needs a value.

## Checklists

**New enemy or boss**
1. `data/enemies.ts` — the stat block (`hp`, `speed`, `reward`, `color`, `isBoss`…).
2. `EnemyType` in `types.ts`.
3. `data/drops.ts` — its loot table (keyed by `EnemyType`).
4. Sprites: an entry in `scripts/enemy-anims.config.json` (`npc` id + `anims` ids for walk/hurt/death), then bake (below). Death sound: the engine plays `death_<type>`; wire it in `core/sound.ts`.
5. Wave presence: the procedural allocator (`systems/wave-generation.ts`) or `data/waves.ts` (`LANDMARK_WAVES`) for a scripted appearance.
6. Boss only: a mechanic in `systems/boss-mechanics.ts` — bosses are expected to have one.

**New tower**
1. `data/towers.ts` (the tier progression).
2. `TowerType` in `types.ts`.
3. `systems/tower-identity.ts` — **its niche.** Every tower must beat the wizard at something specific; the wizard already owns single-target *and* AoE. A tower with no signature is not finished.
4. `lib/game/assets.ts` — its per-tier sprite.
5. `GameRoot.tsx` — `TOWER_ORDER`, `TOWER_COMBAT`, and the dock grid (currently `grid-cols-6 w-[17.5em]`; a seventh tower means re-laying it out without changing the bar's height — see the `game-ui` skill).
6. A `*.test.ts` next to any pure logic you added in `systems/`.

**New spell** — `systems/magic.ts` (its hit/effect maths, with a test), plus the spell icon in `assets.ts` and its cast/impact sounds.

## Assets come from OSRS itself

**Hard rule: every asset is extracted or rendered from a local OSRS game cache. Never hot-link an external host, never invent a placeholder.** If an asset can't be sourced, ask rather than substituting. `assets.ts` resolves every name to a local bake and `assets.test.ts` fails the build if a data table names an icon with none.

A cache is any folder holding `main_file_cache.dat2` + `main_file_cache.idx*` — an installed RuneLite/Jagex client already has one. This machine has the cache and the deps: these scripts **run here**.

| What | Command |
|---|---|
| 2D interface sprites (prayer/skill icons, spellbooks, hitsplats) | `npm run extract:sprites` |
| Sound effects | `npm run extract:sounds` |
| Static NPC model portrait | `npm run render:npcs` |
| Item inventory icons | `node scripts/render-osrs-items.mjs` |
| Enemy animation clips (the real pipeline) | `npm run export:enemy-gltf` → `npm run bake:enemies` → `npm run anims:data` |

The enemy pipeline exports each NPC as an animated glTF, bakes walk/hurt/death sprite sheets from it with three.js (a real z-buffer, not the old hand-rolled rasteriser), then regenerates `data/enemy-anims.data.ts` from the manifests. Use `--only <slug>` to rebake one enemy.

**Choosing *which* sequence id is a clip is its own job — hand it to the `npc-anim-auditor` subagent.** Picking a hurt/death by reading the cache is a trap (an NPC's id block mixes its attacks, blocks and other rigs' anims; metrics can't tell an attack from a block), it still ends in looking at images, and the agent already carries the method. Its first move is `npm run anims:triage <slug>` (after a one-off `npm run anims:index`), which scopes the candidates *structurally* — every sequence posing the NPC's framemap, and nothing else can be his — names the neighbours who own the foreign ids, scores each candidate death/block/attack and emits one ranked contact sheet. Its second anchor is `npm run anims:observed` — a cross-reference of the config against `scripts/data/openosrs-observed-anims.json` (the vendored OpenOSRS record of which sequences each NPC is actually *seen* playing in game), which flags configured ids the NPC never plays and lists the real candidates. Use the agent whenever an animation "looks wrong" or a new enemy needs clips.

Spot-anims (GFX) are baked by `scripts/render-osrs-spotanims.mjs`, but the flat rasteriser only handles **geometry** spotanims — textured ones come out as white boxes, so those stay procedural. Check the output PNG before persisting it. Same for tower/weapon renders: they must face **side-on** (ideally right); sweep the yaw and look at the PNG before committing.

## Design direction

- Give systems personality. Prefer building **new** quests, achievements and pets over reviving the ones the old engine had.
- Make them challenging, and reward them with something other than money — **do not inflate gold**.
- The intended "main" mode is a roguelite with per-wave drafting (towers/upgrades/prayers/buffs/debuffs), alongside a pure tower-defense mode.

## Verify it

New content is mostly data, so the typecheck catches structural mistakes and `npx vitest run` catches maths. Neither can tell you a sprite is facing the wrong way or an enemy never spawns — look at the baked PNG, and drive the game (see the `game-verify` skill). Balance is the user's job; don't propose a playtest plan.

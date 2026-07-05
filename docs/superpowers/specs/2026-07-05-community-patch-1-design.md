# Community Patch #1 — UX fixes + balance hotfix — design

Date: 2026-07-05

First slice of a five-part decomposition of a large player-feedback batch:

- **P1+P2 (this spec):** the seven UX/audio fixes + the balance hotfix — what
  players are feeling *right now*.
- **P3 (later spec):** tower-roster rework — wizard split into 3 towers
  (Elemental / Ancients / Utility), fast/heavy melee + fast/heavy ranged splits,
  Chinchompa AoE pulse tower, capped %HP framework for more towers, flat
  damage-per-hit utility effect. **Deferred decision parked here:** whether the
  Blood life-steal effect moves to another tower (Scythe of Vitur, ToB/blood
  theme, is the natural candidate).
- **P4 (later spec):** threat depth — flat-armour creatures, protection-prayer
  affix for bosses/elites, multi-boss late-game cadence, 7 new bosses (KBD,
  Graardor, Corp, Nex, Zuk, Verzik, Olm), expanded Slayer rewards.
- **P5 (later spec):** map selection at run start (choose or random; winding =
  easier, straight = harder).

Everything below is in scope for one implementation plan; everything above
P3–P5 is explicitly **out of scope** here.

## 1. Docked, collapsible sidebar (the structural fix)

**Player complaint:** the main menu floats *over* the canvas bottom-right —
exactly where the track's end usually sits — hiding the part of the map that
matters most.

**Decision (user-approved):** real dock + collapse, not a smarter overlay.

- The page root becomes a `flex` row: **game area** (`flex-1`; the canvas keeps
  auto-fitting via `engine.resize()`, which already letterboxes the 1920×1080
  logic space into whatever element size it gets) + a **fixed right `<aside>`**
  (~`clamp(300px, 22vw, 400px)`).
- The current bottom-right `MovablePanel` (tab stones Home/Essence/Slayer/DPS +
  Start Wave slot + tower dock) moves **inside the aside**: no longer movable,
  no longer `absolute`, fills the aside's height. The tab body is already
  `flex-1 min-h-0 overflow-y-auto`, so long content scrolls in place.
- **Collapse:** a ◀/▶ handle on the aside's edge collapses it to a thin rail
  (~3em) showing only the tab stones stacked vertically; clicking a stone
  re-expands into that tab. Collapsed state persists in `localStorage`.
  This **replaces** the current `sideBodyMin` behaviour (clicking the active
  stone to minimise the body) — one collapse concept instead of two.
  Building while collapsed still works via the on-map tile picker.
- The other floating panels (tower-info left panel, controls bar, prayer bar,
  top-right orbs) **stay floating** — they are small and peripheral; the
  complaint is the big menu. On narrow screens (<~900px) the aside starts
  collapsed.
- `data-tut` anchors that live in the moved panel keep working (same DOM, new
  container); the guided-tips positioning must be re-verified.

## 2. Top HUD: wave progress + always-visible next-wave preview

Top-centre stack, top to bottom: **boss HP bar** (existing, stays topmost) →
**wave strip** (new position) → **event chip + potion infoboxes** (existing
top-centre cluster).

- **During a wave** the strip shows what the Home tab shows today: `⚔ Wave N ·
  X left` + the `rs-progress` bar (boss tint on boss waves). The in-tab copy of
  the progress bar is removed; the in-tab `WaveEventBanner` stays.
- **Between waves** the same strip becomes the next-wave preview: `Next: Wave N
  · Y incoming` + a row of enemy icons (baked sprite + ×count; boss entries
  flagged `⚠ Name`) — the exact deterministic composition (`wavePreview` in
  `UIState`), i.e. the content of today's Start-Wave hover tooltip, now always
  visible. The hover tooltip on the Start Wave button is removed as redundant.
- **Boons/Hazards tooltip fix:** the top `WaveEventChip` and the potion
  infoboxes replace their native `title` with a styled `rs-panel` hover tooltip
  (same pattern as the tower-dock tooltips): event name + Boon/Hazard tag +
  full description — the content the side banner already shows.
- The wave strip is hidden on game over and before the run starts (the
  StartScreen gates wave 1).

## 3. Smaller relocations

- **Slayer block** (master, task name, kill count, progress bar, points,
  helmet badge) moves from the Home tab to the **top of the Slayer tab**, above
  the rewards list. Home keeps wave/mode/relics only.
- **Auto-start next wave** moves out of the DebugPanel: a compact checkbox
  under the Start Wave button ("Auto-start next wave", visible between waves).
  Behaviour unchanged (still waits on a pending draft). Persisted in
  `localStorage`. Removed from DebugPanel.
- **Tutorial mirror rule:** LEARN_STEPS tips and the TL;DR How-to that
  reference moved elements (wave bar, slayer task, start-wave area) are updated
  in the same change.

## 4. Combat-SFX fade-out on wave end

**Diagnosis:** there is no queue — it's the *tail* of many overlapping clips.
A wave-clearing burst starts dozens of 1–3s death/impact clips (the
`SoundManager` throttle is per-key; different enemy types all fire their own
death clip), which keep ringing after the wave completes.

**Fix, in `lib/game/core/sound.ts`:**

- Every sound key gets a **category** at registration: `combat` (`fire_*`,
  `cast_*`, `hit_*`, `death_*`, plus `hit`, `death`, `base_hit`,
  `magic_splash`) vs `ui` (clicks, interface open/close, prayers, GE, `wave`
  jingle, `game_over`, everything else).
- New `fadeCombat(secs ≈ 0.6)`: walks the active pooled nodes of combat keys,
  ramps their volume to 0 over `secs`, then pauses them and restores node
  volume for future plays.
- While the wave is **inactive**, `play()` of combat-category keys is
  suppressed (straggler projectiles landing after the clear stay silent);
  suppression lifts on `startWave()`.
- The engine calls `fadeCombat()` at wave completion **and on game over** (the
  `game_over` jingle is `ui`-category, so it plays through the fade). The final
  kill's death sound starts, then fades — the requested behaviour.

## 5. Balance hotfix

Numbers below are the spec's proposal; the user tunes via playtest.

### 5.1 Blood Barrage nerf + life-steal indicator

Today (`lib/game/systems/magic.ts`): bonus = `(3 + 0.5·L)%` of target max HP
per hit (3.5%→5%, nearly flat per level, uncapped) + life-steal chance
`(1+L)%` per cast.

- Bonus frac → **`(0.75·L)%`** (0.75 / 1.5 / 2.25 / 3%): much weaker at L1,
  4× scaling L1→L4 (today 1.4×) — "scale more heavily with tower level".
- **Flat cap per hit: `30·L`** damage from the %HP bonus — vs giant-HP bosses
  the bonus stops scaling (seeds the capped-%HP philosophy P3 extends to other
  towers).
- **Life-steal stays** (mechanics untouched this patch; re-homing is a P3
  decision) but gains a **visual indicator**: red pulse FX on the casting tower
  (existing `engine.fx → renderer.drawFx` pipeline) + a floating `❤ +1`
  drifting toward the lives orb, which blips.

### 5.2 TzHaar buff + knockback audit

- **Stun from L1:** the `pushback` tiers (L1/L2) gain a short on-hit stun —
  0.3s / 0.45s — scaling into the existing `crush` (L3/L4) stun values.
- **Knockback audit:** a unit test proving the level-scaled knockback
  displacement is actually applied to enemy path progress; add a shove FX
  (dust/trail) for legibility. Suspicion: it works but *reads* poorly because
  the enemy resumes walking instantly — the L1 stun fixes the perception
  (shove + pause = visible setback). If it proves weak in the test, bump
  tiles.
- **L1 cost 150 → 125** (ships in this patch; the user reverts via playtest if
  it overshoots). Deep melee rebalance belongs to P3 — don't tune twice.

### 5.3 Regen affix (in `lib/game/systems/affixes.ts`)

- **Gate:** `regenerating` only enters the affix pool from **wave 12**
  (affixes in general still unlock at wave 5).
- **Ramp:** regen/s becomes wave-scaled — **1%/s of max HP at wave 12 → 2%/s
  at wave 30+** (linear), replacing the flat 2%.

### 5.4 Affix stacking cap (user-approved decision)

- `extraAffixChance` returns 0 before **wave 30** → hard **max 1** affix.
- From wave 30 the ramp **re-anchors** (0 at wave 30 → `EXTRA_AFFIX_MAX` over
  the following 25 waves) — no 0%→50% cliff on the unlock wave, matching the
  module's existing "never blindsided on the wave a mechanic appears"
  principle — with a hard **cap of 2** total.
- **Banned pairs** (filtered from the pool after the first draw), both orders:
  `regenerating + warded`, `regenerating + shielded`. Applies to the normal
  roll *and* the boss pool (bosses keep their max-2 behaviour).

## 6. Testing & verification

- **Unit tests** (all in pure `lib/game/systems/`, the regression net):
  - affixes: regenerating gated pre-12; regen ramp values at waves 12/21/30+;
    max-1 pre-30; max-2 post-30; banned pairs never co-occur (both draw
    orders); boss rolls respect the bans.
  - magic: new blood bonus curve per level; flat cap engages on huge max-HP.
  - tzhaar: knockback displacement applied to path progress; stun duration per
    level.
- `npx tsc --noEmit` + `npx vitest run` + `npm run build` all green.
- UI/feel (sidebar, HUD, fade, FX) is verified by the user's playtest — their
  call per the established split.
- No save-shape migrations (new `localStorage` keys only: sidebar collapse,
  auto-start).

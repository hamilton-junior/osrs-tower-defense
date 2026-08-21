# Feedback ledger (NocoDB triage watermark)

Player feedback arrives in two NocoDB tables (base `pft2l1xhudqg51r`):
**Suggestions** `mdi2rpgxmct2kdo` · **Bug Reports** `mh9wuvpkvda79ml`.

**This file exists so nobody re-reads a resolved entry.** Every record ever triaged is
listed below with a verdict. To check for new feedback, query only what is past the
watermark — do **not** dump the whole table:

```
Suggestions:  where=(Id,gt,<last id below>)
Bug Reports:  where=(Id,gt,<last id below>)
```

An already-listed record only needs re-reading if its `UpdatedAt` moved *after* the
audit date, or its row here says `recheck`. Append a row when you triage something new
and bump the watermark. The `Status` column in NocoDB is **not** authoritative — it lags
behind what actually shipped; this file is the truth.

**Watermark (2026-07-31):** Suggestions ≤ **35**, Bug Reports ≤ **20**.

## Verdict vocabulary

`shipped` — in the game today · `wontfix` — deliberately rejected · `queued` — accepted,
not built · `recheck` — needs verification against current code before acting.

## Bug Reports

| # | Title | Verdict |
|---|---|---|
| 1 | Resizing browser changes field size, stacks towers | shipped — fixed board 1728×768 |
| 2 | Expanding/shrinking map increases buildable tiles | shipped — same fix |
| 3 | Tile changes with different screen sizes | shipped — same fix |
| 4 | Resizing displaces towers | shipped — same fix |
| 5 | Alchemical Hydra impossible to kill | shipped |
| 6 | Unable to break hydra vent | shipped |
| 7 | Hydra too hard in classic mode | shipped |
| 8 | Typo "loose" → "lose" (dragon knife card) | shipped |
| 9 | Cannot place towers at top of map | shipped — panel-ghost fix (`5b744bc`) + the wave strip capped so it stops growing into a wall over the board (`d815c10`, closes B1) |
| 10 | Dawn/Dusk revive into three bosses | shipped — revive loop closed (`29382f0`, an escaped Guardian stays gone); the pair's kill order is now spelled out on the boss itself (`a0aff14`) |
| 11 | Vorkath tick-eating with Regenerating affix | shipped — `2c73dd2` (stalled regen heal dries up) |
| 12 | Infinite slayer points via task extend | shipped — `a1a9f1b` |
| 13 | Collection-log scrollbar drag moves the panel | shipped — `bad53ff` (all movable panels) |
| 14 | Delayed wave end — dead enemy keeps walking, HP spasms at a value | shipped — `3b775b8` (stall-breaker now runs on every enemy, not just bosses; same fix as #17) |
| 15 | UI scale >120% breaks layout (gold pile overlap) | shipped — `a3e3a58` + `1c41c4e` (scale capped to what the screen can actually hold) |
| 16 | FPS plummets at 5× with any panel open (wave 100+, many towers) | shipped — `0739532` (DPS meter refreshes on the wall-clock not the sim-clock, so 5× no longer forces ~5× the renders; `DpsView` memoised off gold/lives churn). The general single-`ui` full re-render for *other* panels is not speed-amplified and was left as-is |
| 17 | Regen fire giant targeting / softlock (dmg = regen, rooted by stuns) | shipped — `3b775b8` (same stall-breaker; the "only 5 towers can target it" was a symptom, not a cap) |
| 18 | Wizard staff-type picker draws *above* the tile, off-screen on the top 2 rows | shipped — `4b36706` (the picker measures itself and is clamped inside the board like the enemy panel, flipping below the tile near the top edge) |
| 19 | "Pricing bug" — tower cost rising above base | wontfix — intended: each same-type tower costs +15% than the last (`5d24d7d`, `economy.ts`) |
| 20 | Endless button does nothing after clearing the boss roster | shipped — `c0a328f` (`continueEndless()` flips `runPhase` to endless and closes the victory screen, resuming play) |

## Suggestions

| # | Title | Verdict |
|---|---|---|
| 1 | DPS Menu | shipped |
| 2 | "My ideas so far" (B0aty stream, long list) | shipped — incl. sound `fadeCombat`, boon/hazard tooltips, wave preview |
| 3 | Too easy | shipped — scaling pass |
| 4 | Space bar + copy/paste towers | shipped — Ctrl+C/V, Space starts wave |
| 5 | Roguelike feels like an idler | queued → **M4** roguelite reset-loop rework (design first) |
| 6 | Damage numbers for towers | shipped |
| 7 | Auto-run waves | shipped — Auto in the bottom bar |
| 8 | Overall feedback (wave 219) | shipped |
| 9 | Bosses beyond wave 60 | shipped |
| 10 | Hotkeys | shipped — U/S + rebuy 1-6 |
| 12 | TD-novice thoughts | shipped |
| 13 | Power scaling | shipped |
| 14 | Wave 300+ clear feedback | shipped |
| 16 | Accidentally selling towers | shipped — confirm step |
| 17 | Alongar mapa (Bruno) | queued → **M7** map selection / bigger map |
| 18 | Big TD fan, long list | complaints shipped (movable panels, tower niches, placement `d815c10`); **stays Planned** in NocoDB — two of its asks are still backlog: tower fusion (**M6**) and a gold sink (**M5**) |
| 19 | Improvements to balancing | shipped |
| 20 | Hotkeys | shipped |
| 21 | Upgrade All Towers | shipped — group auto-upgrade, cheapest-first |
| 22 | Boss Balance | shipped — Regen decay `db42ad0`, Mole `52fb016`, per-boss "how to kill" text `a0aff14`, multi-boss floor moved to wave 20 `6fdebeb` |
| 23 | Bosses again | shipped — `29382f0` (leak cost quoted on the enemy panel / wave preview / on leak; an escaped Guardian is never revived) |
| 24 | Too Easy not enough content | queued — scaling/Scurrius/weakness shipped, but the asks (more bosses/mobs, "levels", a GP store) are content backlog (→ M1 bosses, M5 gold sink) |
| 25 | See collection log when in card select | shipped — the offered alternative ("mark the cards I have not collected yet") is the NEW badge on never-kept draft cards (`08f9d6a`); the full in-draft log is not built, but the suggestion was an OR and the alt satisfies it |
| 26 | Game ideas (11-item list) | queued — one point landed (road no longer reads as a car lane, `8fd8f66`); the rest (tower-spam curb, branching upgrades, tower XP, hand-drawn maps, win condition, campaign, monster drops, resources, traps, melee-spawning towers) is a long design backlog spanning M4/M6/M7 |
| 27 | Ease of Late Game | queued — a real late-game break report (death-charge/vigor stacking dominates DPS; gold & slayer cost scale past card price; cards scale base faster than monster HP). Balance backlog, not yet resolved |
| 28 | Card Balance, and Suggestions | queued — rarity-by-strength (`d3ccf3c`) and Soul Eater as a mythic appetite (`bf84a88`) touch it, but the core (essence/slayer/range cards meaningless late, Soul Eater outclassing food, an equipment/foil-card layer) is open |
| 29 | Monster, Tower, and Prayer Balance | queued — headline ask shipped (mobs now weak to melee/ranged, `5f2014c`); the extras (slash/crush/stab & bolt/arrow tower types, a player special-energy bar) are backlog |
| 30 | Clue Scrolls | queued — net-new content (draggable clue map, dig spots, golden-tower rewards, 3rd-age gear). Ambitious, unbuilt |
| 31 | Local Login/Save | queued — only localStorage persists today; a portable/cross-device save is unbuilt (no backend) |
| 32 | Zoom In/Out | queued → map zoom was **explicitly deferred** during the map-uniqueness work; also overlaps **M7** |
| 33 | Card Categories | queued — `d3ccf3c` reworked card rarity by *power*, but this asks for consistency with OSRS item hierarchy (Pegasian vs Ranger, Kodai, twisted bow); the two framings can conflict, so it is not closed |
| 34 | Mega rares (scythe/shadow/tbow) + pick your own map + periodic level-swap w/ full refund | queued — top-tier weapon content + map selection (map picking overlaps **M7**); unbuilt |
| 35 | Construction (Mazing) mode | queued — a new mode parallel to Classic/Roguelite: waypoint routing + place-anywhere towers to build a maze, plus a cheap non-attacking wall tower. Design-first; a new pure-TD/roguelite-sibling mode. Unbuilt |

**Rejected outright (roster is CLOSED):** splitting magic/melee/ranged into several
towers · a chinchompa AoE tower · M10 utility/buff-support tower.

## Open work, in the user's priority order

1. **M3** protection-prayer boss/elite affix — *shipped* `3b03906`.
2. **M8** arrow-key grid placement — *shipped* `3b03906`.
3. **B1** — *shipped* `d815c10`: the next-wave strip grew one entry per enemy type, so a
   deep run turned it into a panel spanning the top of the board that ate the clicks
   meant for the ground under it. Capped at twelve entries + "+N more".
4. **Boss clarity & balance** (suggestions #22, #23, bug #10) — *shipped in full*:
   Dusk/Dawn revive loop, Mole dig frequency, visible HP-loss-on-leak, the per-boss
   "how to kill" text and the multi-boss floor (now wave 20).
5. **M1** new bosses (KBD/Graardor/Corp/Nex/Zuk/Verzik/Olm) — later.
6. **M2** combat achievements — *shipped in full* (`2c65334`..`2da53b4`): 40 tasks across the six
   real OSRS tiers (Easy…Grandmaster) as pure predicates over facts the engine records per run,
   evaluated at wave end and boss death, celebrated with the collection-log unlock popup and
   listed in a Collection Log **Achievements** tab. Clearing a tier grants its title — cosmetic
   only, it unlocks nothing. The new table is `lib/game/data/combat-achievements.ts`; the legacy
   `data/achievements.ts` (8 entries, legacy engine only) was deliberately left untouched.
7. **M4** roguelite reset-loop / meta rework — next to *plan*, not build.
8. **M6** tower fusion (must respect the closed roster) — think about soon.
9. **M7** map selection at start — queued.
10. **M5** a gold sink for **normal** mode — idea still wanted.
11. **A1** late-game victory + Endless + a curve that overtakes — *shipped*: the run is
    won by clearing the boss roster, Endless carries on past it (`c0a328f`), and the
    Victories tab keeps the record. Covers #27/#24/#29/#26.6. Siblings also shipped:
    **A2** cards & economy meaning — the draft re-weights toward cards that escape the
    damage soft-cap, and fireRate/range are capped alongside it (`systems/roguelite-draft.ts`,
    `systems/run-modifiers.ts`); **A3** tower spam / 5×-lag — the per-tower stat cache
    landed, the spatial grid was rejected (a fixed board makes it a regression).
12. **A4** New Game+ / harder difficulty tier — *shipped* (`eca2936`..`04e1a1b`): winning a
    tier unlocks the next, with tougher enemies and a tighter economy. The reward is the
    record, not power.

13. **V1** a victory-only currency + a permanent-unlock shop — *queued, design-first*
    (user's own idea, 2026-08-21). Winning a run should pay a currency that exists
    **only** for winning, spendable on *unique permanent* bonuses — one-off unlocks,
    not another rank of the essence upgrades. It has to stay distinct from **rune
    essence**, which is earned every wave, spent on repeatable upgrade ranks, and
    refundable at 90%; this one is rare, per-victory, and its purchases do not respec.
    OSRS-plausible names, in order of fit:
    **Zeal Tokens** (Soul Wars — paid for *winning* a wave-survival game, and Nomad's
    shop sells permanent things: imbues, XP, not gold) is the recommendation;
    **Castle Wars tickets** (also strictly win-to-earn, but its shop is cosmetic
    decorative armour, which suits a cosmetic-only ladder); **Pest Control points**
    (win-to-earn, buys Void — permanent gear, but reads as a grind currency).
    Unbuilt: the shop's contents are the actual design work, and the
    rewards must not inflate gold.

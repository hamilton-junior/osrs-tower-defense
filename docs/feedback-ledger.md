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

**Watermark (2026-07-19):** Suggestions ≤ **23**, Bug Reports ≤ **13**.

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
| 9 | Cannot place towers at top of map | shipped — panel-ghost fix (`5b744bc`); **recheck** B1 (report #18 "can't place past column ~13/14") |
| 10 | Dawn/Dusk revive into three bosses | shipped — revive loop closed (`29382f0`, an escaped Guardian stays gone); the pair's kill order is now spelled out on the boss itself (`a0aff14`) |
| 11 | Vorkath tick-eating with Regenerating affix | shipped — `2c73dd2` (stalled regen heal dries up) |
| 12 | Infinite slayer points via task extend | shipped — `a1a9f1b` |
| 13 | Collection-log scrollbar drag moves the panel | shipped — `bad53ff` (all movable panels) |

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
| 18 | Big TD fan, long list | mostly shipped; leftover **B1** placement recheck (bug #9 row) |
| 19 | Improvements to balancing | shipped |
| 20 | Hotkeys | shipped |
| 21 | Upgrade All Towers | shipped — group auto-upgrade, cheapest-first |
| 22 | Boss Balance | shipped — Regen decay `db42ad0`, Mole `52fb016`, per-boss "how to kill" text `a0aff14`, multi-boss floor moved to wave 20 `6fdebeb` |
| 23 | Bosses again | shipped — `29382f0` (leak cost quoted on the enemy panel / wave preview / on leak; an escaped Guardian is never revived) |

**Rejected outright (roster is CLOSED):** splitting magic/melee/ranged into several
towers · a chinchompa AoE tower · M10 utility/buff-support tower.

## Open work, in the user's priority order

1. **M3** protection-prayer boss/elite affix — *shipped* `3b03906`.
2. **M8** arrow-key grid placement — *shipped* `3b03906`.
3. **B1** — verify last (bug #9 / suggestion #18).
4. **Boss clarity & balance** (suggestions #22, #23, bug #10) — *shipped in full*:
   Dusk/Dawn revive loop, Mole dig frequency, visible HP-loss-on-leak, the per-boss
   "how to kill" text and the multi-boss floor (now wave 20).
5. **M1** new bosses (KBD/Graardor/Corp/Nex/Zuk/Verzik/Olm) — later.
6. **M2** combat achievements (`data/achievements.ts` exists, not wired into the new core) — later.
7. **M4** roguelite reset-loop / meta rework — next to *plan*, not build.
8. **M6** tower fusion (must respect the closed roster) — think about soon.
9. **M7** map selection at start — queued.
10. **M5** a gold sink for **normal** mode — idea still wanted.
